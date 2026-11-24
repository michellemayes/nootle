//! The nootle.ai account and Nootle Pro: the device token, the account last
//! fetched from nootle.ai, and the install's Pro trial. See
//! docs/plans/2026-11-24-paid-plans.md.
//!
//! Gating is a convenience, not DRM: the app is open source. Pro holds for
//! [`OFFLINE_GRACE_DAYS`] after the last successful fetch, so a Mac that's
//! offline for a while keeps working.

use aes_gcm::aead::rand_core::RngCore;
use aes_gcm::aead::OsRng;
use base64::engine::general_purpose::URL_SAFE_NO_PAD as BASE64URL;
use base64::Engine;
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager};

use crate::commands::DbState;
use crate::db::Database;

const SITE: &str = "https://nootle.ai";
const TOKEN_SETTING: &str = "account_token";
const SUMMARY_SETTING: &str = "account_summary";
const FETCHED_AT_SETTING: &str = "account_fetched_at";
const PENDING_STATE_SETTING: &str = "account_pending_state";
const FIRST_RUN_SETTING: &str = "first_run_at";
const TRIAL_DAYS_SETTING: &str = "trial_days";

pub const TRIAL_DAYS: i64 = 14;
/// Installs that already had meetings when Pro arrived.
pub const EXISTING_USER_TRIAL_DAYS: i64 = 30;
pub const OFFLINE_GRACE_DAYS: i64 = 14;
const PENDING_STATE_MINUTES: i64 = 30;
const REFRESH_EVERY: std::time::Duration = std::time::Duration::from_secs(12 * 60 * 60);
pub const CHANGED_EVENT: &str = "account-changed";

static LAST_REFRESH_FAILED: AtomicBool = AtomicBool::new(false);

/// What the account has bought, as nootle.ai's `Plan`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub tier: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub interval: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub renews_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ends_at: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Referral {
    pub code: String,
    pub url: String,
    #[serde(default)]
    pub joined: u32,
    #[serde(default)]
    pub paid: u32,
    #[serde(default)]
    pub months_earned: u32,
}

/// `GET /api/account`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountSummary {
    pub email: String,
    pub plan: Plan,
    pub pro: bool,
    #[serde(default)]
    pub pro_until: Option<String>,
    #[serde(default)]
    pub bonus_pro_until: Option<String>,
    pub referral: Referral,
    #[serde(default)]
    pub manage_url: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Source {
    Plan,
    Bonus,
    Trial,
}

/// Everything Pro depends on, read from settings in one go.
#[derive(Debug, Clone, Default)]
pub struct Stored {
    pub signed_in: bool,
    pub summary: Option<AccountSummary>,
    pub fetched_at: Option<DateTime<Utc>>,
    pub first_run_at: Option<DateTime<Utc>>,
    pub trial_days: i64,
}

fn parse_time(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|t| t.with_timezone(&Utc))
}

impl Stored {
    pub fn load(db: &Database) -> Self {
        let get = |key| db.get_setting(key).ok().flatten().filter(|v| !v.is_empty());
        Self {
            signed_in: get(TOKEN_SETTING).is_some(),
            summary: get(SUMMARY_SETTING).and_then(|s| serde_json::from_str(&s).ok()),
            fetched_at: get(FETCHED_AT_SETTING).and_then(|t| parse_time(&t)),
            first_run_at: get(FIRST_RUN_SETTING).and_then(|t| parse_time(&t)),
            trial_days: get(TRIAL_DAYS_SETTING)
                .and_then(|d| d.parse().ok())
                .unwrap_or(TRIAL_DAYS),
        }
    }

    /// When the trial ends. Before the first run is recorded (the CLI, tests)
    /// the trial counts as starting now.
    pub fn trial_ends_at(&self, now: DateTime<Utc>) -> DateTime<Utc> {
        self.first_run_at.unwrap_or(now) + Duration::days(self.trial_days)
    }

    /// Pro from the account: bought or earned, fetched recently enough, and
    /// not past its end.
    fn account_source(&self, now: DateTime<Utc>) -> Option<Source> {
        let summary = self.summary.as_ref().filter(|s| self.signed_in && s.pro)?;
        let fresh = self
            .fetched_at
            .is_some_and(|t| now - t <= Duration::days(OFFLINE_GRACE_DAYS));
        let ended = summary
            .pro_until
            .as_deref()
            .and_then(parse_time)
            .is_some_and(|until| until <= now);
        if !fresh || ended {
            return None;
        }
        let plan_active = summary.plan.tier == "pro"
            && !matches!(summary.plan.status.as_deref(), Some("revoked"));
        Some(if plan_active {
            Source::Plan
        } else {
            Source::Bonus
        })
    }

    pub fn source(&self, now: DateTime<Utc>) -> Option<Source> {
        self.account_source(now)
            .or_else(|| (now < self.trial_ends_at(now)).then_some(Source::Trial))
    }

    pub fn is_pro(&self, now: DateTime<Utc>) -> bool {
        self.source(now).is_some()
    }

    /// Whole days left, rounded up, so the last day reads "1 day".
    pub fn trial_days_left(&self, now: DateTime<Utc>) -> i64 {
        let left = self.trial_ends_at(now) - now;
        if left <= Duration::zero() {
            0
        } else {
            (left.num_seconds() + 86_399) / 86_400
        }
    }
}

/// Whether Pro features may run: a Pro account (cached for up to
/// [`OFFLINE_GRACE_DAYS`] offline) or an unexpired trial.
pub fn is_pro(db: &Database) -> bool {
    Stored::load(db).is_pro(Utc::now())
}

/// Pro that's been paid for, through a plan or invites, as opposed to the
/// trial.
pub fn is_paid_pro(db: &Database) -> bool {
    Stored::load(db)
        .source(Utc::now())
        .is_some_and(|s| s != Source::Trial)
}

/// Refuses a Pro feature the user asked for, naming it.
pub fn require_pro(db: &Database, feature: &str) -> Result<(), String> {
    if is_pro(db) {
        Ok(())
    } else {
        Err(format!(
            "{feature} needs Nootle Pro. Upgrade in Settings → Plan."
        ))
    }
}

/// Records the trial's start the first time this version runs: 30 days for
/// installs that already had meetings, 14 for new ones.
pub fn record_first_run(db: &Database) -> crate::error::Result<()> {
    if db.get_setting(FIRST_RUN_SETTING)?.is_some() {
        return Ok(());
    }
    let had_meetings = !db.list_meetings(None, true, None)?.is_empty();
    let days = if had_meetings {
        EXISTING_USER_TRIAL_DAYS
    } else {
        TRIAL_DAYS
    };
    db.set_setting(TRIAL_DAYS_SETTING, &days.to_string())?;
    db.set_setting(FIRST_RUN_SETTING, &Utc::now().to_rfc3339())?;
    Ok(())
}

/// What the app shows about the account and plan.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountStatus {
    pub signed_in: bool,
    pub email: Option<String>,
    pub pro: bool,
    pub source: Option<Source>,
    pub plan: Option<Plan>,
    pub trial_ends_at: String,
    pub trial_days_left: i64,
    pub pro_until: Option<String>,
    pub referral: Option<Referral>,
    pub offline: bool,
}

pub fn status_at(stored: &Stored, now: DateTime<Utc>, offline: bool) -> AccountStatus {
    let summary = stored.summary.as_ref().filter(|_| stored.signed_in);
    AccountStatus {
        signed_in: stored.signed_in,
        email: summary.map(|s| s.email.clone()),
        pro: stored.is_pro(now),
        source: stored.source(now),
        plan: summary.map(|s| s.plan.clone()),
        trial_ends_at: stored.trial_ends_at(now).to_rfc3339(),
        trial_days_left: stored.trial_days_left(now),
        pro_until: summary.and_then(|s| s.pro_until.clone()),
        referral: summary.map(|s| s.referral.clone()),
        offline: stored.signed_in && offline,
    }
}

pub fn status(db: &Database) -> AccountStatus {
    status_at(
        &Stored::load(db),
        Utc::now(),
        LAST_REFRESH_FAILED.load(Ordering::Relaxed),
    )
}

/// The referral code to attach to shares, when signed in.
pub fn referral_code(db: &Database) -> Option<String> {
    let stored = Stored::load(db);
    stored
        .summary
        .filter(|_| stored.signed_in)
        .map(|s| s.referral.code)
        .filter(|c| !c.is_empty())
}

fn clear(db: &Database) -> crate::error::Result<()> {
    for key in [TOKEN_SETTING, SUMMARY_SETTING, FETCHED_AT_SETTING] {
        db.delete_setting(key)?;
    }
    LAST_REFRESH_FAILED.store(false, Ordering::Relaxed);
    Ok(())
}

/// Fetches the account from nootle.ai and caches it. `Ok(None)` when signed
/// out; a rejected token signs this Mac out.
pub async fn refresh(db: &Database) -> Result<Option<AccountSummary>, String> {
    let Some(token) = db
        .get_setting(TOKEN_SETTING)
        .map_err(|e| e.to_string())?
        .filter(|t| !t.is_empty())
    else {
        return Ok(None);
    };
    let result = fetch(db, &token).await;
    LAST_REFRESH_FAILED.store(result.is_err(), Ordering::Relaxed);
    match result {
        Ok(Some(summary)) => {
            let json = serde_json::to_string(&summary).map_err(|e| e.to_string())?;
            db.set_setting(SUMMARY_SETTING, &json)
                .map_err(|e| e.to_string())?;
            db.set_setting(FETCHED_AT_SETTING, &Utc::now().to_rfc3339())
                .map_err(|e| e.to_string())?;
            Ok(Some(summary))
        }
        Ok(None) => {
            clear(db).map_err(|e| e.to_string())?;
            Err("nootle.ai signed this Mac out. Sign in again.".into())
        }
        Err(e) => Err(e),
    }
}

/// `Ok(None)` when nootle.ai no longer accepts the token.
async fn fetch(db: &Database, token: &str) -> Result<Option<AccountSummary>, String> {
    crate::llm::ensure_may_send(db, "nootle.ai")?;
    let resp = crate::http::CLIENT
        .get(format!("{SITE}/api/account"))
        .header("User-Agent", "Nootle")
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("Couldn't reach nootle.ai: {e}"))?;
    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Ok(None);
    }
    if !resp.status().is_success() {
        return Err(format!(
            "nootle.ai couldn't load your account ({}).",
            resp.status()
        ));
    }
    resp.json()
        .await
        .map(Some)
        .map_err(|e| format!("Unexpected reply from nootle.ai: {e}"))
}

fn new_state() -> String {
    let mut bytes = [0u8; 24];
    OsRng.fill_bytes(&mut bytes);
    BASE64URL.encode(bytes)
}

fn save_pending_state(db: &Database, state: &str, now: DateTime<Utc>) -> crate::error::Result<()> {
    db.set_setting(
        PENDING_STATE_SETTING,
        &format!("{state} {}", now.to_rfc3339()),
    )
}

/// Whether `given` is the sign-in this Mac started, recently. It's used up
/// either way, so a link can't be replayed.
fn take_pending_state(db: &Database, given: &str, now: DateTime<Utc>) -> bool {
    let Some(stored) = db.get_setting(PENDING_STATE_SETTING).ok().flatten() else {
        return false;
    };
    let _ = db.delete_setting(PENDING_STATE_SETTING);
    let Some((state, started)) = stored.split_once(' ') else {
        return false;
    };
    let recent =
        parse_time(started).is_some_and(|t| now - t <= Duration::minutes(PENDING_STATE_MINUTES));
    recent
        && state.len() == given.len()
        && state
            .bytes()
            .zip(given.bytes())
            .fold(0u8, |acc, (a, b)| acc | (a ^ b))
            == 0
}

fn open_url(app: &AppHandle, url: &str) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

fn changed(app: &AppHandle) {
    let _ = app.emit(CHANGED_EVENT, ());
}

/// Handles `nootle://account/connected?token=…&state=…`, the end of signing
/// in on nootle.ai. Works without URL control, but only for the sign-in this
/// Mac started.
pub async fn handle_connected(app: AppHandle, url: &url::Url) {
    let db = app.state::<DbState>().inner().clone();
    let token = crate::remote::query_value(url, "token");
    let state = crate::remote::query_value(url, "state").unwrap_or_default();
    let Some(token) = token.filter(|_| take_pending_state(&db, &state, Utc::now())) else {
        tracing::warn!("account: ignoring a sign-in link this Mac didn't start");
        return;
    };
    if let Err(e) = db.set_setting(TOKEN_SETTING, &token) {
        tracing::warn!("account: couldn't save the device token: {e}");
        return;
    }
    if let Err(e) = refresh(&db).await {
        tracing::warn!("account: refresh after sign-in failed: {e}");
    }
    changed(&app);
    crate::show_main_window(&app);
}

/// Refreshes the account at launch and every 12 hours while signed in.
pub fn spawn_refresher(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            let db = app.state::<DbState>().inner().clone();
            if Stored::load(&db).signed_in {
                if let Err(e) = refresh(&db).await {
                    tracing::info!("account: refresh failed: {e}");
                }
                changed(&app);
            }
            tokio::time::sleep(REFRESH_EVERY).await;
        }
    });
}

#[tauri::command(async)]
pub fn account_status(db: tauri::State<'_, DbState>) -> AccountStatus {
    status(&db)
}

#[tauri::command(async)]
pub fn account_begin_sign_in(app: AppHandle, db: tauri::State<'_, DbState>) -> Result<(), String> {
    let state = new_state();
    save_pending_state(&db, &state, Utc::now()).map_err(|e| e.to_string())?;
    open_url(&app, &format!("{SITE}/signin?app=1&state={state}"))
}

#[tauri::command]
pub async fn account_refresh(
    app: AppHandle,
    db: tauri::State<'_, DbState>,
) -> Result<AccountStatus, String> {
    let result = refresh(&db).await;
    changed(&app);
    result.map(|_| status(&db))
}

#[tauri::command(async)]
pub fn account_sign_out(app: AppHandle, db: tauri::State<'_, DbState>) -> Result<(), String> {
    clear(&db).map_err(|e| e.to_string())?;
    changed(&app);
    Ok(())
}

#[tauri::command(async)]
pub fn account_open_checkout(app: AppHandle, plan: String) -> Result<(), String> {
    crate::ops::validate_one_of("plan", &plan, &["monthly", "yearly", "lifetime"])
        .map_err(|e| e.to_string())?;
    open_url(&app, &format!("{SITE}/api/checkout?plan={plan}"))
}

#[tauri::command(async)]
pub fn account_open_billing(app: AppHandle) -> Result<(), String> {
    open_url(&app, &format!("{SITE}/account"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(s: &str) -> DateTime<Utc> {
        parse_time(s).unwrap()
    }

    fn summary(pro: bool, tier: &str, pro_until: Option<&str>) -> AccountSummary {
        AccountSummary {
            email: "sam@example.com".into(),
            plan: Plan {
                tier: tier.into(),
                ..Default::default()
            },
            pro,
            pro_until: pro_until.map(Into::into),
            referral: Referral {
                code: "ABCD2345".into(),
                url: "https://nootle.ai/r/ABCD2345".into(),
                ..Default::default()
            },
            ..Default::default()
        }
    }

    fn trial(first_run: &str, days: i64) -> Stored {
        Stored {
            first_run_at: Some(at(first_run)),
            trial_days: days,
            ..Default::default()
        }
    }

    #[test]
    fn trial_runs_its_length_then_ends() {
        let s = trial("2026-11-01T00:00:00Z", 14);
        assert_eq!(s.source(at("2026-11-01T00:00:00Z")), Some(Source::Trial));
        assert_eq!(s.trial_days_left(at("2026-11-01T00:00:00Z")), 14);
        assert_eq!(s.trial_days_left(at("2026-11-14T12:00:00Z")), 1);
        assert!(s.is_pro(at("2026-11-14T23:59:59Z")));
        assert!(!s.is_pro(at("2026-11-15T00:00:00Z")));
        assert_eq!(s.trial_days_left(at("2026-12-01T00:00:00Z")), 0);

        let existing = trial("2026-11-01T00:00:00Z", 30);
        assert!(existing.is_pro(at("2026-11-30T00:00:00Z")));
    }

    #[test]
    fn unrecorded_first_run_counts_as_a_fresh_trial() {
        let s = Stored {
            trial_days: TRIAL_DAYS,
            ..Default::default()
        };
        assert_eq!(s.source(at("2030-01-01T00:00:00Z")), Some(Source::Trial));
    }

    #[test]
    fn pro_account_holds_offline_for_the_grace_period() {
        let mut s = trial("2026-01-01T00:00:00Z", 14);
        s.signed_in = true;
        s.summary = Some(summary(true, "pro", None));
        s.fetched_at = Some(at("2026-11-01T00:00:00Z"));
        assert_eq!(s.source(at("2026-11-10T00:00:00Z")), Some(Source::Plan));
        assert!(s.is_pro(at("2026-11-15T00:00:00Z")));
        assert!(!s.is_pro(at("2026-11-15T00:00:01Z")));
    }

    #[test]
    fn pro_ends_at_pro_until() {
        let mut s = trial("2026-01-01T00:00:00Z", 14);
        s.signed_in = true;
        s.summary = Some(summary(true, "free", Some("2026-11-20T00:00:00Z")));
        s.fetched_at = Some(at("2026-11-18T00:00:00Z"));
        assert_eq!(s.source(at("2026-11-19T00:00:00Z")), Some(Source::Bonus));
        assert!(!s.is_pro(at("2026-11-20T00:00:00Z")));
    }

    #[test]
    fn free_or_signed_out_accounts_fall_back_to_the_trial() {
        let mut s = trial("2026-11-20T00:00:00Z", 14);
        s.signed_in = true;
        s.summary = Some(summary(false, "free", None));
        s.fetched_at = Some(at("2026-11-21T00:00:00Z"));
        assert_eq!(s.source(at("2026-11-22T00:00:00Z")), Some(Source::Trial));
        assert!(!s.is_pro(at("2026-12-10T00:00:00Z")));

        s.summary = Some(summary(true, "pro", None));
        s.signed_in = false;
        assert!(!s.is_pro(at("2026-12-10T00:00:00Z")));
    }

    #[test]
    fn only_a_plan_or_bonus_counts_as_paid() {
        let db = Database::new_in_memory().unwrap();
        assert!(is_pro(&db) && !is_paid_pro(&db), "trial");
        db.set_setting(TOKEN_SETTING, "tok").unwrap();
        db.set_setting(
            SUMMARY_SETTING,
            &serde_json::to_string(&summary(true, "free", None)).unwrap(),
        )
        .unwrap();
        db.set_setting(FETCHED_AT_SETTING, &Utc::now().to_rfc3339())
            .unwrap();
        assert!(is_paid_pro(&db), "referral bonus");
    }

    #[test]
    fn status_reports_the_account_only_when_signed_in() {
        let mut s = trial("2026-11-20T00:00:00Z", 14);
        s.summary = Some(summary(true, "pro", None));
        s.fetched_at = Some(at("2026-11-21T00:00:00Z"));
        let now = at("2026-11-22T00:00:00Z");
        let out = status_at(&s, now, true);
        assert!(!out.signed_in && out.email.is_none() && out.referral.is_none());
        assert!(!out.offline);
        assert_eq!(out.source, Some(Source::Trial));

        s.signed_in = true;
        let out = status_at(&s, now, true);
        assert_eq!(out.email.as_deref(), Some("sam@example.com"));
        assert_eq!(out.source, Some(Source::Plan));
        assert!(out.offline);
        let json = serde_json::to_value(&out).unwrap();
        assert_eq!(json["source"], "plan");
        assert_eq!(json["trialDaysLeft"], 12);
    }

    #[test]
    fn summary_parses_nootle_ai_json() {
        let parsed: AccountSummary = serde_json::from_str(
            r#"{"email":"a@b.co","plan":{"tier":"pro","interval":"yearly","status":"active","renewsAt":"2027-01-01T00:00:00Z"},
                "pro":true,"proUntil":null,"bonusProUntil":null,
                "referral":{"code":"ABCD2345","url":"https://nootle.ai/r/ABCD2345","joined":3,"paid":1,"monthsEarned":1},
                "manageUrl":"https://nootle.ai/account"}"#,
        )
        .unwrap();
        assert_eq!(parsed.plan.interval.as_deref(), Some("yearly"));
        assert_eq!(parsed.referral.months_earned, 1);
    }

    #[test]
    fn first_run_gives_existing_installs_a_longer_trial() {
        let db = Database::new_in_memory().unwrap();
        record_first_run(&db).unwrap();
        assert_eq!(Stored::load(&db).trial_days, TRIAL_DAYS);

        let db = Database::new_in_memory().unwrap();
        db.create_meeting(crate::db::NewMeeting {
            title: "Standup".into(),
            calendar_event_id: None,
            template_id: None,
        })
        .unwrap();
        record_first_run(&db).unwrap();
        let first = Stored::load(&db);
        assert_eq!(first.trial_days, EXISTING_USER_TRIAL_DAYS);
        record_first_run(&db).unwrap();
        assert_eq!(Stored::load(&db).first_run_at, first.first_run_at);
    }

    #[test]
    fn sign_in_needs_the_pending_state_once_and_soon() {
        let db = Database::new_in_memory().unwrap();
        let now = at("2026-11-24T10:00:00Z");
        assert!(!take_pending_state(&db, "x", now));

        let state = new_state();
        assert_eq!(state.len(), 32);
        save_pending_state(&db, &state, now).unwrap();
        assert!(!take_pending_state(&db, "wrong", now));
        assert!(!take_pending_state(&db, &state, now), "used up by a miss");

        save_pending_state(&db, &state, now).unwrap();
        assert!(take_pending_state(&db, &state, now + Duration::minutes(5)));
        assert!(!take_pending_state(&db, &state, now), "used once");

        save_pending_state(&db, &state, now).unwrap();
        assert!(!take_pending_state(&db, &state, now + Duration::hours(1)));
    }

    #[test]
    fn sign_out_clears_the_account() {
        let db = Database::new_in_memory().unwrap();
        db.set_setting(TOKEN_SETTING, "tok").unwrap();
        db.set_setting(
            SUMMARY_SETTING,
            &serde_json::to_string(&summary(true, "pro", None)).unwrap(),
        )
        .unwrap();
        assert_eq!(referral_code(&db).as_deref(), Some("ABCD2345"));
        clear(&db).unwrap();
        let s = Stored::load(&db);
        assert!(!s.signed_in && s.summary.is_none());
        assert_eq!(referral_code(&db), None);
    }
}

//! "Continue in…": hands a meeting to another AI app as a first message, so
//! you can keep talking about it there. Claude by default; ChatGPT, Codex,
//! Perplexity, or any app that takes a prompt in a link.

use crate::db::Database;
use crate::export::meeting_as_markdown;
use anyhow::{anyhow, Result};

/// Which app: one of `apps()`. Unset means Claude.
pub const APP_SETTING: &str = "handoff_app";
/// A custom app's name, shown on its button.
pub const NAME_SETTING: &str = "handoff_name";
/// A custom app's link, with `PROMPT` where the message goes.
pub const URL_SETTING: &str = "handoff_url";
/// An emoji to show instead of the app's logo; empty for the logo.
pub const ICON_SETTING: &str = "handoff_icon";

const PROMPT: &str = "{prompt}";
const CUSTOM: &str = "custom";

pub const MAX_NAME_CHARS: usize = 40;
pub const MAX_ICON_CHARS: usize = 16;
const MAX_URL_CHARS: usize = 500;

/// Longest prompt put in a link. Percent-encoding can triple it, and links
/// much past ~16 KB get refused before they reach the app.
const PROMPT_MAX_CHARS: usize = 5_000;

/// A built-in app: its link with `PROMPT` where the message goes, and what
/// to call it once opened.
struct Preset {
    id: &'static str,
    name: &'static str,
    url: &'static str,
    opened: &'static str,
    desktop: Option<Desktop>,
}

/// A desktop app to prefer over the web link when it's installed.
struct Desktop {
    bundle: &'static str,
    url: &'static str,
    opened: &'static str,
}

const PRESETS: &[Preset] = &[
    Preset {
        id: "claude",
        name: "Claude",
        url: "https://claude.ai/new?q={prompt}",
        opened: "claude.ai",
        // The desktop app handles claude:// links to claude.ai pages.
        desktop: Some(Desktop {
            bundle: "Claude.app",
            url: "claude://claude.ai/new?q={prompt}",
            opened: "the Claude app",
        }),
    },
    Preset {
        id: "chatgpt",
        name: "ChatGPT",
        url: "https://chatgpt.com/?q={prompt}",
        opened: "ChatGPT",
        desktop: None,
    },
    // Codex's documented deep link; it fills the composer without sending.
    Preset {
        id: "codex",
        name: "Codex",
        url: "codex://new?prompt={prompt}",
        opened: "Codex",
        desktop: None,
    },
    Preset {
        id: "perplexity",
        name: "Perplexity",
        url: "https://www.perplexity.ai/search?q={prompt}",
        opened: "Perplexity",
        desktop: None,
    },
];

/// Every value `APP_SETTING` takes.
pub fn apps() -> Vec<&'static str> {
    PRESETS.iter().map(|p| p.id).chain([CUSTOM]).collect()
}

/// Checks a custom app's link: a URL with `{prompt}` in it, and not one that
/// runs or reads something locally.
pub fn validate_url(url: &str) -> Result<()> {
    if url.is_empty() {
        return Ok(());
    }
    crate::ops::max_chars("link", url, MAX_URL_CHARS)?;
    if !url.contains(PROMPT) {
        return Err(anyhow!("Put {PROMPT} in the link where the message goes"));
    }
    let parsed = url::Url::parse(&url.replace(PROMPT, "x"))
        .map_err(|_| anyhow!("'{url}' isn't a link, e.g. https://example.com/chat?q={PROMPT}"))?;
    if ["javascript", "file", "data", "vbscript"].contains(&parsed.scheme()) {
        return Err(anyhow!("A {}: link can't be used", parsed.scheme()));
    }
    Ok(())
}

/// The chosen app: a preset, or the custom app's name and link.
#[derive(Debug, PartialEq)]
enum Target {
    Preset(&'static str),
    Custom { name: String, url: String },
}

fn chosen_app(db: &Database) -> Result<Target, String> {
    let get = |key| db.get_setting(key).map_err(|e| e.to_string());
    let app = get(APP_SETTING)?.unwrap_or_else(|| "claude".into());
    if let Some(preset) = PRESETS.iter().find(|p| p.id == app) {
        return Ok(Target::Preset(preset.id));
    }
    let url = get(URL_SETTING)?
        .filter(|u| !u.is_empty())
        .ok_or("Add a link for your app in Settings → Integrations → Continue in")?;
    let name = get(NAME_SETTING)?
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| "your app".into());
    Ok(Target::Custom { name, url })
}

/// A link template with the prompt filled in, encoded so it survives any
/// scheme (spaces as %20, which custom schemes don't always read as +).
fn fill(template: &str, prompt: &str) -> String {
    let encoded: String = url::form_urlencoded::byte_serialize(prompt.as_bytes()).collect();
    template.replace(PROMPT, &encoded.replace('+', "%20"))
}

/// What `continue_in_app` did: where it opened, and the whole meeting as
/// Markdown when the link couldn't hold all of it, for the clipboard.
#[derive(Debug, serde::Serialize)]
pub struct Handoff {
    pub opened: String,
    pub rest: Option<String>,
}

/// Opens the chosen app with a first message about the meeting, in a
/// preset's desktop app when that's installed.
pub fn continue_in_app(
    db: &Database,
    meeting_id: &str,
    open: impl Fn(&str) -> Result<(), String>,
) -> Result<Handoff, String> {
    let target = chosen_app(db)?;
    let (name, url, opened, desktop) = match &target {
        Target::Preset(id) => {
            let p = PRESETS.iter().find(|p| p.id == *id).expect("a preset id");
            (p.name, p.url, p.opened, p.desktop.as_ref())
        }
        Target::Custom { name, url } => (name.as_str(), url.as_str(), name.as_str(), None),
    };
    crate::llm::ensure_may_send(db, name)?;
    let prompt = meeting_prompt(db, meeting_id)?;
    let opened = match desktop.filter(|d| app_installed(d.bundle)) {
        Some(d) if open(&fill(d.url, &prompt.prompt)).is_ok() => d.opened,
        _ => {
            open(&fill(url, &prompt.prompt)).map_err(|e| format!("Couldn't open {name}: {e}"))?;
            opened
        }
    };
    Ok(Handoff {
        opened: opened.to_string(),
        rest: prompt.rest,
    })
}

/// A first message about this meeting: its notes, plus as much of the
/// transcript as fits in a link. `rest` is the whole meeting when any of it
/// was left out, so the caller can offer it another way.
#[derive(Debug)]
struct MeetingPrompt {
    prompt: String,
    rest: Option<String>,
}

fn meeting_prompt(db: &Database, meeting_id: &str) -> Result<MeetingPrompt, String> {
    let markdown = |include_transcript| {
        meeting_as_markdown(db, meeting_id, include_transcript).map_err(|e| e.to_string())
    };
    build_prompt(markdown(true)?, || markdown(false))
}

fn build_prompt(
    full: String,
    notes: impl FnOnce() -> Result<String, String>,
) -> Result<MeetingPrompt, String> {
    let intro = "I'd like to keep discussing this meeting. Here are my notes from Nootle:\n\n";
    let outro = "\n\nRead them, then let's talk it through.";
    let budget = PROMPT_MAX_CHARS.saturating_sub(intro.chars().count() + outro.chars().count());
    if full.chars().nth(budget).is_none() {
        return Ok(MeetingPrompt {
            prompt: format!("{intro}{}{outro}", full.trim()),
            rest: None,
        });
    }
    let trimmed = "\n\n…(trimmed)";
    let room = budget.saturating_sub(trimmed.chars().count());
    let body = crate::ops::truncate_at_word_boundary(&notes()?, room, trimmed);
    Ok(MeetingPrompt {
        prompt: format!("{intro}{body}{outro}"),
        rest: Some(full),
    })
}

/// Whether a macOS app bundle is in /Applications or ~/Applications.
fn app_installed(bundle: &str) -> bool {
    let user_apps = dirs::home_dir().map(|h| h.join("Applications").join(bundle));
    std::iter::once(std::path::Path::new("/Applications").join(bundle))
        .chain(user_apps)
        .any(|p| p.exists())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unused_notes() -> Result<String, String> {
        panic!("notes are only built when the meeting doesn't fit")
    }

    #[test]
    fn prompt_keeps_a_short_meeting_whole() {
        let full = "# Sync\n\n## Transcript\n\nhi\n".to_string();
        let p = build_prompt(full, unused_notes).unwrap();
        assert!(p.rest.is_none());
        assert!(p.prompt.contains("## Transcript"), "{}", p.prompt);
        assert!(p
            .prompt
            .starts_with("I'd like to keep discussing this meeting"));
    }

    #[test]
    fn prompt_drops_a_long_transcript_and_fits_the_link() {
        let full = format!("# Sync\n\n## Transcript\n\n{}", "word ".repeat(5_000));
        let notes = format!("# Sync\n\n## Notes\n\n{}", "note ".repeat(5_000));
        let p = build_prompt(full.clone(), || Ok(notes)).unwrap();
        assert_eq!(p.rest, Some(full));
        assert!(!p.prompt.contains("## Transcript"));
        assert!(p.prompt.contains("…(trimmed)"));
        assert!(p.prompt.chars().count() <= PROMPT_MAX_CHARS);
    }

    #[test]
    fn fill_encodes_the_prompt_for_any_scheme() {
        let link = fill("codex://new?prompt={prompt}", "a b+c&d=é");
        assert_eq!(link, "codex://new?prompt=a%20b%2Bc%26d%3D%C3%A9");
    }

    #[test]
    fn every_preset_link_has_a_prompt_slot() {
        for p in PRESETS {
            validate_url(p.url).unwrap();
            if let Some(d) = &p.desktop {
                validate_url(d.url).unwrap();
            }
        }
    }

    #[test]
    fn custom_links_need_a_prompt_slot_and_a_safe_scheme() {
        assert!(validate_url("").is_ok());
        assert!(validate_url("https://example.com/chat?q={prompt}").is_ok());
        assert!(validate_url("myapp://new?text={prompt}").is_ok());
        assert!(validate_url("https://example.com/chat").is_err());
        assert!(validate_url("javascript:alert('{prompt}')").is_err());
        assert!(validate_url("file:///tmp/{prompt}").is_err());
        assert!(validate_url("not a link {prompt}").is_err());
    }

    #[test]
    fn chosen_app_defaults_to_claude_and_needs_a_custom_link() {
        let db = Database::new_in_memory().unwrap();
        assert_eq!(chosen_app(&db).unwrap(), Target::Preset("claude"));
        db.set_setting(APP_SETTING, "codex").unwrap();
        assert_eq!(chosen_app(&db).unwrap(), Target::Preset("codex"));
        db.set_setting(APP_SETTING, CUSTOM).unwrap();
        assert!(chosen_app(&db).is_err());
        db.set_setting(URL_SETTING, "https://example.com/?q={prompt}")
            .unwrap();
        db.set_setting(NAME_SETTING, "Le Chat").unwrap();
        assert_eq!(
            chosen_app(&db).unwrap(),
            Target::Custom {
                name: "Le Chat".into(),
                url: "https://example.com/?q={prompt}".into()
            }
        );
    }

    #[test]
    fn nothing_is_handed_off_in_local_only_mode() {
        let db = Database::new_in_memory().unwrap();
        db.set_setting(crate::llm::LOCAL_ONLY_SETTING, "true")
            .unwrap();
        let opened = continue_in_app(&db, "m", |_| panic!("nothing opens in local-only mode"));
        assert!(opened.is_err());
    }
}

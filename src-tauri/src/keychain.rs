/// Keychain helper module for secure API key storage via the macOS Keychain.
///
/// Uses service name "com.nootle.desktop" and the provider name as the username,
/// so each provider occupies a distinct Keychain item.
use crate::error::{NootleError, Result};

const SERVICE: &str = "com.nootle.desktop";

/// Known LLM/integration providers whose keys may be stored in the Keychain.
pub const KNOWN_PROVIDERS: &[&str] = &[
    "openai",
    "anthropic",
    "google",
    "groq",
    "openrouter",
    "linear",
];

/// Store (or overwrite) a secret `key` for the given `provider`.
pub fn store_key(provider: &str, key: &str) -> Result<()> {
    let entry = keyring::Entry::new(SERVICE, provider)
        .map_err(|e| NootleError::Other(format!("Keychain entry error for '{provider}': {e}")))?;
    entry
        .set_password(key)
        .map_err(|e| NootleError::Other(format!("Keychain write error for '{provider}': {e}")))?;
    Ok(())
}

/// Retrieve the stored secret for `provider`, returning `None` if no entry exists.
pub fn get_key(provider: &str) -> Result<Option<String>> {
    let entry = keyring::Entry::new(SERVICE, provider)
        .map_err(|e| NootleError::Other(format!("Keychain entry error for '{provider}': {e}")))?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(NootleError::Other(format!(
            "Keychain read error for '{provider}': {e}"
        ))),
    }
}

/// Delete the Keychain entry for `provider`. Silently succeeds if no entry exists.
pub fn delete_key(provider: &str) -> Result<()> {
    let entry = keyring::Entry::new(SERVICE, provider)
        .map_err(|e| NootleError::Other(format!("Keychain entry error for '{provider}': {e}")))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(NootleError::Other(format!(
            "Keychain delete error for '{provider}': {e}"
        ))),
    }
}

/// Return the subset of [`KNOWN_PROVIDERS`] that currently have a key stored in
/// the Keychain.  Providers that cannot be queried are silently skipped.
pub fn list_providers() -> Result<Vec<String>> {
    let mut found = Vec::new();
    for &provider in KNOWN_PROVIDERS {
        match get_key(provider) {
            Ok(Some(_)) => found.push(provider.to_string()),
            Ok(None) => {}
            Err(e) => {
                tracing::warn!("Keychain list: could not check provider '{provider}': {e}");
            }
        }
    }
    Ok(found)
}

use security_framework::passwords::{
    delete_generic_password, get_generic_password, set_generic_password,
};

const SERVICE_NAME: &str = "com.nootle.app";

pub fn store_api_key(provider: &str, key: &str) -> anyhow::Result<()> {
    // Try to delete existing key first (set doesn't overwrite)
    let _ = delete_generic_password(SERVICE_NAME, provider);
    set_generic_password(SERVICE_NAME, provider, key.as_bytes())?;
    Ok(())
}

pub fn get_api_key(provider: &str) -> anyhow::Result<Option<String>> {
    match get_generic_password(SERVICE_NAME, provider) {
        Ok(bytes) => Ok(Some(String::from_utf8(bytes.to_vec())?)),
        Err(e) => {
            // errSecItemNotFound means no key stored — not an error
            if e.to_string().contains("not found") || e.to_string().contains("-25300") {
                Ok(None)
            } else {
                Err(e.into())
            }
        }
    }
}

pub fn delete_api_key(provider: &str) -> anyhow::Result<()> {
    match delete_generic_password(SERVICE_NAME, provider) {
        Ok(()) => Ok(()),
        Err(e) => {
            if e.to_string().contains("not found") || e.to_string().contains("-25300") {
                Ok(()) // Already deleted
            } else {
                Err(e.into())
            }
        }
    }
}

/// List which providers have API keys stored
pub fn list_stored_providers() -> Vec<String> {
    let providers = ["openai", "anthropic", "google", "groq", "linear"];
    providers
        .iter()
        .filter(|&&p| get_api_key(p).ok().flatten().is_some())
        .map(|&p| p.to_string())
        .collect()
}

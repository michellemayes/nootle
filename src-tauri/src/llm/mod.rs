pub mod anthropic;
pub mod bedrock;
pub mod claude_agent;
pub mod codex;
pub mod codex_cli;
pub mod google;
pub mod groq;
pub mod ollama;
pub mod openai;
pub mod openrouter;
pub mod types;

pub use anthropic::AnthropicProvider;
pub use bedrock::BedrockProvider;
pub use claude_agent::ClaudeAgentProvider;
pub use codex::CodexProvider;
pub use codex_cli::CodexCliProvider;
pub use google::GoogleProvider;
pub use groq::GroqProvider;
pub use ollama::OllamaProvider;
pub use openai::OpenAiProvider;
pub use openrouter::OpenRouterProvider;
pub use types::{ChatMessage, LlmProvider, ModelInfo};

/// Providers that authenticate with an API key stored in the database.
const KEYED_PROVIDERS: [&str; 7] = [
    "openai",
    "anthropic",
    "google",
    "groq",
    "openrouter",
    "bedrock",
    "codex",
];

/// Builds the provider named `name` from its API key, or `None` if `name`
/// isn't a key-authenticated provider.
pub fn provider_for_key(name: &str, key: String) -> Option<Box<dyn LlmProvider>> {
    Some(match name {
        "openai" => Box::new(OpenAiProvider::new(key)),
        "anthropic" => Box::new(AnthropicProvider::new(key)),
        "google" => Box::new(GoogleProvider::new(key)),
        "groq" => Box::new(GroqProvider::new(key)),
        "openrouter" => Box::new(OpenRouterProvider::new(key)),
        "bedrock" => Box::new(BedrockProvider::new(key)),
        "codex" => Box::new(CodexProvider::new(key)),
        _ => return None,
    })
}

pub struct LlmRegistry {
    providers: Vec<Box<dyn LlmProvider>>,
}

impl Default for LlmRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl LlmRegistry {
    pub fn new() -> Self {
        Self { providers: vec![] }
    }

    /// Registers every provider usable on this machine: local ones that are
    /// reachable or installed, plus any with an API key stored in `db`.
    pub fn detect(db: &crate::db::Database) -> Self {
        let mut registry = Self::new();

        // Register Ollama only if it's reachable locally
        if std::net::TcpStream::connect_timeout(
            &"127.0.0.1:11434".parse().unwrap(),
            std::time::Duration::from_millis(500),
        )
        .is_ok()
        {
            registry.register(Box::new(OllamaProvider::new()));
        }

        // Register Codex CLI (ChatGPT subscription) only if the `codex` binary is installed
        if CodexCliProvider::is_available() {
            registry.register(Box::new(CodexCliProvider::new()));
        }

        // Auth is delegated to the user's existing Claude subscription, so no API key.
        if let Some(provider) = ClaudeAgentProvider::detect() {
            tracing::info!("Claude Agent SDK detected at {}", provider.binary_path());
            registry.register(Box::new(provider));
        }

        // Register providers with stored API keys.
        for name in KEYED_PROVIDERS {
            if let Ok(Some(key)) = db.get_api_key(name) {
                registry.register(provider_for_key(name, key).expect("keyed provider"));
            }
        }

        registry
    }

    pub fn register(&mut self, provider: Box<dyn LlmProvider>) {
        self.providers.push(provider);
    }

    pub fn unregister(&mut self, name: &str) {
        self.providers.retain(|p| p.provider_name() != name);
    }

    pub fn get_provider(&self, name: &str) -> Option<&dyn LlmProvider> {
        self.providers
            .iter()
            .find(|p| p.provider_name() == name)
            .map(|p| p.as_ref())
    }

    pub fn all_models(&self) -> Vec<ModelInfo> {
        self.providers
            .iter()
            .flat_map(|p| p.available_models())
            .collect()
    }

    pub fn provider_names(&self) -> Vec<String> {
        self.providers
            .iter()
            .map(|p| p.provider_name().to_string())
            .collect()
    }
}

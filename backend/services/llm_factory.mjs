/**
 * LLM Factory
 *
 * Creates a LangChain chat model instance based on .env configuration.
 * Inspired by the multi-provider pattern in CogniScript_Server.
 *
 * ─── Required .env vars ────────────────────────────────────────────────────────
 *   LLM_PROVIDER          gemini | groq | openai | anthropic | ollama
 *                         Default: gemini
 *
 *   LLM_MODEL             Optional model name override.
 *                         Falls back to the provider's built-in default.
 *
 *   {PROVIDER}_API_KEY    e.g. GEMINI_API_KEY, GROQ_API_KEY, OPENAI_API_KEY,
 *                         ANTHROPIC_API_KEY. Not required for ollama.
 *
 * ─── Supported providers ──────────────────────────────────────────────────────
 *   Provider    Package                    Default model
 *   ─────────── ─────────────────────────  ──────────────────────────────
 *   gemini      @langchain/google-genai    gemini-2.0-flash        (installed)
 *   groq        @langchain/groq            llama-3.3-70b-versatile
 *   openai      @langchain/openai          gpt-4o-mini
 *   anthropic   @langchain/anthropic       claude-3-5-haiku-20241022
 *   ollama      @langchain/ollama          llama3.2               (no API key)
 *
 * Dynamic imports are used so the server never crashes at startup if an
 * optional provider package is not installed — the error is raised only when
 * that provider is actually requested.
 */

// ─── Provider registry ────────────────────────────────────────────────────────

const PROVIDER_CONFIG = {
    gemini: {
        pkg:          '@langchain/google-genai',
        className:    'ChatGoogleGenerativeAI',
        defaultModel: 'gemini-2.0-flash',
        apiKeyEnv:    'GEMINI_API_KEY',
        buildArgs:    (apiKey, model) => ({ apiKey, model }),
    },
    groq: {
        pkg:          '@langchain/groq',
        className:    'ChatGroq',
        defaultModel: 'llama-3.3-70b-versatile',
        apiKeyEnv:    'GROQ_API_KEY',
        buildArgs:    (apiKey, model) => ({ apiKey, model }),
    },
    openai: {
        pkg:          '@langchain/openai',
        className:    'ChatOpenAI',
        defaultModel: 'gpt-4o-mini',
        apiKeyEnv:    'OPENAI_API_KEY',
        buildArgs:    (apiKey, model) => ({ openAIApiKey: apiKey, modelName: model }),
    },
    anthropic: {
        pkg:          '@langchain/anthropic',
        className:    'ChatAnthropic',
        defaultModel: 'claude-3-5-haiku-20241022',
        apiKeyEnv:    'ANTHROPIC_API_KEY',
        buildArgs:    (apiKey, model) => ({ anthropicApiKey: apiKey, model }),
    },
    ollama: {
        pkg:          '@langchain/ollama',
        className:    'ChatOllama',
        defaultModel: 'llama3.2',
        apiKeyEnv:    null,          // no API key needed for local Ollama
        buildArgs:    (_key, model) => ({ model }),
    },
};

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates and returns a LangChain chat model instance.
 * Provider and model name are resolved from .env unless overridden.
 *
 * @param {{ provider?: string, model?: string }} [opts]
 * @returns {Promise<import('@langchain/core/language_models/chat_models').BaseChatModel>}
 *
 * @example
 * // Reads LLM_PROVIDER + LLM_MODEL from .env automatically
 * const llm = await createLLM();
 *
 * @example
 * // Explicit override
 * const llm = await createLLM({ provider: 'groq', model: 'llama-3.3-70b-versatile' });
 */
export async function createLLM({ provider, model } = {}) {
    const providerName = (provider || process.env.LLM_PROVIDER || 'gemini').toLowerCase();
    const config       = PROVIDER_CONFIG[providerName];

    if (!config) {
        throw new Error(
            `[LLMFactory] Unknown provider: "${providerName}". ` +
            `Supported: ${Object.keys(PROVIDER_CONFIG).join(', ')}`
        );
    }

    // ── Validate API key (skipped for Ollama) ─────────────────────────────────
    let apiKey = null;
    if (config.apiKeyEnv) {
        apiKey = process.env[config.apiKeyEnv];
        if (!apiKey) {
            throw new Error(
                `[LLMFactory] ${config.apiKeyEnv} is not set in .env — required for provider "${providerName}"`
            );
        }
    }

    // ── Dynamic import — only the chosen provider package is loaded ───────────
    let pkg;
    try {
        pkg = await import(config.pkg);
    } catch {
        throw new Error(
            `[LLMFactory] Package "${config.pkg}" is not installed. ` +
            `Run: npm install ${config.pkg}`
        );
    }

    const LLMClass  = pkg[config.className];
    const modelName = model || process.env.LLM_MODEL || config.defaultModel;
    const llm       = new LLMClass(config.buildArgs(apiKey, modelName));

    console.log(`[LLMFactory] Initialized — provider: ${providerName}, model: ${modelName}`);
    return llm;
}

/**
 * Returns a list of all supported provider names.
 * @returns {string[]}
 */
export function getSupportedProviders() {
    return Object.keys(PROVIDER_CONFIG);
}

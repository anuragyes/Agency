const GeminiAdapter = require("../adapters/GeminiAdapter.js");
const OpenRouterAdapter = require("../adapters/OpenRouterAdapter.js");

// Register new providers here: name -> () => adapter instance
const PROVIDERS = {
    gemini: () => new GeminiAdapter(process.env.GEMINI_MODEL || undefined),
    openrouter: () => new OpenRouterAdapter(process.env.OPENROUTER_MODEL || undefined)
};

class LLMFactory {

    static create(provider = process.env.LLM_PROVIDER || "openrouter") {

        const key = String(provider).trim().toLowerCase();
        const build = PROVIDERS[key];

        if (!build) {
            throw new Error(
                `Unsupported LLM provider: "${provider}". Supported: ${Object.keys(PROVIDERS).join(", ")}`
            );
        }

        return build();
    }
}

module.exports = LLMFactory;

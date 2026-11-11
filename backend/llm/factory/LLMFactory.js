const GeminiAdapter = require("../adapters/GeminiAdapter.js");
const OpenRouterAdapter = require("../adapters/OpenRouterAdapter.js");

// Register new providers here: name -> () => adapter instance
const PROVIDERS = {
    gemini: () => new GeminiAdapter(process.env.GEMINI_MODEL || undefined),
    openrouter: () => new OpenRouterAdapter(process.env.OPENROUTER_MODEL || undefined)
};

/**
 * Resilient adapter wrapper that catches 402/Payment Required from OpenRouter
 * and automatically falls back to Gemini if a GEMINI_API_KEY is available.
 */
class ResilientLLMWrapper {
    constructor(primaryAdapter, fallbackAdapter) {
        this.primary = primaryAdapter;
        this.fallback = fallbackAdapter;
        this.lastUsage = null;
    }

    async generate(args) {
        try {
            const res = await this.primary.generate(args);
            this.lastUsage = this.primary.lastUsage;
            return res;
        } catch (err) {
            const isPaymentOrQuotaError =
                err?.status === 402 ||
                /\b(402|Payment Required|requires more credits|insufficient credits|quota exceeded)\b/i.test(err?.message || "");

            if (isPaymentOrQuotaError && this.fallback) {
                console.warn("[LLMFactory] ⚠️ Primary provider (OpenRouter) failed with 402 (Payment/Credits exhausted). Seamlessly falling back to Gemini...");
                const fallbackRes = await this.fallback.generate(args);
                this.lastUsage = this.fallback.lastUsage;
                return fallbackRes;
            }
            throw err;
        }
    }
}

class LLMFactory {
    static create(provider) {
        const hasGemini = Boolean(String(process.env.GEMINI_API_KEY || "").trim());
        const envProvider = String(process.env.LLM_PROVIDER || "").trim().toLowerCase();

        // Determine effective provider:
        // 1. Argument passed to create()
        // 2. process.env.LLM_PROVIDER
        // 3. If GEMINI_API_KEY exists, prefer "gemini" over exhausted openrouter
        // 4. Default to "openrouter"
        let chosen = String(provider || envProvider || (hasGemini ? "gemini" : "openrouter")).trim().toLowerCase();

        const build = PROVIDERS[chosen];
        if (!build) {
            throw new Error(
                `Unsupported LLM provider: "${chosen}". Supported: ${Object.keys(PROVIDERS).join(", ")}`
            );
        }

        const primaryAdapter = build();

        // If the primary provider is OpenRouter and Gemini is configured, wrap with automatic fallback
        if (chosen === "openrouter" && hasGemini) {
            const fallbackAdapter = new GeminiAdapter(process.env.GEMINI_MODEL || undefined);
            return new ResilientLLMWrapper(primaryAdapter, fallbackAdapter);
        }

        return primaryAdapter;
    }
}

module.exports = LLMFactory;

const ai = require("../../config/aiConfig.js");
const LLMProvider = require("../interfaces/LLMProvider.js");

const DEFAULT_MODEL = "gemini-3.8-flash";

// ADDED: retry settings for temporary errors (429 rate limit, 500/503 overloaded).
// Your test reports showed 44 of 48 cases failed only because of "429 Rate limit exceeded".
const MAX_RETRIES = Number(process.env.LLM_MAX_RETRIES ?? 3);       // extra attempts after the first one
const BASE_DELAY_MS = Number(process.env.LLM_RETRY_BASE_MS ?? 2000); // 2s, 4s, 8s ... (exponential backoff)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Decide if an error is worth retrying (temporary) or not (bad request, bad key...)
function isRetryable(err) {
    const status = err?.status ?? err?.code;
    if ([429, 500, 502, 503, 504].includes(Number(status))) return true;
    return /\b(429|500|502|503|504)\b|rate limit|quota|overloaded|unavailable|ECONNRESET|ETIMEDOUT/i
        .test(err?.message || "");
}

class GeminiAdapter extends LLMProvider {

    constructor(model = DEFAULT_MODEL) {
        super();
        this.model = model;
    }

    async generate({
        systemInstruction,
        input,
        responseSchema,
        temperature = 0.1
    } = {}) {

        // STEP 1: Validate input early -> clear error instead of a confusing API error
        if (typeof input !== "string" || !input.trim()) {
            throw new TypeError("GeminiAdapter.generate: `input` must be a non-empty string.");
        }

        // STEP 2: Build the Interactions API request
        const request = {
            model: this.model,
            input,
            generation_config: { temperature }
        };

        if (systemInstruction) {
            request.system_instruction = systemInstruction;
        }

        // STEP 3: Structured output -> model must return JSON that matches the schema
        if (responseSchema) {
            request.response_format = {
                type: "text",
                mime_type: "application/json",
                schema: responseSchema
            };
        }

        // STEP 4: Call the API, retrying temporary failures with exponential backoff + jitter
        let response;
        for (let attempt = 0; ; attempt++) {
            try {
                response = await ai.interactions.create(request);
                break;                                                   // success -> leave the loop
            } catch (err) {
                if (attempt < MAX_RETRIES && isRetryable(err)) {
                    const wait = BASE_DELAY_MS * 2 ** attempt + Math.floor(Math.random() * 500);
                    console.warn(`[Gemini] ${err.message?.slice(0, 80)} -> retry ${attempt + 1}/${MAX_RETRIES} in ${wait}ms`);
                    await sleep(wait);
                    continue;
                }
                const wrapped = new Error(`Gemini request failed (${this.model}): ${err.message}`);
                wrapped.cause = err;
                wrapped.retryable = isRetryable(err);                    // lets callers know it was a rate-limit type error
                throw wrapped;
            }
        }

        // STEP 5: Read the text output; empty text is treated as an error
        const text = response?.output_text;
        if (typeof text !== "string" || !text.trim()) {
            throw new Error(`Gemini returned an empty response (${this.model}).`);
        }

        return text;
    }
}

module.exports = GeminiAdapter;

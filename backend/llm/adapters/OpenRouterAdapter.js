const LLMProvider = require("../interfaces/LLMProvider.js");

const DEFAULT_MODEL = "openai/gpt-4o-mini"; // Fallback model for OpenRouter

const MAX_RETRIES = Number(process.env.LLM_MAX_RETRIES ?? 3);
const BASE_DELAY_MS = Number(process.env.LLM_RETRY_BASE_MS ?? 2000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isRetryable(status, errMessage) {
    if ([429, 500, 502, 503, 504].includes(Number(status))) return true;
    return /\b(429|500|502|503|504)\b|rate limit|quota|overloaded|unavailable|ECONNRESET|ETIMEDOUT/i.test(errMessage || "");
}

class OpenRouterAdapter extends LLMProvider {
    constructor(model = DEFAULT_MODEL) {
        super();
        this.model = model;
        this.apiKey = process.env.OPENROUTER_API_KEY;
        if (!this.apiKey) {
            console.warn(" OPENROUTER_API_KEY is not set in environment variables!");
        }
    }

    async generate({
        systemInstruction,
        input,
        responseSchema,
        temperature = 0.1
    } = {}) {
        if (typeof input !== "string" || !input.trim()) {
            throw new TypeError("OpenRouterAdapter.generate: `input` must be a non-empty string.");
        }

        const messages = [];
        let actualSystemInstruction = systemInstruction;

        // If a schema is provided, we append it to the system instruction 
        // to ensure the model strictly follows the expected format.
        if (responseSchema) {
            actualSystemInstruction = (actualSystemInstruction || "") +
                "\n\nYou must return your response as a valid JSON object matching this schema:\n" +
                JSON.stringify(responseSchema);
        }

        if (actualSystemInstruction) {
            messages.push({ role: "system", content: actualSystemInstruction });
        }

        messages.push({ role: "user", content: input });

        const requestBody = {
            model: this.model,
            messages,
            temperature,
            // Restrict max_tokens (default 2048). Without this, OpenRouter reserves 16,384 tokens
            // and throws a 402 error if your account balance is below the 16,384 token ceiling.
            max_tokens: Number(process.env.OPENROUTER_MAX_TOKENS || 2048)
        };

        // Enable JSON mode if a schema is required
        if (responseSchema) {
            requestBody.response_format = { type: "json_object" };
        }

        let response;
        let responseData;

        for (let attempt = 0; ; attempt++) {
            try {
                response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${this.apiKey}`,
                        "Content-Type": "application/json",
                        "HTTP-Referer": "http://localhost:5000", // Required by OpenRouter
                        "X-Title": "Sociva" // Optional by OpenRouter
                    },
                    body: JSON.stringify(requestBody)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    const err = new Error(`API error: ${response.status} ${response.statusText} - ${errorText}`);
                    err.status = response.status;
                    throw err;
                }

                responseData = await response.json();
                break; // success -> leave the loop
            } catch (err) {
                if (attempt < MAX_RETRIES && isRetryable(err.status, err.message)) {
                    const wait = BASE_DELAY_MS * 2 ** attempt + Math.floor(Math.random() * 500);
                    console.warn(`[OpenRouter] ${err.message?.slice(0, 80)} -> retry ${attempt + 1}/${MAX_RETRIES} in ${wait}ms`);
                    await sleep(wait);
                    continue;
                }
                const wrapped = new Error(`OpenRouter request failed (${this.model}): ${err.message}`);
                wrapped.cause = err;
                wrapped.retryable = isRetryable(err.status, err.message);
                throw wrapped;
            }
        }

        // token usage of this call (read by agents to show "tokens used" in the UI)
        this.lastUsage = responseData?.usage || null;

        const text = responseData?.choices?.[0]?.message?.content;
        if (typeof text !== "string" || !text.trim()) {
            throw new Error(`OpenRouter returned an empty response (${this.model}).`);
        }

        return text;
    }
}

module.exports = OpenRouterAdapter;

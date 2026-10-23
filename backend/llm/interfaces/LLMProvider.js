/**
 * Base class every LLM adapter must extend.
 * Gives the rest of the app one stable interface: llm.generate({...}) -> string
 */
class LLMProvider {
    constructor() {
        if (new.target === LLMProvider) {
            throw new TypeError("LLMProvider is abstract and cannot be instantiated directly.");
        }
    }

    /**
     * @param {Object}  options
     * @param {string}  options.systemInstruction
     * @param {string}  options.input
     * @param {Object} [options.responseSchema]  JSON schema for structured output
     * @param {number} [options.temperature]
     * @returns {Promise<string>} raw text returned by the model
     */
    // eslint-disable-next-line no-unused-vars
    async generate(options) {
        throw new Error(`${this.constructor.name} must implement generate()`);
    }
}

module.exports = LLMProvider;

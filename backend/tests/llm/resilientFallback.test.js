const test = require('node:test');
const assert = require('node:assert/strict');
const LLMFactory = require('../../llm/factory/LLMFactory');

test('LLMFactory: Defaults to gemini when GEMINI_API_KEY is present and LLM_PROVIDER is unset', () => {
  const origKey = process.env.GEMINI_API_KEY;
  const origProvider = process.env.LLM_PROVIDER;

  try {
    process.env.GEMINI_API_KEY = 'mock_gemini_key';
    delete process.env.LLM_PROVIDER;

    const llm = LLMFactory.create();
    assert.ok(llm.constructor.name === 'GeminiAdapter' || llm.primary?.constructor.name === 'GeminiAdapter');
  } finally {
    process.env.GEMINI_API_KEY = origKey;
    if (origProvider) process.env.LLM_PROVIDER = origProvider;
  }
});

test('LLMFactory: Wraps openrouter with fallback when GEMINI_API_KEY is available', () => {
  const origKey = process.env.GEMINI_API_KEY;
  try {
    process.env.GEMINI_API_KEY = 'mock_gemini_key';
    const llm = LLMFactory.create('openrouter');
    assert.equal(llm.constructor.name, 'ResilientLLMWrapper');
    assert.equal(llm.primary.constructor.name, 'OpenRouterAdapter');
    assert.equal(llm.fallback.constructor.name, 'GeminiAdapter');
  } finally {
    process.env.GEMINI_API_KEY = origKey;
  }
});


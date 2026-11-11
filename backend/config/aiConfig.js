const { GoogleGenAI } = require("@google/genai");

const getApiKey = () =>
  String(
    process.env.GEMINI_API_KEY ||
    process.env.GEMINI_IMAGE_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    ""
  ).trim();

// Proxy object that lazily initializes GoogleGenAI using whichever Gemini key is set in environment
const aiProxy = new Proxy({}, {
  get(target, prop) {
    const key = getApiKey();
    if (!key) {
      throw new Error(
        "GEMINI_API_KEY is missing in your environment variables! " +
        "Please add GEMINI_API_KEY to your live deployment dashboard (Render / Railway / Vercel)."
      );
    }
    const client = new GoogleGenAI({ apiKey: key });
    return client[prop];
  }
});

module.exports = aiProxy;

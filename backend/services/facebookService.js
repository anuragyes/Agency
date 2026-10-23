// ─────────────────────────────────────────────────────────────
// facebookService.js — one small client for your Facebook Page (official Graph API, graph.facebook.com)
//
// .env
//   FACEBOOK_PAGE_ID            your Page id            (falls back to META_PAGE_ID)
//   FACEBOOK_PAGE_ACCESS_TOKEN  a Page token (optional) — if missing we get it from META_ACCESS_TOKEN
//   FACEBOOK_API_VERSION        e.g. v23.0              (falls back to META_GRAPH_API_VERSION)
//
// Permissions the token needs: pages_show_list, pages_read_engagement, pages_manage_posts
// (pages_read_user_content to read comments). Publishing always uses a PAGE token.
// ─────────────────────────────────────────────────────────────
const axios = require("axios");

const FB_GRAPH = "https://graph.facebook.com";
const TIMEOUT = 20000;
const TOKEN_TTL_MS = 30 * 60 * 1000;

const version = () => process.env.FACEBOOK_API_VERSION || process.env.META_GRAPH_API_VERSION || "v23.0";
const apiBase = () => `${FB_GRAPH}/${version()}`;
const configuredPageId = () => String(process.env.FACEBOOK_PAGE_ID || process.env.META_PAGE_ID || "").trim();

const isFacebookConfigured = () =>
    Boolean(configuredPageId() && (process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN));

const fbErrorMessage = (err) => {
    const e = err?.response?.data?.error;
    return e?.error_user_msg || e?.message || err?.message || "Unknown Facebook API error";
};

/** Graph API error -> Error with a clear message + statusCode (+ fbCode for callers) */
const fbError = (err, step) => {
    if (err?.isFacebookError) return err;
    const apiErr = err?.response?.data?.error;
    const msg = fbErrorMessage(err);
    let hint = "";
    if (apiErr?.code === 190) hint = " The access token expired or is invalid — create a new one and update backend/.env.";
    else if ([10, 200].includes(apiErr?.code) || /permission/i.test(msg)) {
        hint = " The token needs pages_show_list, pages_read_engagement and pages_manage_posts for this Page.";
    }
    const e = new Error(`Facebook ${step} failed: ${msg}${hint}`);
    e.statusCode = err?.statusCode || (err?.response?.status === 400 ? 400 : err?.response ? 502 : 500);
    e.fbCode = apiErr?.code;
    e.fbSubcode = apiErr?.error_subcode;
    e.isFacebookError = true;
    return e;
};

const configError = (message) => Object.assign(new Error(message), { statusCode: 500, isFacebookError: true });

let cached = null; // { pageId, token, name, source, at }

/**
 * Page id + Page access token.
 * FACEBOOK_PAGE_ACCESS_TOKEN wins; otherwise we exchange META_ACCESS_TOKEN (a user token of a Page admin)
 * for the Page token with GET /{page-id}?fields=access_token  (cached 30 min).
 */
const getPageAccess = async (opts = {}) => {
    const customToken = typeof opts === "string" ? opts : opts?.customToken;
    const customPageId = opts?.customPageId;

    const pageId = customPageId || configuredPageId();
    if (!pageId && !customToken) throw configError("FACEBOOK_PAGE_ID (or META_PAGE_ID) is missing in backend/.env");

    if (customToken) {
        return { pageId: pageId || "me", token: customToken };
    }

    if (process.env.FACEBOOK_PAGE_ACCESS_TOKEN) {
        return { pageId, token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN };
    }
    const userToken = process.env.META_ACCESS_TOKEN;
    if (!userToken) throw configError("FACEBOOK_PAGE_ACCESS_TOKEN or META_ACCESS_TOKEN is missing in backend/.env");

    if (cached && cached.pageId === pageId && cached.source === userToken && Date.now() - cached.at < TOKEN_TTL_MS) return cached;
    try {
        const { data } = await axios.get(`${apiBase()}/${pageId}`, {
            params: { fields: "access_token,name", access_token: userToken },
            timeout: TIMEOUT,
        });
        // META_ACCESS_TOKEN may already be a Page token -> Meta returns no access_token, use it as it is
        cached = { pageId, token: data.access_token || userToken, name: data.name, source: userToken, at: Date.now() };
        return cached;
    } catch (err) {
        throw fbError(err, "Page token lookup");
    }
};

const clearPageTokenCache = () => { cached = null; };

/** GET on the Graph API with the Page token */
const fbGet = async (path, params = {}, step = "request", opts = {}) => {
    const { token } = await getPageAccess(opts);
    try {
        const { data } = await axios.get(`${apiBase()}/${path}`, { params: { ...params, access_token: token }, timeout: TIMEOUT });
        return data;
    } catch (err) {
        throw fbError(err, step);
    }
};

/** POST on the Graph API with the Page token (params as query string, like the Instagram service) */
const fbPost = async (path, params = {}, step = "request", opts = {}) => {
    const { token } = await getPageAccess(opts);
    try {
        const { data } = await axios.post(`${apiBase()}/${path}`, null, { params: { ...params, access_token: token }, timeout: 120000 });
        return data;
    } catch (err) {
        throw fbError(err, step);
    }
};

/** GET with a list of field sets: if Meta rejects a field (code 100) try the next, smaller set */
const fbGetWithFallback = async (path, params, fieldSets, step, opts = {}) => {
    let lastError;
    for (const fields of fieldSets) {
        try {
            return await fbGet(path, { ...params, fields }, step, opts);
        } catch (err) {
            lastError = err;
            if (![1, 100].includes(err.fbCode) || err.fbSubcode === 33) break; // 33 = object missing / no access
        }
    }
    throw lastError;
};

/** Absolute link for permalink_url values (videos return "/reel/123") */
const absoluteFbUrl = (u) => (!u ? null : /^https?:\/\//.test(u) ? u : `https://www.facebook.com${u.startsWith("/") ? "" : "/"}${u}`);

/** GET /api/facebook/test -> which Page we post to */
const testFacebookConnection = async () => {
    const { pageId } = await getPageAccess();
    const page = await fbGetWithFallback(pageId, {}, ["id,name,username,link,category,fan_count,followers_count", "id,name"], "connection test");
    return { connected: true, pageId: page.id, name: page.name, username: page.username || "", link: page.link || "", category: page.category || "", followers: page.followers_count ?? page.fan_count ?? null, apiVersion: version() };
};

module.exports = {
    apiBase,
    version,
    configuredPageId,
    isFacebookConfigured,
    getPageAccess,
    clearPageTokenCache,
    fbGet,
    fbPost,
    fbGetWithFallback,
    fbError,
    fbErrorMessage,
    absoluteFbUrl,
    testFacebookConnection,
};

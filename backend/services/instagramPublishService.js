// ─────────────────────────────────────────────────────────────
// instagramPublishService.js — publishes to Instagram (Instagram API with Instagram Login)
// Flow (Meta docs "Publish Content"):
//   1. POST /{ig-user-id}/media           -> container id
//   2. GET  /{container-id}?fields=status_code   (wait until FINISHED — videos take time)
//   3. POST /{ig-user-id}/media_publish   -> media id
// Media must be at a PUBLIC url (Instagram downloads it). Images: JPEG only. Reels: MP4/MOV.
// Stories: same flow with media_type=STORIES (1 image or 1 video, no caption) — publishStoryToInstagram()
// ─────────────────────────────────────────────────────────────
const axios = require("axios");

const getApiBase = (token) => {
    const isMeta = (token || "").startsWith("EA") || !(token || "").startsWith("IG");
    const host = isMeta ? "https://graph.facebook.com" : "https://graph.instagram.com";
    const version = process.env.INSTAGRAM_API_VERSION || process.env.META_GRAPH_API_VERSION || "v23.0";
    return `${host}/${version}`;
};

const resolveToken = async (overrideToken) => {
    if (overrideToken) return overrideToken;
    const t = process.env.INSTAGRAM_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
    if (t) return t;

    // Database lookup fallback (multi-tenant connected account)
    try {
        const { getAccountCredentials } = require("./tokenService.js");
        const creds = await getAccountCredentials({ platform: "instagram" });
        if (creds?.accessToken) return creds.accessToken;
    } catch (dbErr) {
        console.warn("[instagramPublishService] Error resolving fallback token from DB:", dbErr.message);
    }

    throw new Error("Instagram access token is missing. Please connect your Instagram account in Accounts / Agency.");
};

const defaultToken = () => {
    const t = process.env.INSTAGRAM_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
    if (!t) throw new Error("Instagram access token is missing");
    return t;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const igError = (err, step) => {
    const apiErr = err.response?.data?.error;
    const msg = apiErr?.error_user_msg || apiErr?.message || err.message;
    const e = new Error(`Instagram ${step} failed: ${msg}`);
    e.statusCode = err.response?.status === 400 ? 400 : 502;
    return e;
};

const get = async (path, params, step, overrideToken) => {
    const t = await resolveToken(overrideToken);
    try {
        const { data } = await axios.get(`${getApiBase(t)}/${path}`, { params: { ...params, access_token: t } });
        return data;
    } catch (err) {
        throw igError(err, step);
    }
};

const post = async (path, params, step, overrideToken) => {
    const t = await resolveToken(overrideToken);
    try {
        const { data } = await axios.post(`${getApiBase(t)}/${path}`, null, { params: { ...params, access_token: t } });
        return data;
    } catch (err) {
        throw igError(err, step);
    }
};

const getIgUserId = async (overrideToken, overrideId) => {
    if (overrideId) return { igUserId: overrideId, username: "" };
    const me = await get("me", { fields: "user_id,username" }, "account lookup", overrideToken);
    return { igUserId: me.user_id || me.id, username: me.username };
};

/** Wait until Instagram has downloaded + processed the media */
const waitUntilReady = async (containerId, { timeoutMs = 5 * 60 * 1000, everyMs = 4000, customToken } = {}) => {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
        const { status_code: code, status } = await get(containerId, { fields: "status_code,status" }, "status check", customToken);
        if (code === "FINISHED") return;
        if (code === "ERROR" || code === "EXPIRED") {
            throw new Error(`Instagram could not process the media (${code}${status ? `: ${status}` : ""}). Check format, size and that the URL is public.`);
        }
        await sleep(everyMs);
    }
    throw new Error("Instagram is still processing the media after 5 minutes. Try publishing again later.");
};

/** Check media matches the format before calling Instagram (clear errors for the user) */
const checkMedia = (contentType, media = []) => {
    const images = media.filter((m) => m.type === "image");
    const videos = media.filter((m) => m.type === "video");
    if (contentType === "image" && images.length !== 1) return "An image post needs exactly 1 image (JPEG).";
    if (contentType === "reel" && videos.length !== 1) return "A reel needs exactly 1 video (MP4/MOV, vertical 9:16).";
    if (contentType === "carousel" && (media.length < 2 || media.length > 10)) return "A carousel needs 2 to 10 images/videos.";
    const local = media.find((m) => /\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.)/.test(m.url));
    if (local) {
        return "Instagram can't download media from localhost. Add CLOUDINARY_URL to backend/.env (free) and restart — Sociva then uploads your files automatically. Or set PUBLIC_BASE_URL (ngrok), or paste a public media URL.";
    }
    return null;
};

/**
 * @param {{contentType:string, caption:string, media:{type,url}[], coverUrl?:string, customToken?:string, customIgUserId?:string, customUsername?:string}} p
 * @returns {{ mediaId, containerId, permalink, username }}
 */
const publishToInstagram = async ({ contentType, caption, media, coverUrl, customToken, customIgUserId, customUsername }) => {
    const problem = checkMedia(contentType, media);
    if (problem) {
        const e = new Error(problem);
        e.statusCode = 400;
        throw e;
    }

    const { igUserId, username: lookupUsername } = await getIgUserId(customToken, customIgUserId);
    const username = customUsername || lookupUsername;
    let containerId;

    if (contentType === "image") {
        ({ id: containerId } = await post(`${igUserId}/media`, { image_url: media[0].url, caption }, "create image container", customToken));
    } else if (contentType === "reel") {
        const params = { media_type: "REELS", video_url: media[0].url, caption, share_to_feed: true };
        if (coverUrl) params.cover_url = coverUrl;
        ({ id: containerId } = await post(`${igUserId}/media`, params, "create reel container", customToken));
    } else {
        const children = [];
        for (const m of media) {
            const params = m.type === "video"
                ? { media_type: "VIDEO", video_url: m.url, is_carousel_item: true }
                : { image_url: m.url, is_carousel_item: true };
            const { id } = await post(`${igUserId}/media`, params, "create carousel item", customToken);
            children.push(id);
        }
        for (const id of children) await waitUntilReady(id, { customToken });
        ({ id: containerId } = await post(
            `${igUserId}/media`,
            { media_type: "CAROUSEL", children: children.join(","), caption },
            "create carousel container",
            customToken
        ));
    }

    await waitUntilReady(containerId, { customToken });
    const { id: mediaId } = await post(`${igUserId}/media_publish`, { creation_id: containerId }, "publish", customToken);

    let permalink = null;
    try {
        ({ permalink } = await get(mediaId, { fields: "permalink" }, "permalink", customToken));
    } catch {
        /* published fine, permalink is optional */
    }

    return { mediaId, containerId, permalink, username };
};




/** Story = exactly the first image/video of the post (Stories can't hold a carousel or a caption) */
const checkStoryMedia = (media = []) => {
    const first = media.find((m) => m.type === "image" || m.type === "video");
    if (!first) return "A story needs 1 image (JPEG) or 1 video (MP4/MOV, vertical 9:16).";
    if (/\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.)/.test(first.url)) {
        return "Instagram can't download media from localhost. Add CLOUDINARY_URL to backend/.env (free) and restart — Sociva then uploads your files automatically. Or set PUBLIC_BASE_URL (ngrok), or paste a public media URL.";
    }
    return null;
};

/**
 * Publish to Instagram STORIES (same API calls as services/instagramService.publishInstagramStory,
 * plus waiting until Instagram has processed the media — needed for videos).
 * @param {{ media: {type,url}[], customToken?:string, customIgUserId?:string }} p   uses the first image/video
 * @returns {{ mediaId, containerId, permalink, username, mediaType }}
 */
const publishStoryToInstagram = async ({ media, customToken, customIgUserId, customUsername }) => {
    const problem = checkStoryMedia(media);
    if (problem) {
        const e = new Error(problem);
        e.statusCode = 400;
        throw e;
    }
    const item = media.find((m) => m.type === "image" || m.type === "video");
    const { igUserId, username: lookupUsername } = await getIgUserId(customToken, customIgUserId);
    const username = customUsername || lookupUsername;

    const params = item.type === "video"
        ? { media_type: "STORIES", video_url: item.url }
        : { media_type: "STORIES", image_url: item.url };
    const { id: containerId } = await post(`${igUserId}/media`, params, "create story container", customToken);

    await waitUntilReady(containerId, { customToken });
    const { id: mediaId } = await post(`${igUserId}/media_publish`, { creation_id: containerId }, "publish story", customToken);

    let permalink = null;
    try {
        ({ permalink } = await get(mediaId, { fields: "permalink" }, "permalink", customToken));
    } catch {
        /* stories may have no permalink — published fine */
    }
    return { mediaId, containerId, permalink, username, mediaType: item.type === "video" ? "VIDEO" : "IMAGE" };
};

module.exports = { publishToInstagram, publishStoryToInstagram, checkMedia, checkStoryMedia, getIgUserId };

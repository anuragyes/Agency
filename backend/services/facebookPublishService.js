// ─────────────────────────────────────────────────────────────
// facebookPublishService.js — publishes to your Facebook Page (Graph API, Page token)
//   text      POST /{page}/feed     { message, link? }
//   image     POST /{page}/photos   { url, message }                                  (1 photo)
//   carousel  POST /{page}/photos   { url, published:false } per photo, then
//             POST /{page}/feed     { message, attached_media:[{media_fbid}] }       (2–10 photo album post)
//   reel      POST /{page}/video_reels upload_phase=start -> rupload (file_url) -> upload_phase=finish
//   story     photo: POST /{page}/photos {published:false} -> POST /{page}/photo_stories { photo_id }
//             video: POST /{page}/video_stories start -> rupload (file_url) -> finish
// Media must be at a PUBLIC url (Facebook downloads it). Images JPEG/PNG, videos MP4/MOV.
// ─────────────────────────────────────────────────────────────
const axios = require("axios");
const { getPageAccess, fbGet, fbPost, fbError, absoluteFbUrl, version } = require("./facebookService.js");

const CONTENT_TYPES = ["text", "image", "carousel", "reel"];
const LOCAL_URL = /\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.)/;
const LOCAL_MSG = "Facebook can't download media from localhost. Add CLOUDINARY_URL to backend/.env (free) and restart — Sociva then uploads your files automatically. Or set PUBLIC_BASE_URL (ngrok), or paste a public media URL.";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

/** Check media matches the format before calling Facebook (clear errors for the user) */
const checkFacebookMedia = (contentType, media = []) => {
    const images = media.filter((m) => m.type === "image");
    const videos = media.filter((m) => m.type === "video");
    if (contentType === "text" && media.length) return "A text post has no photo or video. Remove the media, or switch the format to Photo post, Photo album or Reel.";
    if (contentType === "image" && (images.length !== 1 || videos.length)) return "A photo post needs exactly 1 image (JPEG or PNG).";
    if (contentType === "carousel" && (videos.length || images.length < 2 || images.length > 10)) return "A photo album needs 2 to 10 images (Facebook albums can't mix in videos).";
    if (contentType === "reel" && (videos.length !== 1 || images.length)) return "A reel needs exactly 1 video (MP4/MOV, vertical 9:16, 3–90 seconds).";
    if (media.some((m) => LOCAL_URL.test(m.url))) return LOCAL_MSG;
    return null;
};

/** Story = the first image/video of the post */
const checkFacebookStoryMedia = (media = []) => {
    const first = media.find((m) => m.type === "image" || m.type === "video");
    if (!first) return "A story needs 1 image (JPEG/PNG) or 1 video (MP4/MOV, vertical 9:16).";
    if (LOCAL_URL.test(first.url)) return LOCAL_MSG;
    return null;
};

/** Hosted upload for reels / video stories: Facebook downloads the file from file_url */
const ruploadFromUrl = async (uploadUrl, videoId, fileUrl, step, opts = {}) => {
    const { token } = await getPageAccess(opts);
    const url = uploadUrl || `https://rupload.facebook.com/video-upload/${version()}/${videoId}`;
    try {
        const { data } = await axios.post(url, null, { headers: { Authorization: `OAuth ${token}`, file_url: fileUrl }, timeout: 120000 });
        if (data && data.success === false) throw new Error(data.debug_info?.message || "upload was rejected");
        return data;
    } catch (err) {
        throw fbError(err, step);
    }
};

/** Wait until Facebook has processed a video (reels). Returns the last status (never throws on "still processing"). */
const waitForVideo = async (videoId, { timeoutMs = 5 * 60 * 1000, everyMs = 5000, opts = {} } = {}) => {
    const until = Date.now() + timeoutMs;
    let last = null;
    while (Date.now() < until) {
        const { status } = await fbGet(videoId, { fields: "status" }, "video status", opts);
        last = status || {};
        const vs = String(last.video_status || "").toLowerCase();
        const phases = [last.uploading_phase, last.processing_phase, last.publishing_phase].map((p) => p?.status);
        if (vs === "error" || phases.includes("error")) {
            const why = last.processing_phase?.errors?.[0]?.message || last.uploading_phase?.errors?.[0]?.message || "processing error";
            throw Object.assign(new Error(`Facebook could not process the video (${why}). Check format (MP4/MOV), length and that the URL is public.`), { statusCode: 400 });
        }
        if (vs === "ready" || last.publishing_phase?.status === "complete") return last;
        await sleep(everyMs);
    }
    return last; // still processing -> it goes live by itself when Facebook is done
};

const permalinkOf = async (id, opts = {}) => {
    if (!id) return null;
    try {
        const { permalink_url: p } = await fbGet(id, { fields: "permalink_url" }, "permalink", opts);
        return absoluteFbUrl(p);
    } catch {
        return null; // published fine, permalink is optional
    }
};

/**
 * @param {{contentType:"text"|"image"|"carousel"|"reel", message:string, media:{type,url}[], link?:string, customToken?:string, customPageId?:string}} p
 * @returns {{ postId, mediaId, permalink, pageName, pageId, processing? }}
 */
const publishToFacebook = async ({ contentType, message = "", media = [], link, customToken, customPageId }) => {
    if (!CONTENT_TYPES.includes(contentType)) throw badRequest(`contentType must be one of: ${CONTENT_TYPES.join(", ")}`);
    const problem = checkFacebookMedia(contentType, media);
    if (problem) throw badRequest(problem);
    if (contentType === "text" && !String(message).trim() && !link) throw badRequest("A text post needs some text.");

    const opts = { customToken, customPageId };
    const { pageId, name: pageName } = await getPageAccess(opts);
    let postId = null;
    let mediaId = null;
    let processing = false;

    if (contentType === "text") {
        const params = { message };
        if (link && /^https?:\/\//i.test(link)) params.link = link;
        ({ id: postId } = await fbPost(`${pageId}/feed`, params, "text post", opts));
    } else if (contentType === "image") {
        const r = await fbPost(`${pageId}/photos`, { url: media[0].url, message, published: true }, "photo post", opts);
        mediaId = r.id;
        postId = r.post_id || r.id;
    } else if (contentType === "carousel") {
        const ids = [];
        for (const m of media) {
            const { id } = await fbPost(`${pageId}/photos`, { url: m.url, published: false }, "album photo upload", opts);
            ids.push(id);
        }
        ({ id: postId } = await fbPost(
            `${pageId}/feed`,
            { message, attached_media: JSON.stringify(ids.map((id) => ({ media_fbid: id }))) },
            "album post",
            opts
        ));
    } else {
        // reel
        const start = await fbPost(`${pageId}/video_reels`, { upload_phase: "start" }, "reel upload start", opts);
        mediaId = start.video_id;
        await ruploadFromUrl(start.upload_url, start.video_id, media[0].url, "reel upload", opts);
        const fin = await fbPost(
            `${pageId}/video_reels`,
            { upload_phase: "finish", video_id: start.video_id, video_state: "PUBLISHED", description: message },
            "reel publish",
            opts
        );
        postId = fin.post_id || null;
        const status = await waitForVideo(start.video_id, { opts });
        processing = !!status && String(status.video_status).toLowerCase() !== "ready" && status.publishing_phase?.status !== "complete";
    }

    const permalink = (await permalinkOf(postId, opts)) || (mediaId ? await permalinkOf(mediaId, opts) : null);
    return { postId: postId || mediaId, mediaId, permalink, pageName, pageId, ...(processing && { processing: true }) };
};

/** Facebook Page Story (first image/video, no caption) */
const publishStoryToFacebook = async ({ media = [], customToken, customPageId }) => {
    const problem = checkFacebookStoryMedia(media);
    if (problem) throw badRequest(problem);
    const item = media.find((m) => m.type === "image" || m.type === "video");
    const opts = { customToken, customPageId };
    const { pageId, name: pageName } = await getPageAccess(opts);

    let result;
    let mediaId;
    if (item.type === "image") {
        const { id: photoId } = await fbPost(`${pageId}/photos`, { url: item.url, published: false }, "story photo upload", opts);
        mediaId = photoId;
        result = await fbPost(`${pageId}/photo_stories`, { photo_id: photoId }, "photo story", opts);
    } else {
        const start = await fbPost(`${pageId}/video_stories`, { upload_phase: "start" }, "video story start", opts);
        mediaId = start.video_id;
        await ruploadFromUrl(start.upload_url, start.video_id, item.url, "video story upload", opts);
        result = await fbPost(`${pageId}/video_stories`, { upload_phase: "finish", video_id: start.video_id }, "video story publish", opts);
    }
    const postId = result?.post_id || null;
    return { postId: postId || mediaId, mediaId, permalink: await permalinkOf(postId, opts), pageName, pageId, mediaType: item.type === "video" ? "VIDEO" : "IMAGE" };
};

module.exports = { publishToFacebook, publishStoryToFacebook, checkFacebookMedia, checkFacebookStoryMedia, CONTENT_TYPES };

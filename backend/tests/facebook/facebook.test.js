// node --test tests/facebook/facebook.test.js — Facebook Page publishing, data mapping and the post agent
// with a fake Graph API (no network, no LLM).
const test = require("node:test");
const assert = require("node:assert");
const axios = require("axios");

process.env.FACEBOOK_PAGE_ID = "P1";
process.env.FACEBOOK_PAGE_ACCESS_TOKEN = "page-token";
process.env.FACEBOOK_API_VERSION = "v23.0";

const calls = [];
let photoN = 0;
const path = (url) => url.replace(/^https:\/\/graph\.facebook\.com\/v[\d.]+\//, "");
axios.get = async (url, { params }) => {
    calls.push(["GET", path(url), params]);
    if (params.fields === "status") return { data: { status: { video_status: "ready" } } };
    if (params.fields === "permalink_url") return { data: { permalink_url: "/reel/999" } };
    if (params.fields === "access_token,name") return { data: { access_token: "exchanged-page-token", name: "Gaon Ghee" } };
    return { data: {} };
};
axios.post = async (url, _body, opts = {}) => {
    const p = path(url);
    calls.push(["POST", p, opts.params || {}, opts.headers]);
    if (url.startsWith("https://rupload.facebook.com")) return { data: { success: true } };
    if (p === "P1/feed") return { data: { id: "P1_POST" } };
    if (p === "P1/photos") return { data: opts.params.published === false ? { id: `PH${++photoN}` } : { id: "PH_PUB", post_id: "P1_PHOTO" } };
    if (p === "P1/video_reels" && opts.params.upload_phase === "start") return { data: { video_id: "V1", upload_url: "https://rupload.facebook.com/video-upload/v23.0/V1" } };
    if (p === "P1/video_reels") return { data: { success: true, post_id: "P1_REEL" } };
    if (p === "P1/photo_stories") return { data: { success: true, post_id: "P1_STORY" } };
    return { data: {} };
};

const { publishToFacebook, publishStoryToFacebook, checkFacebookMedia, checkFacebookStoryMedia } = require("../../services/facebookPublishService.js");
const { toFacebookPostView, cleanPageRef } = require("../../services/facebookInsightsService.js");
const { normalizeFacebookPost, validateFacebookPost, facebookFormat, buildFacebookMessage } = require("../../ai/marketResearch/platforms/facebook/FacebookPostValidator.js");
const generateFacebookPost = require("../../ai/marketResearch/platforms/facebook/FacebookPostAgent.js");
const researchFacebookFromBrief = require("../../ai/marketResearch/platforms/facebook/FacebookBriefResearch.js");
const fbService = require("../../services/facebookService.js");

const img = (u) => ({ type: "image", url: `https://cdn.x/${u}.jpg` });

test("text post -> POST /{page}/feed with message (+ link)", async () => {
    calls.length = 0;
    const r = await publishToFacebook({ contentType: "text", message: "Hello Page", media: [], link: "https://gaonghee.in" });
    const c = calls.find((x) => x[1] === "P1/feed");
    assert.equal(c[2].message, "Hello Page");
    assert.equal(c[2].link, "https://gaonghee.in");
    assert.equal(c[2].access_token, "page-token");
    assert.equal(r.postId, "P1_POST");
});

test("photo post -> POST /{page}/photos with url + message", async () => {
    calls.length = 0;
    const r = await publishToFacebook({ contentType: "image", message: "Look", media: [img("a")] });
    const c = calls.find((x) => x[1] === "P1/photos");
    assert.equal(c[2].url, "https://cdn.x/a.jpg");
    assert.equal(c[2].message, "Look");
    assert.equal(r.postId, "P1_PHOTO");
});

test("photo album -> unpublished photos, then one feed post with attached_media", async () => {
    calls.length = 0;
    photoN = 0;
    await publishToFacebook({ contentType: "carousel", message: "Album", media: [img("a"), img("b"), img("c")] });
    const uploads = calls.filter((x) => x[1] === "P1/photos");
    assert.equal(uploads.length, 3);
    assert.ok(uploads.every((x) => x[2].published === false));
    const feed = calls.find((x) => x[1] === "P1/feed");
    assert.deepEqual(JSON.parse(feed[2].attached_media), [{ media_fbid: "PH1" }, { media_fbid: "PH2" }, { media_fbid: "PH3" }]);
    assert.equal(feed[2].message, "Album");
});

test("reel -> start, hosted upload with file_url, finish with description, waits for processing", async () => {
    calls.length = 0;
    const r = await publishToFacebook({ contentType: "reel", message: "Reel text", media: [{ type: "video", url: "https://cdn.x/v.mp4" }] });
    const reelCalls = calls.filter((x) => x[1] === "P1/video_reels");
    assert.equal(reelCalls[0][2].upload_phase, "start");
    const up = calls.find((x) => x[1].startsWith("https://rupload.facebook.com"));
    assert.equal(up[3].file_url, "https://cdn.x/v.mp4");
    assert.equal(up[3].Authorization, "OAuth page-token");
    assert.equal(reelCalls[1][2].upload_phase, "finish");
    assert.equal(reelCalls[1][2].video_state, "PUBLISHED");
    assert.equal(reelCalls[1][2].description, "Reel text");
    assert.ok(calls.some((x) => x[2].fields === "status"));
    assert.equal(r.postId, "P1_REEL");
    assert.equal(r.permalink, "https://www.facebook.com/reel/999");
});

test("photo story -> unpublished photo + photo_stories", async () => {
    calls.length = 0;
    const r = await publishStoryToFacebook({ media: [img("s"), img("t")] });
    assert.equal(calls.find((x) => x[1] === "P1/photos")[2].url, "https://cdn.x/s.jpg");
    assert.ok(calls.some((x) => x[1] === "P1/photo_stories" && x[2].photo_id));
    assert.equal(r.postId, "P1_STORY");
});

test("media checks give clear errors", () => {
    assert.match(checkFacebookMedia("image", []), /exactly 1 image/);
    assert.match(checkFacebookMedia("carousel", [img("a")]), /2 to 10 images/);
    assert.match(checkFacebookMedia("carousel", [img("a"), { type: "video", url: "https://x/v.mp4" }]), /can't mix in videos/);
    assert.match(checkFacebookMedia("reel", [img("a")]), /1 video/);
    assert.match(checkFacebookMedia("text", [img("a")]), /no photo or video/);
    assert.match(checkFacebookMedia("image", [{ type: "image", url: "http://localhost:5000/uploads/a.jpg" }]), /localhost/);
    assert.equal(checkFacebookMedia("text", []), null);
    assert.equal(checkFacebookMedia("carousel", [img("a"), img("b")]), null);
    assert.match(checkFacebookStoryMedia([]), /needs 1 image/);
});

test("page token is exchanged from META_ACCESS_TOKEN when no Page token is set", async () => {
    delete process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    process.env.META_ACCESS_TOKEN = "user-token";
    fbService.clearPageTokenCache();
    calls.length = 0;
    const a = await fbService.getPageAccess();
    assert.equal(a.token, "exchanged-page-token");
    assert.equal(a.name, "Gaon Ghee");
    assert.equal(calls[0][2].access_token, "user-token");
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = "page-token";
});

test("Facebook post -> Instagram-like post shape (reactions, comments, shares, format)", () => {
    const v = toFacebookPostView({
        id: "1_2", message: "Pure ghee #desighee #A2", created_time: "2026-10-01T10:00:00+0000",
        permalink_url: "https://www.facebook.com/x/posts/2", full_picture: "https://cdn/x.jpg",
        attachments: { data: [{ media_type: "album" }] },
        reactions: { summary: { total_count: 40 } }, comments: { summary: { total_count: 5 } },
    }, "Gaon Ghee");
    assert.equal(v.likes, 40);
    assert.equal(v.comments, 5);
    assert.equal(v.shares, 0, "missing shares = 0");
    assert.equal(v.engagement, 45);
    assert.equal(v.mediaType, "CAROUSEL_ALBUM");
    assert.deepEqual(v.hashtags, ["#desighee", "#a2"]);
    const reel = toFacebookPostView({ id: "3", permalink_url: "/reel/3", attachments: { data: [{ media_type: "video" }] } });
    assert.equal(reel.productType, "REELS");
    assert.equal(reel.permalink, "https://www.facebook.com/reel/3");
    assert.equal(toFacebookPostView({ id: "4", message: "hi" }).mediaType, "TEXT");
});

test("page refs from links / usernames / ids", () => {
    assert.equal(cleanPageRef("https://www.facebook.com/amul.coop/"), "amul.coop");
    assert.equal(cleanPageRef("@nike"), "nike");
    assert.equal(cleanPageRef("https://facebook.com/profile.php?id=10001"), "10001");
    assert.equal(cleanPageRef("m.facebook.com/somepage?ref=x"), "somepage");
});

test("validator: formats, optional hashtags, plain text, link", () => {
    assert.equal(facebookFormat("reel"), "reel");
    assert.equal(facebookFormat("video"), "reel");
    assert.equal(facebookFormat("carousel"), "carousel");
    assert.equal(facebookFormat("post"), "image");
    assert.equal(facebookFormat("thread"), "text");
    const p = normalizeFacebookPost({ hook: "Hi", caption: "**Bold** line\n- item #tag", link: "not a url", hashtags: [] }, "text");
    assert.equal(p.caption.includes("**"), false);
    assert.equal(p.link, "");
    assert.deepEqual(p.hashtags, ["#tag"]);
    assert.equal(validateFacebookPost(p).valid, true, "text post needs no visual and no hashtags");
    const photo = normalizeFacebookPost({ hook: "Hi", caption: "x" }, "image");
    assert.match(validateFacebookPost(photo).errors.join(), /visual.brief/);
    assert.equal(buildFacebookMessage({ caption: "Hello", hashtags: ["#ghee"] }), "Hello\n\n#ghee");
});

test("agent: writes a valid post from a brief with a fake LLM (retries once on invalid JSON)", async () => {
    let n = 0;
    const llm = {
        generate: async ({ input }) => {
            n++;
            assert.match(input, /Facebook Post Agent/);
            assert.match(input, /BEST RECENT POSTS/);
            if (n === 1) return "not json";
            return JSON.stringify({ hook: "3 reasons families switch to A2 ghee", caption: "3 reasons families switch to A2 ghee\n\nIt's slow-made.", hashtags: ["#a2ghee"], callToAction: "Order now", visual: { brief: "Jar on a kitchen shelf" } });
        },
    };
    const post = await generateFacebookPost({
        brief: { product: { name: "Gaon Ghee" }, optimizedPrompt: "Promote A2 ghee", importantWords: ["a2 ghee"] },
        research: { status: "success", hashtags: [{ hashtag: "#a2ghee" }], topPosts: [{ hook: "Our bilona process", format: "photo", engagement: 120 }] },
        contentType: "image",
        llm,
    });
    assert.equal(n, 2);
    assert.equal(post.platform, "facebook");
    assert.equal(post.contentType, "image");
    assert.deepEqual(post.hashtags, ["#a2ghee"]);
});

test("brief research uses your Page's real posts (no LLM) and never throws", async () => {
    const overview = {
        profile: { name: "Gaon Ghee", followers: 1000 },
        fetchedAt: "2026-10-08T00:00:00Z",
        stats: { topHashtags: [{ hashtag: "#desighee", posts: 3, avgEngagement: 50 }], engagementRate: 2 },
        recentPosts: [
            { id: "1", caption: "A2 ghee from our farm\nmore", hashtags: ["#desighee"], likes: 50, comments: 5, shares: 1, engagement: 56, mediaType: "IMAGE", productType: "FEED", timestamp: "2026-10-01T10:00:00Z", permalink: "https://fb/1" },
            { id: "2", caption: "Bilona process video", hashtags: [], likes: 90, comments: 9, shares: 3, engagement: 102, mediaType: "VIDEO", productType: "REELS", timestamp: "2026-10-02T10:00:00Z", permalink: "https://fb/2" },
        ],
    };
    const r = await researchFacebookFromBrief({ brief: { importantWords: ["a2 ghee"] }, overview });
    assert.equal(r.platform, "facebook");
    assert.equal(r.mediaAnalyzed, 2);
    assert.equal(r.topPosts[0].hook, "Bilona process video");
    assert.equal(r.topPosts[0].format, "reel");
    assert.equal(r.relatedPosts.length, 1);
    assert.equal(r.hashtags[0].hashtag, "#desighee");
});

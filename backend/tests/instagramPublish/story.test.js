// node --test tests/instagramPublish/story.test.js — Story publishing with a fake Instagram API (no network)
const test = require("node:test");
const assert = require("node:assert");
const axios = require("axios");

process.env.INSTAGRAM_ACCESS_TOKEN = "test-token";
const calls = [];
axios.get = async (url, { params }) => {
    calls.push(["GET", url.split("/").slice(4).join("/"), params]);
    if (url.endsWith("/me")) return { data: { user_id: "IG1", username: "gaonghee" } };
    if (params.fields === "status_code,status") return { data: { status_code: "FINISHED" } };
    if (params.fields === "permalink") return { data: { permalink: "https://instagram.com/stories/gaonghee/1" } };
    return { data: {} };
};
axios.post = async (url, _b, { params }) => {
    calls.push(["POST", url.split("/").slice(4).join("/"), params]);
    if (url.endsWith("/media")) return { data: { id: "C1" } };
    if (url.endsWith("/media_publish")) return { data: { id: "M1" } };
    return { data: {} };
};
const { publishStoryToInstagram, checkStoryMedia } = require("../../services/instagramPublishService.js");

test("story: posts the first image with media_type=STORIES and no caption", async () => {
    calls.length = 0;
    const r = await publishStoryToInstagram({ media: [{ type: "image", url: "https://cdn.x/a.jpg" }, { type: "image", url: "https://cdn.x/b.jpg" }] });
    const create = calls.find((c) => c[0] === "POST" && c[1] === "IG1/media");
    assert.equal(create[2].media_type, "STORIES");
    assert.equal(create[2].image_url, "https://cdn.x/a.jpg");
    assert.equal(create[2].caption, undefined);
    assert.ok(calls.some((c) => c[1] === "IG1/media_publish" && c[2].creation_id === "C1"));
    assert.equal(r.mediaId, "M1");
    assert.equal(r.mediaType, "IMAGE");
});

test("story: video uses video_url and waits for processing", async () => {
    calls.length = 0;
    await publishStoryToInstagram({ media: [{ type: "video", url: "https://cdn.x/v.mp4" }] });
    assert.equal(calls.find((c) => c[1] === "IG1/media")[2].video_url, "https://cdn.x/v.mp4");
    assert.ok(calls.some((c) => c[2].fields === "status_code,status"), "checked processing status");
});

test("story: clear errors for no media / localhost media", () => {
    assert.match(checkStoryMedia([]), /needs 1 image/);
    assert.match(checkStoryMedia([{ type: "image", url: "http://localhost:5000/uploads/a.jpg" }]), /localhost/);
    assert.equal(checkStoryMedia([{ type: "image", url: "https://cdn.x/a.jpg" }]), null);
});

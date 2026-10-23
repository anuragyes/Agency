// node --test tests/media/cloudStorage.test.js
// Cloudinary media storage: uploads get public https links (no ngrok, survives Render restarts). No network: fetch is faked.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const cloud = require("../../services/cloudStorage.js");
const storage = require("../../services/imageGen/imageStorage.js");
const { prepareMediaForPublish } = require("../../services/publicMedia.js");

const withEnv = async (vars, fn) => {
    const old = {};
    for (const k of Object.keys(vars)) { old[k] = process.env[k]; if (vars[k] == null) delete process.env[k]; else process.env[k] = vars[k]; }
    try { return await fn(); } finally { for (const k of Object.keys(old)) { if (old[k] == null) delete process.env[k]; else process.env[k] = old[k]; } }
};
const CLOUD = { CLOUDINARY_URL: "cloudinary://123456:s3cr3t@demo-cloud", CLOUDINARY_FOLDER: null };

/** fake Cloudinary: records uploads, answers like the real API */
const fakeCloudinary = () => {
    const uploads = [];
    const fetchImpl = async (url, o) => {
        const file = o.body.get("file");
        uploads.push({ url, folder: o.body.get("folder"), apiKey: o.body.get("api_key"), signature: o.body.get("signature"), timestamp: o.body.get("timestamp"), type: file.type, size: file.size });
        const kind = url.includes("/video/") ? "video" : "image";
        return new Response(JSON.stringify({ secure_url: `https://res.cloudinary.com/demo-cloud/${kind}/upload/v1/${o.body.get("folder")}/f${uploads.length}`, public_id: `id${uploads.length}`, bytes: file.size }), { status: 200 });
    };
    return { uploads, fetchImpl };
};
const withFetch = async (fetchImpl, fn) => {
    const real = global.fetch;
    global.fetch = fetchImpl;
    try { return await fn(); } finally { global.fetch = real; }
};

test("config: CLOUDINARY_URL or the three separate values", () =>
    withEnv({ ...CLOUD, CLOUDINARY_CLOUD_NAME: null }, async () => {
        assert.deepEqual(cloud.config(), { apiKey: "123456", apiSecret: "s3cr3t", cloudName: "demo-cloud" });
        process.env.CLOUDINARY_URL = "";
        assert.equal(cloud.isConfigured(), false);
        Object.assign(process.env, { CLOUDINARY_CLOUD_NAME: "c", CLOUDINARY_API_KEY: "k", CLOUDINARY_API_SECRET: "s" });
        assert.equal(cloud.isConfigured(), true);
        for (const k of ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]) delete process.env[k];
    }));

test("signature matches Cloudinary's documented example", () => {
    // https://cloudinary.com/documentation/authentication_signatures
    const sig = cloud.sign({ eager: "w_400,h_300,c_pad|w_260,h_200,c_crop", public_id: "sample_image", timestamp: 1315060510 }, "abcd");
    assert.equal(sig, "bfd09f95f331f558cbd1320e67aa8d488770583e");
});

test("uploadBuffer: signed multipart to the right endpoint -> https link", () =>
    withEnv(CLOUD, async () => {
        const f = fakeCloudinary();
        const r = await cloud.uploadBuffer(Buffer.from("jpegdata"), { folder: "instagram", mimeType: "image/jpeg" }, { fetchImpl: f.fetchImpl });
        assert.match(f.uploads[0].url, /^https:\/\/api\.cloudinary\.com\/v1_1\/demo-cloud\/image\/upload$/);
        assert.equal(f.uploads[0].folder, "sociva/instagram");
        assert.equal(f.uploads[0].apiKey, "123456");
        assert.equal(f.uploads[0].signature, cloud.sign({ folder: "sociva/instagram", timestamp: f.uploads[0].timestamp }, "s3cr3t"));
        assert.match(r.url, /^https:\/\/res\.cloudinary\.com\//);
        const v = await cloud.uploadBuffer(Buffer.from("mp4"), { resourceType: "video", mimeType: "video/mp4" }, { fetchImpl: f.fetchImpl });
        assert.match(v.url, /\/video\/upload\//);
    }));

test("uploadBuffer: wrong key -> clear message", () =>
    withEnv(CLOUD, async () => {
        const bad = async () => new Response(JSON.stringify({ error: { message: "Invalid Signature abc" } }), { status: 401 });
        await assert.rejects(cloud.uploadBuffer(Buffer.from("x"), {}, { fetchImpl: bad }), /Check CLOUDINARY_URL/);
    }));

test("generated ads go to Cloudinary when it is set up (no local file, public link)", () =>
    withEnv(CLOUD, async () => {
        const f = fakeCloudinary();
        const r = await withFetch(f.fetchImpl, () => storage.saveBuffer(Buffer.from("png"), { ext: "jpg", dir: "generated", prefix: "ad" }));
        assert.equal(r.file, null);
        assert.match(r.url, /^https:\/\/res\.cloudinary\.com\/.*sociva\/generated/);
        assert.equal(f.uploads[0].type, "image/jpeg");
        assert.equal(storage.isPublicUrl(r.url), true);
    }));

test("without Cloudinary: still saved locally (old behaviour)", () =>
    withEnv({ CLOUDINARY_URL: null, PUBLIC_BASE_URL: null }, async () => {
        const r = await storage.saveBuffer(Buffer.from("x"), { ext: "png", dir: "generated", prefix: "test" });
        assert.ok(r.file && fs.existsSync(r.file));
        assert.match(r.url, /^http:\/\/localhost:\d+\/uploads\/generated\//);
        fs.unlinkSync(r.file);
    }));

test("old draft with localhost media -> uploaded to Cloudinary at approve/publish, URLs swapped", () =>
    withEnv(CLOUD, async () => {
        const dir = path.join(storage.UPLOADS_ROOT, "instagram");
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, "test-old-draft.jpg");
        fs.writeFileSync(file, "jpegbytes");
        const doc = {
            media: [
                { type: "image", url: "http://localhost:5000/uploads/instagram/test-old-draft.jpg", mimeType: "image/jpeg", source: "upload" },
                { type: "image", url: "https://example.com/already-public.jpg", source: "url" },
                { type: "image", url: "http://localhost:5000/uploads/instagram/gone.jpg", source: "upload" },
            ],
            markModified() { this.modified = true; },
        };
        const f = fakeCloudinary();
        const r = await withFetch(f.fetchImpl, () => prepareMediaForPublish(doc));
        fs.unlinkSync(file);
        assert.equal(r.moved, 1);
        assert.deepEqual(r.missing, ["http://localhost:5000/uploads/instagram/gone.jpg"]);
        assert.match(doc.media[0].url, /^https:\/\/res\.cloudinary\.com\/.*sociva\/posts/);
        assert.equal(doc.media[1].url, "https://example.com/already-public.jpg", "public links untouched");
        assert.equal(doc.modified, true);
        assert.equal(f.uploads.length, 1);
    }));

test("without Cloudinary nothing is uploaded at publish", () =>
    withEnv({ CLOUDINARY_URL: null }, async () => {
        const doc = { media: [{ type: "image", url: "http://localhost:5000/uploads/instagram/x.jpg" }] };
        const r = await withFetch(async () => assert.fail("no upload"), () => prepareMediaForPublish(doc));
        assert.equal(r.moved, 0);
        assert.match(doc.media[0].url, /localhost/);
    }));

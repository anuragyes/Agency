const mongoose = require("mongoose");
const sharp = require("sharp");
const Product = require("../models/Product.js");
const productService = require("../services/productService.js");
const ragService = require("../services/ragService.js");
const { saveBuffer } = require("../services/imageGen/imageStorage.js");
const { cutOutLogo } = require("../services/imageGen/logoCutout.js");

const createProduct = async (req, res) => {
    try {
        const userId = req.user?._id || null;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required to create a project. Please sign in.",
            });
        }
        const product = await productService.createProduct(req.body, userId);

        res.status(201).json({
            success: true,
            data: product,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

const getProducts = async (req, res) => {
    try {
        const userId = req.user?._id || null;
        const products = await productService.getProducts(userId);

        res.status(200).json({
            success: true,
            data: products,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

const getProductById = async (req, res) => {
    try {
        const product = await productService.getProductById(req.params.id);

        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        if (product.userId) {
            if (!req.user?._id || product.userId.toString() !== req.user._id.toString()) {
                return res.status(403).json({ success: false, message: "Access denied: you do not have permission to view this project." });
            }
        }

        res.status(200).json({
            success: true,
            data: product,
        });
    } catch (error) {
        // ADDED: a malformed id (not 24 hex chars) is a client error, not a server error
        const status = error.name === "CastError" ? 400 : 500;
        res.status(status).json({
            success: false,
            message: error.message,
        });
    }
};

const getProductKnowledge = async (req, res) => {
    try {
        const knowledge = await productService.getProductKnowledge(req.params.id);
        if (!knowledge) {
            return res.status(404).json({ success: false, message: "Product knowledge not found" });
        }
        res.status(200).json({
            success: true,
            data: knowledge,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

const updateProductKnowledge = async (req, res) => {
    try {
        const { knowledgeMd } = req.body || {};
        const result = await ragService.updateFullKnowledge(req.params.id, knowledgeMd);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const addKnowledgeChunk = async (req, res) => {
    try {
        const result = await ragService.addKnowledgeChunk(req.params.id, req.body || {});
        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const updateKnowledgeChunk = async (req, res) => {
    try {
        const result = await ragService.updateKnowledgeChunk(req.params.id, req.params.chunkId, req.body || {});
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const deleteKnowledgeChunk = async (req, res) => {
    try {
        const result = await ragService.deleteKnowledgeChunk(req.params.id, req.params.chunkId);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ───────── Brand logo + product photo (used by AI-generated ad images) ─────────
// POST   /api/products/:id/logo    raw body, Content-Type: image/png | image/jpeg | image/webp | image/svg+xml
// POST   /api/products/:id/photo   raw body, Content-Type: image/png | image/jpeg | image/webp   (real product packshot)
// POST   /api/products/:id/icon    raw body, same types as the logo — a brand icon instead of the logo
//        logo and icon are exclusive: uploading one removes the other (only the file the user just gave is used)
// DELETE /api/products/:id/logo | /icon | /photo
const IMAGE_KINDS = {
    logo: {
        field: "logoUrl", dir: "logos", prefix: "logo", mime: { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" },
        bad: "Logo must be PNG, JPEG, WebP or SVG (transparent PNG / SVG looks best)", clears: ["iconUrl", "logoAltUrl"]
    },
    icon: {
        field: "iconUrl", dir: "icons", prefix: "icon", mime: { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" },
        bad: "Icon must be PNG, JPEG, WebP or SVG (transparent PNG / SVG looks best)", clears: ["logoUrl", "logoAltUrl"]
    },
    photo: {
        field: "photoUrl", dir: "products", prefix: "product", mime: { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" },
        bad: "Product photo must be a JPEG, PNG or WebP image"
    },
};

const uploadProductImage = (kind) => async (req, res) => {
    const k = IMAGE_KINDS[kind];
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid product id" });
        const mime = (req.get("content-type") || "").split(";")[0].trim().toLowerCase();
        const ext = k.mime[mime];
        if (!ext) return res.status(415).json({ success: false, message: k.bad });
        if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ success: false, message: "Empty file" });

        // make sure it really is an image sharp can read (it is composited later)
        const meta = await sharp(req.body, { density: 150 }).metadata().catch(() => {
            throw Object.assign(new Error("This file isn't a readable image"), { statusCode: 400 });
        });
        if (kind === "photo" && Math.min(meta.width || 0, meta.height || 0) < 300) {
            return res.status(400).json({ success: false, message: "Product photo is too small — use one at least 300 px on each side (1000+ px looks best)." });
        }

        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ success: false, message: "Product not found" });
        // logo / icon: its background (white, blue, a white tile …) is made transparent and the empty margin
        // trimmed, then saved as PNG — so the preview and every generated image show the mark alone, no box
        let file = req.body;
        let fileExt = ext;
        if (kind === "logo" || kind === "icon") {
            const cut = await cutOutLogo(req.body).catch(() => null);
            if (cut && (cut.removed || ext !== "svg")) { file = cut.png; fileExt = "png"; }
        }
        const saved = await saveBuffer(file, { ext: fileExt, dir: k.dir, prefix: k.prefix, req });
        product[k.field] = saved.url;
        for (const f of k.clears || []) product[f] = undefined; // logo OR icon — never both
        await product.save();
        res.status(201).json({ success: true, data: { [k.field]: product[k.field], product } });
    } catch (error) {
        res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
};

const removeProductImage = (kind) => async (req, res) => {
    const k = IMAGE_KINDS[kind];
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid product id" });
        const unset = { [k.field]: 1, ...(kind === "logo" ? { logoAltUrl: 1 } : {}) };
        const product = await Product.findByIdAndUpdate(req.params.id, { $unset: unset }, { new: true });
        if (!product) return res.status(404).json({ success: false, message: "Product not found" });
        res.json({ success: true, data: { [k.field]: null, product } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const uploadLogo = uploadProductImage("logo");
const removeLogo = removeProductImage("logo");
const uploadIcon = uploadProductImage("icon");
const removeIcon = removeProductImage("icon");
const uploadPhoto = uploadProductImage("photo");
const removePhoto = removeProductImage("photo");

module.exports = {
    createProduct,
    getProducts,
    getProductById,
    getProductKnowledge,
    updateProductKnowledge,
    addKnowledgeChunk,
    updateKnowledgeChunk,
    deleteKnowledgeChunk,
    uploadLogo,
    removeLogo,
    uploadIcon,
    removeIcon,
    uploadPhoto,
    removePhoto,
};
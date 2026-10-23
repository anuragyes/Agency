const express = require("express");

const {
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
} = require("../controllers/productController.js");
const { optionalAuth } = require("../middleware/authMiddleware.js");

const Productrouter = express.Router();

Productrouter.use(optionalAuth);

Productrouter.post("/", createProduct);
Productrouter.get("/", getProducts);
Productrouter.get("/getProduct", getProducts);
Productrouter.get("/getIdProduct/:id", getProductById);
Productrouter.get("/:id", getProductById);

// Brand Brain (RAG) Knowledge & Chunks
Productrouter.get("/:id/knowledge", getProductKnowledge);
Productrouter.put("/:id/knowledge", updateProductKnowledge);
Productrouter.post("/:id/knowledge/chunks", addKnowledgeChunk);
Productrouter.put("/:id/knowledge/chunks/:chunkId", updateKnowledgeChunk);
Productrouter.delete("/:id/knowledge/chunks/:chunkId", deleteKnowledgeChunk);

// Brand logo for AI-generated ad images: send the file as the raw body (Content-Type: image/png | image/jpeg | image/webp | image/svg+xml)
Productrouter.post("/:id/logo", express.raw({ type: ["image/*"], limit: "5mb" }), uploadLogo);
Productrouter.delete("/:id/logo", removeLogo);
// Brand icon — used INSTEAD of the logo (only one of them at a time: uploading one removes the other)
Productrouter.post("/:id/icon", express.raw({ type: ["image/*"], limit: "5mb" }), uploadIcon);
Productrouter.delete("/:id/icon", removeIcon);

// Real product photo (packshot) — the AI places it into generated scenes, so the label / logo on the pack stay exact
Productrouter.post("/:id/photo", express.raw({ type: ["image/*"], limit: "15mb" }), uploadPhoto);
Productrouter.delete("/:id/photo", removePhoto);

module.exports = Productrouter;
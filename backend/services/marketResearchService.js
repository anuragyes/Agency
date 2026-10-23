// ─────────────────────────────────────────────────────────────
// marketResearchService.js — business logic for Phase 2 (Market Research).
// Controller -> this service -> MarketResearchOrchestrator (AI) + MongoDB.
// Errors carry err.statusCode so the controller can send the right HTTP code.
// ─────────────────────────────────────────────────────────────
const mongoose = require("mongoose");
const Product = require("../models/Product.js");
const MarketResearch = require("../models/MarketResearch.js");
const runMarketResearch = require("../ai/marketResearch/MarketResearchOrchestrator.js");

const { resolvePlatforms } = runMarketResearch._internals;

// Small helper: Error with an HTTP status code
const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

// Invalid ObjectId -> 400 (instead of Mongoose CastError -> 500)
const assertId = (id, label = "id") => {
    if (!mongoose.isValidObjectId(id)) throw httpError(400, `Invalid ${label}: ${id}`);
};

// Runs the orchestrator and keeps the DB document up to date while it works
const executeResearch = async (researchId, product, { platforms, researchData }) => {
    try {
        const report = await runMarketResearch({
            product,
            platforms,
            researchData: researchData && typeof researchData === "object" ? researchData : {},
            // After each platform: save its result + bump progress (atomic, safe with concurrency)
            onProgress: ({ platform, result }) =>
                MarketResearch.updateOne(
                    { _id: researchId },
                    { $set: { [`platforms.${platform}`]: result }, $inc: { "progress.done": 1 } }
                ),
        });

        await MarketResearch.updateOne(
            { _id: researchId },
            {
                $set: {
                    status: report.status,
                    platforms: report.platforms,
                    aggregate: report.aggregate,
                    finishedAt: report.finishedAt,
                    durationMs: report.durationMs,
                },
            }
        );
    } catch (err) {
        console.error(`[MarketResearch] run ${researchId} failed:`, err.message);
        await MarketResearch.updateOne(
            { _id: researchId },
            { $set: { status: "failed", error: err.message, finishedAt: new Date() } }
        ).catch(() => { });
        throw err;
    }
};

// Start a research run for a product.
// wait=false -> returns the "running" doc right away (client polls GET /:id)
// wait=true  -> waits for the full report and returns the finished doc
const startResearch = async (productId, { platforms, researchData, wait = false } = {}) => {
    // STEP 1: validate input before creating anything
    assertId(productId, "productId");
    const product = await Product.findById(productId);
    if (!product) throw httpError(404, "Product not found");

    const selected = resolvePlatforms(platforms);   // throws 400 for unknown platforms

    // STEP 2: create the run document
    const research = await MarketResearch.create({
        product: product._id,
        status: "running",
        requestedPlatforms: selected,
        progress: { done: 0, total: selected.length },
        startedAt: new Date(),
    });

    // STEP 3: run it
    const job = executeResearch(research._id, product, { platforms: selected, researchData });

    if (wait) {
        await job;
        return MarketResearch.findById(research._id);
    }

    job.catch(() => { });   // background: failure is already saved on the document
    return research;
};

// One run by its id (poll this while status = "running")
const getResearchById = async (id) => {
    assertId(id);
    const research = await MarketResearch.findById(id);
    if (!research) throw httpError(404, "Market research not found");
    return research;
};

// Newest run for a product
const getLatestForProduct = async (productId) => {
    assertId(productId, "productId");
    const research = await MarketResearch.findOne({ product: productId }).sort({ createdAt: -1 });
    if (!research) throw httpError(404, "No market research found for this product");
    return research;
};

// History of runs for a product (without the heavy per-platform details)
const listForProduct = async (productId) => {
    assertId(productId, "productId");
    return MarketResearch.find({ product: productId }).select("-platforms").sort({ createdAt: -1 });
};

module.exports = {
    startResearch,
    getResearchById,
    getLatestForProduct,
    listForProduct,
};

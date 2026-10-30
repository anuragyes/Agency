
// STEP 1: Load .env FIRST, so every module required below can read process.env (API keys, DB url)
const dotenv = require("dotenv");
dotenv.config();

const http = require("http");
const path = require("path");
const express = require("express");
const cors = require("cors");
const app = express();
const server = http.createServer(app);

// Initialize real-time Socket.IO gateway
const { initSocket } = require("./services/inbox/socketService.js");
initSocket(server);

// STEP 3: Global middleware
app.use(cors());                                                   // allow the React frontend (other port) to call us
app.use(express.json({ limit: "10mb" }));                          // parse JSON bodies -> req.body object
app.use(express.urlencoded({ limit: "10mb", extended: true }));    // parse HTML form bodies
app.use(express.text());                                           // parse raw text bodies (plain product description)

// Uploaded post media (Instagram / Facebook download it from here -> needs PUBLIC_BASE_URL e.g. ngrok in dev)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
// Ad fonts (SIL OFL) — the image generator's font picker previews them in the browser
app.use("/fonts", express.static(path.join(__dirname, "assets", "fonts"), { maxAge: "30d" }));

// STEP 4: Import DB connector and routerssss
const connectDB = require("./config/db");
const productRouter = require("./routes/productRoutes.js");
const marketResearchRouter = require("./routes/marketResearchRoutes.js");
// FIX: before, server.js used `MarketResearcherrouter` which was never defined -> server crashed on start

const instagramResearchRoutes = require("./routes/instagramRoutes.js");
const contentRouter = require("./routes/contentRoutes.js");
const hashtagRouter = require("./routes/hashtagRoutes.js");
const competitorResearchRouter = require("./routes/competitorResearchRoutes.js");
const facebookRouter = require("./routes/facebookRoutes.js");
const imageGenRouter = require("./routes/imageGenRoutes.js");
const inboxRouter = require("./routes/inboxRoutes.js");
const authRouter = require("./routes/authRoutes.js");
const userAuthRouter = require("./routes/userAuthRoutes.js");
const youtubeRouter = require("./routes/youtubeRoutes.js");
const trendsRouter = require("./routes/trendsRoutes.js");
const { optionalAuth } = require("./middleware/authMiddleware.js");

const PORT = process.env.PORT || 5000;



// STEP 5: Connect to MongoDB (exits the process if it fails, see config/db.js)
connectDB();

// STEP 6: Routes
app.get("/", (req, res) => res.send("Server is running"));        // health check
app.get("/api/prompts", (req, res) => res.json(prompts));

// Universal optional auth for all /api endpoints to populate req.user from JWT
app.use("/api", optionalAuth);

app.use("/api/user", userAuthRouter);                                     // User Authentication: Signup, Login, Google OAuth
app.use("/api/products", productRouter);                           // Phase 1: Product Profile
app.use("/api/market-research", marketResearchRouter);             // Phase 2: Market Research (5 platforms + aggregator)
app.use("/api/content", contentRouter);
// Studio step 1: prompt + platform -> compact brief
app.use("/api/instagram", instagramResearchRoutes);               // Instagram: research -> post/reel/carousel -> review -> publish
app.use("/api/facebook", facebookRouter);                          // Facebook Page: research -> text/photo/album/reel -> review -> publish
app.use("/api/image-gen", imageGenRouter);                       // AI product ad image: layout -> approve -> SD + ControlNet -> typography + logo
app.use("/api/hashtags", hashtagRouter);
app.use("/api/competitor-research", competitorResearchRouter);         // Competitor research: real data + grounded AI report                           // Real hashtags per platform (Instagram live, others ready)
app.use("/api/inbox", inboxRouter);                                   // Unified Inbox: Webhooks -> Filter -> Queue -> AI -> Socket.IO
app.use("/api/auth", authRouter);                                     // Multi-tenant OAuth: Meta (Instagram & Facebook), YouTube, X
app.use("/api/youtube", youtubeRouter);                               // YouTube Channel: profile, stats, videos, and channel connection
app.use("/api/trends", trendsRouter);                                 // Google Trends interest for project-specific topics

// STEP 7: 404 for unknown routes (instead of Express' default HTML page)
app.use((req, res) => {
    res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
});

// STEP 8: Central error handler — any error passed to next(err) ends here as clean JSON
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error("[server] unhandled error:", err);
    res.status(err.statusCode || 500).json({ success: false, message: err.message || "Internal server error" });
});

// STEP 9: Start listening
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    // "Schedule for later": publishes scheduled Instagram / Facebook posts when their date & time comes
    require("./services/postScheduler.js").startPostScheduler();
});
// Nodemon reloaded at 2026-10-21-competitor-fix





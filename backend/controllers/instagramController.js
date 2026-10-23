
const { getInstagramProfile, getInstagramFollowers, searchInstagramHashtag } = require("../services/instagramService.js");

const generateInstagramResearch = require("../ai/marketResearch/platforms/instagram/InstagramStandaloneAgent.js");
const { getInstagramAccountOverview, getCompetitorAccount, getInstagramMediaDetails } = require("../services/instagramInsightsService.js");
const { getInstagramAudience } = require("../services/instagramAudienceService.js");

const testInstagramConnection = async (req, res) => {
    try {
        const profile = await getInstagramProfile();

        res.status(200).json({
            success: true,
            message: "Instagram connected successfully",
            data: profile,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};








//   this is the function which helps to test LLM model for Instargram Agent 


const researchInstagram = async (req, res) => {
    try {
        const product = req.body;

        const result = await generateInstagramResearch(product);

        return res.status(200).json(result);

    } catch (error) {
        console.error("Instagram Research Controller:", error.message);

        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};





const getFollowers = async (req, res) => {
    try {
        const data = await getInstagramFollowers()
        res.status(200).json({
            success: true,
            data: {
                username: data.username,
                name: data.name || "",
                profilePictureUrl: data.profile_picture_url || null,
                followers: data.followers_count,
                following: data.follows_count,
                posts: data.media_count,
            },
        });
    } catch (error) {
        console.error(error.response?.data || error.message);

        const igError = error.response?.data?.error;
        res.status(error.response?.status || 500).json({
            success: false,
            message: igError?.message || error.message || "Failed to fetch Instagram followers",
            code: igError?.code,
        });
    }
};






const getInstagramHashtags = async (req, res, next) => {
    try {
        const { q } = req.query;

        if (!q || !q.trim()) {
            return res.status(400).json({
                success: false,
                message: "Please provide a hashtag query",
            });
        }

        const result = await searchInstagramHashtag(q);

        return res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};



// GET /api/instagram/account — real profile + engagement for the Accounts page
const getInstagramAccount = async (req, res, next) => {
    try {
        const data = await getInstagramAccountOverview({
            productId: req.query.productId,
            userId: req.user?._id,
            mediaLimit: Math.min(50, Number(req.query.limit) || 25),
        });
        return res.status(200).json({ success: true, data });
    } catch (error) {
        const igError = error.response?.data?.error;
        console.error("Instagram account error:", igError || error.message);
        return res.status(error.statusCode || error.response?.status || 500).json({
            success: false,
            message: igError?.message || error.message || "Failed to fetch Instagram account",
            code: igError?.code,
        });
    }
};

// GET /api/instagram/competitor?username=nike — a top brand's posts, engagement and hashtags
const getInstagramCompetitor = async (req, res, next) => {
    try {
        const data = await getCompetitorAccount(req.query.username);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

// GET /api/instagram/audience — real audience data for the Audience page (?refresh=1 skips the 10 min cache)
const getInstagramAudienceData = async (req, res) => {
    try {
        const data = await getInstagramAudience({
            productId: req.query.productId,
            userId: req.user?._id,
            refresh: req.query.refresh === "1" || req.query.refresh === "true",
        });
        return res.status(200).json({ success: true, data });
    } catch (error) {
        const igError = error.response?.data?.error;
        console.error("Instagram audience error:", igError || error.message);
        return res.status(error.statusCode || error.response?.status || 500).json({
            success: false,
            message: igError?.message || error.message || "Failed to fetch Instagram audience",
            code: igError?.code,
        });
    }
};

// GET /api/instagram/media/:mediaId/details — live likes, comments, reach, saved for a specific post
const getMediaDetails = async (req, res, next) => {
    try {
        const { mediaId } = req.params;
        const data = await getInstagramMediaDetails(mediaId, {
            productId: req.query.productId,
            userId: req.user?._id,
        });
        return res.status(200).json({ success: true, data });
    } catch (error) {
        const igError = error.response?.data?.error;
        console.error("Instagram media details error:", igError || error.message);
        return res.status(error.statusCode || error.response?.status || 500).json({
            success: false,
            message: igError?.message || error.message || "Failed to fetch media details",
            code: igError?.code,
        });
    }
};

module.exports = {
    getInstagramAudienceData,
    getInstagramAccount,
    getInstagramCompetitor,
    getMediaDetails,
    researchInstagram,
    testInstagramConnection,
    getFollowers,
    getInstagramHashtags,
};


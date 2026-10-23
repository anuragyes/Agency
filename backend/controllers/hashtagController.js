// hashtagController.js — real hashtag data for any platform (routes/hashtagRoutes.js)
const { getProvider, listPlatforms } = require("../services/hashtags");

// GET /api/hashtags/platforms
const getPlatforms = (req, res) => res.status(200).json({ success: true, data: listPlatforms() });

// POST /api/hashtags/:platform/explore   body: { seeds: "ghee, desi ghee" | ["ghee"] }
const explore = async (req, res, next) => {
    try {
        const provider = getProvider(req.params.platform);
        return res.status(200).json(await provider.explore({ seeds: req.body?.seeds }));
    } catch (error) {
        next(error);
    }
};

// GET /api/hashtags/:platform/quota
const quota = async (req, res, next) => {
    try {
        const provider = getProvider(req.params.platform);
        return res.status(200).json({ success: true, data: await provider.quota() });
    } catch (error) {
        next(error);
    }
};

module.exports = { getPlatforms, explore, quota };

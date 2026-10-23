
const validateInstagramResearch = (research) => {
    const errors = [];

    if (!research || typeof research !== "object" || Array.isArray(research)) {
        return {
            valid: false,
            errors: ["Research must be a valid object"],
        };
    }

    if (research.platform !== "instagram") {
        errors.push("Invalid platform");
    }

    if (typeof research.productCategory !== "string") {
        errors.push("productCategory must be a string");
    }

    const requiredArrays = [
        "segments",
        "interests",
        "contentPreferences",
    ];

    requiredArrays.forEach((field) => {
        if (!Array.isArray(research.targetAudience?.[field])) {
            errors.push(`targetAudience.${field} must be an array`);
        }
    });

    const hashtagFields = ["primary", "niche", "related"];

    hashtagFields.forEach((field) => {
        if (!Array.isArray(research.hashtagResearch?.[field])) {
            errors.push(`hashtagResearch.${field} must be an array`);
        }
    });

    const contentFields = [
        "reelIdeas",
        "carouselIdeas",
        "postIdeas",
    ];

    contentFields.forEach((field) => {
        if (!Array.isArray(research.contentResearch?.[field])) {
            errors.push(`contentResearch.${field} must be an array`);
        }
    });

    if (!Array.isArray(research.engagementOpportunities)) {
        errors.push("engagementOpportunities must be an array");
    }

    if (!Array.isArray(research.recommendations)) {
        errors.push("recommendations must be an array");
    }

    if (!Array.isArray(research.researchLimitations)) {
        errors.push("researchLimitations must be an array");
    }

    return {
        valid: errors.length === 0,
        errors,
    };
};

module.exports = validateInstagramResearch;
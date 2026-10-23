
const validateInstagramContentStrategy = (strategy) => {
    const errors = [];

    if (
        !strategy ||
        typeof strategy !== "object" ||
        Array.isArray(strategy)
    ) {
        return {
            valid: false,
            errors: ["Strategy must be a valid object"],
        };
    }

    if (strategy.platform !== "instagram") {
        errors.push("Platform must be instagram");
    }

    if (!Array.isArray(strategy.contentPlan)) {
        errors.push("contentPlan must be an array");
    }

    if (!Array.isArray(strategy.recommendations)) {
        errors.push("recommendations must be an array");
    }

    if (typeof strategy.strategySummary !== "string") {
        errors.push("strategySummary must be a string");
    }

    const allowedTypes = ["reel", "image", "carousel"];

    if (Array.isArray(strategy.contentPlan)) {
        strategy.contentPlan.forEach((content, index) => {
            const prefix = `contentPlan[${index}]`;

            if (
                !content ||
                typeof content !== "object" ||
                Array.isArray(content)
            ) {
                errors.push(`${prefix}: Must be a valid object`);
                return;
            }

            if (!allowedTypes.includes(content.contentType)) {
                errors.push(`${prefix}: Invalid contentType`);
            }

            const requiredStrings = [
                "objective",
                "contentAngle",
                "hook",
                "contentBrief",
                "visualDirection",
                "captionDirection",
                "callToAction",
            ];

            requiredStrings.forEach((field) => {
                if (
                    typeof content[field] !== "string" ||
                    !content[field].trim()
                ) {
                    errors.push(
                        `${prefix}: ${field} must be a non-empty string`
                    );
                }
            });

            const requiredArrays = [
                "targetAudience",
                "hashtags",
                "keywords",
            ];

            requiredArrays.forEach((field) => {
                if (!Array.isArray(content[field])) {
                    errors.push(`${prefix}: ${field} must be an array`);
                }
            });
        });
    }

    return {
        valid: errors.length === 0,
        errors,
    };
};

module.exports = validateInstagramContentStrategy;
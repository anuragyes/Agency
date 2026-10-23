// ─────────────────────────────────────────────────────────────
// postPerformanceLearningsService.js — Closed-Loop Content Optimization
//
// Automatically analyzes the brand's previous posts (from MongoDB + live Meta API),
// identifies what worked (hooks, formats, engagement drivers) vs gaps to avoid,
// and injects high-impact strategy directives directly into the post generation LLM.
//
// Runs 100% behind the scenes.
// ─────────────────────────────────────────────────────────────
const mongoose = require("mongoose");
const InstagramPost = require("../models/InstagramPost.js");
const { getInstagramAccountOverview } = require("./instagramInsightsService.js");

/** Extract clean first hook line from caption */
function extractHookLine(caption = "") {
    if (!caption) return "";
    const firstLine = String(caption).trim().split("\n")[0] || "";
    return firstLine.replace(/^[#•\-\s]+/, "").slice(0, 100).trim();
}

/** Classify hook style */
function classifyHook(hook = "") {
    if (/\?/.test(hook)) return "question_curiosity";
    if (/^[0-9]+|\b\d+\s+(ways|tips|steps|reasons|mistakes)\b/i.test(hook)) return "listicle_number";
    if (/\b(how to|secret|why|never|stop|warning|revealed)\b/i.test(hook)) return "educational_intrigue";
    return "story_statement";
}

/**
 * Analyze past post performance for a project/product.
 * Returns { analyzed: boolean, postsAnalyzed: number, summary: string, promptInjection: string }
 */
async function getPastPostPerformanceLearnings({ productId, platform = "instagram" } = {}) {
    try {
        let pastPosts = [];

        // 1. Check MongoDB for previously published posts for this product
        if (productId && mongoose.isValidObjectId(productId)) {
            const dbPosts = await InstagramPost.find({
                productId,
                status: "published",
            })
                .sort({ createdAt: -1 })
                .limit(10)
                .lean();

            if (dbPosts.length > 0) {
                pastPosts = dbPosts.map((p) => ({
                    id: p.instagram?.mediaId || p._id,
                    caption: p.content?.caption || "",
                    hook: p.content?.hook || extractHookLine(p.content?.caption),
                    likes: p.instagram?.likes || 0,
                    comments: p.instagram?.comments || 0,
                    engagement: (p.instagram?.likes || 0) + (p.instagram?.comments || 0),
                    contentType: p.contentType,
                    cta: p.content?.callToAction || "",
                }));
            }
        }

        // 2. If fewer than 3 posts from DB, augment with live posts from the connected Instagram account
        if (pastPosts.length < 3 && platform === "instagram") {
            try {
                const accountData = await getInstagramAccountOverview({ productId, mediaLimit: 10 });
                const recentLive = accountData?.recentPosts || [];
                for (const post of recentLive) {
                    if (!pastPosts.some((p) => p.id === post.id)) {
                        pastPosts.push({
                            id: post.id,
                            caption: post.caption || "",
                            hook: extractHookLine(post.caption),
                            likes: Number(post.likes) || 0,
                            comments: Number(post.comments) || 0,
                            engagement: (Number(post.likes) || 0) + (Number(post.comments) || 0),
                            contentType: String(post.mediaType || "image").toLowerCase(),
                            cta: "",
                        });
                    }
                }
            } catch (err) {
                // Live account might be unlinked or rate limited — continue with what we have
                console.warn("[PostPerformanceLearnings] Live posts fallback skipped:", err.message);
            }
        }

        if (pastPosts.length === 0) {
            return {
                analyzed: false,
                postsAnalyzed: 0,
                summary: null,
                promptInjection: "",
            };
        }

        // Sort posts by engagement descending
        pastPosts.sort((a, b) => b.engagement - a.engagement || b.likes - a.likes);

        const totalAnalyzed = Math.min(pastPosts.length, 10);
        const topPosts = pastPosts.slice(0, Math.max(1, Math.ceil(totalAnalyzed * 0.4)));
        const lowerPosts = pastPosts.slice(-Math.max(1, Math.floor(totalAnalyzed * 0.4)));

        // Extract winning patterns
        const topHooks = topPosts.map((p) => p.hook).filter(Boolean);
        const bestHookSample = topHooks[0] ? `"${topHooks[0].slice(0, 60)}..."` : "direct curiosity hook";
        const bestHookType = topHooks[0] ? classifyHook(topHooks[0]) : "question_curiosity";

        const winningStyle = bestHookType === "question_curiosity"
            ? "Conversational questions and curiosity-driven hooks drove top engagement"
            : bestHookType === "listicle_number"
                ? "Structured listicle hooks and practical takeaways outperformed generic intros"
                : "Strong, punchy opening statements with relatable scenarios performed best";

        // Extract gaps from lower performers
        const gapsIdentified = [];
        const hasLowComments = lowerPosts.every((p) => p.comments === 0);
        if (hasLowComments) {
            gapsIdentified.push("Past lower-performing posts lacked an interactive comment prompt — ensure an engaging question CTA");
        }

        const lowerHasDenseText = lowerPosts.some((p) => p.caption && !p.caption.includes("\n\n"));
        if (lowerHasDenseText) {
            gapsIdentified.push("Dense paragraphs reduce read-through — use clean 2-line spacing and bullet highlights");
        }

        if (gapsIdentified.length === 0) {
            gapsIdentified.push("Avoid passive statements — make the hook immediate and action-focused");
        }

        const promptInjection = [
            `LEARNINGS FROM THIS ACCOUNT'S PREVIOUS POSTS (${totalAnalyzed} posts analyzed):`,
            `• Winning Strategy: ${winningStyle} (e.g. ${bestHookSample}).`,
            `• Gaps to Fix: ${gapsIdentified.join("; ")}.`,
            `• Execution Rule: Apply the winning hook style and finish with an open question CTA to maximize comments.`,
        ].join("\n");

        const summary = `Previous ${totalAnalyzed > 1 ? `${totalAnalyzed} posts` : "posts"} analyzed: winning hook & high-engagement CTA applied`;

        return {
            analyzed: true,
            postsAnalyzed: totalAnalyzed,
            summary,
            promptInjection,
        };
    } catch (error) {
        console.warn("[PostPerformanceLearnings] Analysis error:", error.message);
        return {
            analyzed: false,
            postsAnalyzed: 0,
            summary: null,
            promptInjection: "",
        };
    }
}

module.exports = {
    getPastPostPerformanceLearnings,
};

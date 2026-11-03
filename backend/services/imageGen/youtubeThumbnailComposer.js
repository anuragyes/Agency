// ─────────────────────────────────────────────────────────────
// youtubeThumbnailComposer.js — Sharp/SVG Compositor for YouTube Thumbnails
// Renders bold, high-contrast, stroke-bordered text onto 16:9 / 9:16 canvases
// optimized for readability even on tiny mobile screens.
// ─────────────────────────────────────────────────────────────
const sharp = require("sharp");

const escapeXml = (unsafe) =>
    String(unsafe || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");

/**
 * Builds high-visibility YouTube thumbnail text overlay SVG
 */
const buildThumbnailSvg = ({
    width,
    height,
    overlayText = "",
    textColor = "#FFE600",
    strokeColor = "#000000",
    position = "left",
    isShort = false,
}) => {
    const rawWords = String(overlayText).trim().split(/\s+/).filter(Boolean);
    if (!rawWords.length) return null;

    // Format into 1 or 2 big punchy lines
    const lines = [];
    if (rawWords.length <= 2) {
        lines.push(rawWords.join(" "));
    } else {
        const mid = Math.ceil(rawWords.length / 2);
        lines.push(rawWords.slice(0, mid).join(" "));
        lines.push(rawWords.slice(mid).join(" "));
    }

    const fontSize = isShort ? Math.round(width * 0.12) : Math.round(height * 0.17);
    const strokeWidth = Math.max(8, Math.round(fontSize * 0.14));
    const lineHeight = Math.round(fontSize * 1.15);

    // Anchor coordinates
    let startX = Math.round(width * 0.07);
    let textAnchor = "start";
    if (position === "right") {
        startX = Math.round(width * 0.93);
        textAnchor = "end";
    } else if (position === "center") {
        startX = Math.round(width * 0.5);
        textAnchor = "middle";
    }

    const startY = isShort ? Math.round(height * 0.35) : Math.round(height * 0.42);

    const textElements = lines.map((line, idx) => {
        const y = startY + idx * lineHeight;
        const safeText = escapeXml(line.toUpperCase());
        return `
            <text x="${startX}" y="${y}" font-family="Impact, Arial Black, sans-serif" font-weight="900" font-size="${fontSize}"
                text-anchor="${textAnchor}" letter-spacing="1"
                paint-order="stroke fill" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linejoin="round"
                fill="${textColor}" filter="url(#ytShadow)">
                ${safeText}
            </text>
        `;
    }).join("\n");

    return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <filter id="ytShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="4" dy="8" stdDeviation="6" flood-color="#000000" flood-opacity="0.9" />
            </filter>
            <!-- Optional subtle cinematic dark gradient along the text side -->
            <linearGradient id="scrim" x1="${position === "right" ? "100%" : "0%"}" y1="0%" x2="${position === "right" ? "0%" : "100%"}" y2="0%">
                <stop offset="0%" stop-color="#000000" stop-opacity="0.55" />
                <stop offset="60%" stop-color="#000000" stop-opacity="0.15" />
                <stop offset="100%" stop-color="#000000" stop-opacity="0" />
            </linearGradient>
        </defs>

        <!-- Scrim backing for maximum contrast -->
        <rect x="0" y="0" width="${width}" height="${height}" fill="url(#scrim)" />

        <!-- High-Impact YouTube Typography -->
        ${textElements}
    </svg>`;
};

/**
 * Composite raw image buffer + YouTube overlay SVG -> final JPEG buffer
 */
const composeYouTubeThumbnail = async ({
    imageBuffer,
    overlayText = "",
    textColor = "#FFE600",
    strokeColor = "#000000",
    position = "left",
    aspectRatio = "16:9",
}) => {
    const isShort = aspectRatio === "9:16";
    const targetW = isShort ? 1080 : 1920;
    const targetH = isShort ? 1920 : 1080;

    // Resize input photo to exact YouTube thumbnail canvas
    const base = await sharp(imageBuffer)
        .resize(targetW, targetH, { fit: "cover", position: "center" })
        .toBuffer();

    if (!overlayText || !overlayText.trim()) {
        return sharp(base).jpeg({ quality: 92 }).toBuffer();
    }

    const svg = buildThumbnailSvg({
        width: targetW,
        height: targetH,
        overlayText: overlayText.trim(),
        textColor,
        strokeColor,
        position,
        isShort,
    });

    const finalJpeg = await sharp(base)
        .composite([{ input: Buffer.from(svg), left: 0, top: 0 }])
        .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
        .toBuffer();

    return finalJpeg;
};

module.exports = {
    composeYouTubeThumbnail,
    buildThumbnailSvg,
};


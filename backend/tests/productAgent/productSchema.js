/**
 * Output validator for the Product AI Agent.
 *  validateShape(profile)          -> structural errors (JSON contract)
 *  checkExpectations(profile, tc)  -> behaviour errors for one dataset case
 * Both return string[]; empty array = pass.
 */

// we are createing i need this data whcih constains these data EXPECTED_KEYS its mandaory to have thiese key  

const EXPECTED_KEYS = [
    "name", "category", "description", "features", "benefits",
    "uses", "targetAudience", "price", "positioning", "keywords",
];
const STRING_FIELDS = ["name", "category", "description", "positioning"];
const ARRAY_FIELDS = ["features", "benefits", "uses", "targetAudience", "keywords"];
const NO_NAME = /^\s*$|^(unknown|n\/?a|none|not specified|not a product|unspecified)/i;

function validateShape(p) {
    const errors = [];
    if (!p || typeof p !== "object" || Array.isArray(p)) return ["Output is not a JSON object"];

    for (const k of EXPECTED_KEYS) if (!(k in p)) errors.push(`Missing key "${k}"`);
    for (const k of Object.keys(p))
        if (!EXPECTED_KEYS.includes(k)) errors.push(`Unexpected key "${k}" (schema drift or injection)`);

    for (const k of STRING_FIELDS)
        if (k in p && typeof p[k] !== "string") errors.push(`"${k}" must be a string, got ${typeof p[k]}`);

    for (const k of ARRAY_FIELDS) {
        if (!(k in p)) continue;
        if (!Array.isArray(p[k])) { errors.push(`"${k}" must be an array`); continue; }
        if (p[k].some((v) => typeof v !== "string" || !v.trim()))
            errors.push(`"${k}" must contain only non-empty strings`);
    }

    if ("price" in p) {
        const pr = p.price;
        if (!pr || typeof pr !== "object") errors.push(`"price" must be an object`);
        else {
            const a = pr.amount;
            if (!(a === null || (typeof a === "number" && Number.isFinite(a) && a >= 0)))
                errors.push(`"price.amount" must be a non-negative number or null, got ${JSON.stringify(a)}`);
            if (typeof pr.currency !== "string" || !/^[A-Z]{3}$/.test(pr.currency))
                errors.push(`"price.currency" must be a 3-letter code, got ${JSON.stringify(pr.currency)}`);
        }
    }
    return errors;
}

/** numbers that literally appear in the input (handles 1,299 / ₹899 / Devanagari digits) */
function numbersInInput(input) {
    const latin = String(input)
        .replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d)))
        .replace(/(\d),(?=\d)/g, "$1");
    return (latin.match(/\d+(\.\d+)?/g) || []).map(Number);
}

function checkExpectations(p, tc) {
    const e = tc.expect || {};
    const errors = [];
    const blob = JSON.stringify(p);
    const amount = p?.price?.amount;
    const noPrice = amount === 0 || amount === null || amount === undefined;

    if (e.name && !e.name.test(p.name || "")) errors.push(`name "${p.name}" does not match ${e.name}`);
    if (e.category && !e.category.test(p.category || ""))
        errors.push(`category "${p.category}" does not match ${e.category}`);

    if ("price" in e) {
        if (e.price === null) {
            if (!noPrice) errors.push(`Hallucinated price ${amount} — input has no price`);
        } else if (Array.isArray(e.price)) {
            if (!e.price.includes(amount)) errors.push(`price ${amount} not one of [${e.price}]`);
        } else if (amount !== e.price) errors.push(`price ${amount} !== expected ${e.price}`);
    }

    if (e.currency && p?.price?.currency !== e.currency)
        errors.push(`currency "${p?.price?.currency}" !== "${e.currency}"`);

    // Grounding: any non-zero price must literally exist in the input
    if (!e.allowDerivedPrice && !noPrice && !numbersInInput(tc.input).includes(amount))
        errors.push(`price ${amount} is not present in the input (invented)`);

    for (const re of e.mustMention || [])
        if (!re.test(blob)) errors.push(`missing expected info ${re}`);
    for (const re of e.mustNotMention || [])
        if (re.test(blob)) errors.push(`contains forbidden/invented content ${re}`);

    if (typeof e.maxFeatures === "number" && (p.features || []).length > e.maxFeatures)
        errors.push(`${p.features.length} features for a minimal input (max ${e.maxFeatures}) — likely invented`);

    if (e.emptyProfile) {
        if (!NO_NAME.test(p.name || "")) errors.push(`Invented a product "${p.name}" for non-product input`);
        if ((p.features || []).length) errors.push(`Invented features for non-product input`);
        if (!noPrice && !e.price) errors.push(`Invented price ${amount} for non-product input`);
    } else if (!(e.name && e.name.test("")) && !(p.name || "").trim()) {
        errors.push(`name is empty for a valid product`);
    }

    if (typeof e.custom === "function") {
        const msg = e.custom(p);
        if (msg) errors.push(msg);
    }
    return errors;
}

module.exports = { validateShape, checkExpectations, EXPECTED_KEYS };

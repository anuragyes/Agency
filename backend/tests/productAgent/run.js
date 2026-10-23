/**
 * Live-progress runner for the Product AI Agent tests (same dataset and checks as productAgent.test.js).
 * Prints each case as soon as it finishes.   Usage: npm run eval:agent
 * Supports the same env vars: ONLY, RUNS, DELAY_MS, TIMEOUT_MS
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env"), quiet: true });
const fs = require("fs");
const testCases = require("./dataset");
const { validateShape, checkExpectations } = require("./productSchema");
const generateProductProfile = require("../../ai/ProductAiAgent");

const RUNS = Math.max(1, Number(process.env.RUNS) || 1);
const TIMEOUT = Number(process.env.TIMEOUT_MS) || 60_000;
const DELAY = Number(process.env.DELAY_MS) || 0;
const ONLY = process.env.ONLY ? process.env.ONLY.split(",").map((s) => s.trim()) : null;
const cases = testCases.filter((c) => !ONLY || ONLY.includes(c.category) || ONLY.includes(c.id));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p) => Promise.race([p, sleep(TIMEOUT).then(() => { throw new Error(`timeout after ${TIMEOUT}ms`); })]);

(async () => {
    if (!process.env.GEMINI_API_KEY) console.warn("WARNING: GEMINI_API_KEY is not set in backend/.env");
    console.log(`Running ${cases.length * RUNS} test(s)...\n`);
    const results = [];
    let n = 0;
    for (const tc of cases) {
        for (let run = 1; run <= RUNS; run++) {
            n++;
            if (DELAY) await sleep(DELAY);
            const start = Date.now();
            let output = null, failures;
            try {
                output = await withTimeout(generateProductProfile(tc.input));
                failures = [...validateShape(output), ...checkExpectations(output, tc)];
            } catch (err) {
                failures = [`Agent threw: ${err.message}`];
            }
            const ms = Date.now() - start;
            const passed = failures.length === 0;
            results.push({ id: tc.id, category: tc.category, run, input: tc.input, passed, failures, output, latencyMs: ms });
            console.log(`${passed ? "PASS" : "FAIL"}  [${n}/${cases.length * RUNS}] ${tc.category} / ${tc.id}${RUNS > 1 ? ` #${run}` : ""}  (${ms}ms)`);
            if (!passed) {
                console.log(`      input: ${JSON.stringify(tc.input)}`);
                failures.forEach((f) => console.log(`      - ${f}`));
            }
        }
    }

    const byCat = {};
    for (const r of results) {
        byCat[r.category] ??= { pass: 0, total: 0 };
        byCat[r.category].total++;
        if (r.passed) byCat[r.category].pass++;
    }
    const passed = results.filter((r) => r.passed).length;
    console.log("\n================ PRODUCT AGENT SCORECARD ================");
    console.table(Object.fromEntries(Object.entries(byCat).map(([k, v]) => [k, { pass: `${v.pass}/${v.total}`, "rate %": +(v.pass / v.total * 100).toFixed(1) }])));
    console.log(`OVERALL: ${passed}/${results.length} (${(passed / results.length * 100).toFixed(1)}%)`);

    const dir = path.join(__dirname, "results");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(file, JSON.stringify({ summary: { passed, total: results.length, byCategory: byCat }, results }, null, 2));
    console.log(`Report: ${path.relative(process.cwd(), file)}`);
    process.exit(passed === results.length ? 0 : 1);
})();

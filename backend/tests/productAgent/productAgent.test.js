/**
 * Product AI Agent — behaviour test suite (real LLM calls).
 *
 * Run all:            node --test tests/productAgent/productAgent.test.js
 *   or                npm run test:agent
 * Only some groups:   ONLY=injection,hallucination npm run test:agent
 * Only one case:      ONLY=hinglish-ghee npm run test:agent
 * Consistency check:  RUNS=3 npm run test:agent      (each case 3x — LLMs are non-deterministic)
 * Slow down (quota):  DELAY_MS=1500 npm run test:agent
 *
 * A JSON report with every input/output/failure is written to tests/productAgent/results/.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env"), quiet: true });    // taking api key to access the LLM model or api key 

const fs = require("fs");   //  file sysytem 
const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");

const testCases = require("./dataset");   //import data from dataset
const { validateShape, checkExpectations } = require("./productSchema");

// AGENT_MOCK=path/to/fake.js lets you test the harness itself without spending API calls
const generateProductProfile = process.env.AGENT_MOCK
    ? require(path.resolve(process.env.AGENT_MOCK))
    : require("../../ai/ProductAiAgent");

const RUNS = Math.max(1, Number(process.env.RUNS) || 1);
const TIMEOUT = Number(process.env.TIMEOUT_MS) || 60_000;
const DELAY = Number(process.env.DELAY_MS) || 0;
const ONLY = process.env.ONLY ? process.env.ONLY.split(",").map((s) => s.trim()) : null;

const cases = testCases.filter((c) => !ONLY || ONLY.includes(c.category) || ONLY.includes(c.id));
const categories = [...new Set(cases.map((c) => c.category))];
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const category of categories) {
    describe(`[${category}]`, () => {
        for (const tc of cases.filter((c) => c.category === category)) {
            for (let run = 1; run <= RUNS; run++) {
                it(`${tc.id}${RUNS > 1 ? ` (run ${run})` : ""}`, { timeout: TIMEOUT }, async () => {
                    if (DELAY) await sleep(DELAY);
                    const start = Date.now();
                    let output = null;
                    let failures;
                    try {
                        output = await generateProductProfile(tc.input);
                        const shape = validateShape(output);
                        failures = shape.length && typeof output !== "object" ? shape : [...shape, ...checkExpectations(output, tc)];
                    } catch (err) {
                        failures = [`Agent threw: ${err.message}`];
                    }
                    results.push({
                        id: tc.id, category, run, input: tc.input,
                        passed: failures.length === 0, failures, output,
                        latencyMs: Date.now() - start,
                    });
                    assert.equal(failures.length, 0, `\n  input: ${JSON.stringify(tc.input)}\n  - ${failures.join("\n  - ")}`);
                });
            }
        }
    });
}

after(() => {
    if (!results.length) return;
    const byCat = {};
    for (const r of results) {
        byCat[r.category] ??= { passed: 0, total: 0 };
        byCat[r.category].total++;
        if (r.passed) byCat[r.category].passed++;
    }
    const passed = results.filter((r) => r.passed).length;
    const lat = results.map((r) => r.latencyMs).sort((a, b) => a - b);
    const summary = {
        model: "see Ai/ProductAiAgent.js",
        date: new Date().toISOString(),
        runsPerCase: RUNS,
        overall: { passed, total: results.length, passRate: +(passed / results.length * 100).toFixed(1) },
        latencyMs: { avg: Math.round(lat.reduce((a, b) => a + b, 0) / lat.length), p95: lat[Math.floor(lat.length * 0.95)] ?? lat.at(-1) },
        byCategory: Object.fromEntries(
            Object.entries(byCat).map(([k, v]) => [k, { ...v, passRate: +(v.passed / v.total * 100).toFixed(1) }])
        ),
    };

    const dir = path.join(__dirname, "results");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `report-${summary.date.replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(file, JSON.stringify({ summary, results }, null, 2));

    console.log("\n================ PRODUCT AGENT SCORECARD ================");
    console.table(Object.fromEntries(Object.entries(summary.byCategory).map(([k, v]) => [k, { "pass": `${v.passed}/${v.total}`, "rate %": v.passRate }])));
    console.log(`OVERALL: ${passed}/${results.length} (${summary.overall.passRate}%)  avg latency ${summary.latencyMs.avg}ms  p95 ${summary.latencyMs.p95}ms`);
    console.log(`Report: ${path.relative(process.cwd(), file)}`);
    console.log("=========================================================\n");
});

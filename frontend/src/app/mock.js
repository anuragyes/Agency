// ─────────────────────────────────────────────────────────────
// mock.js — demo data for modules whose backend isn't built yet.
// Replace each export with a real API call as the backend grows.
// ─────────────────────────────────────────────────────────────

export const NOTIFICATIONS = [
  { icon: "sparkles", tone: "violet", title: "3 drafts need approval", sub: "Autopilot finished this week's batch", time: "2m", to: "/app/pipeline" },
  { icon: "magnet", tone: "amber", title: "New hot lead: Jessica Morales", sub: "Intent score 92 · Fernway Agency", time: "8m", to: "/app/leads" },
  { icon: "alert", tone: "red", title: "X token expires in 5 days", sub: "Reconnect to keep publishing", time: "1h", to: "/app/accounts" },
  { icon: "trend", tone: "green", title: "\"AI agents\" is breaking out", sub: "+340% mentions in your niche", time: "3h", to: "/app/trends" },
];

const wave = (n, base, amp, growth = 0, seed = 1) =>
  Array.from({ length: n }, (_, i) => Math.round(base + growth * i + amp * Math.sin(i * 0.9 + seed) + amp * 0.5 * Math.sin(i * 2.1 + seed * 2)));

export const SPARK = {
  up: [12, 14, 13, 17, 16, 20, 19, 24, 27, 26, 31],
  up2: [10, 12, 11, 15, 14, 13, 18, 17, 22, 25],
  wavy: [14, 10, 13, 17, 12, 15, 19, 14, 18, 22],
  down: [22, 18, 20, 16, 17, 13, 14, 11, 12, 9],
  spiky: [10, 18, 9, 16, 11, 19, 8, 17, 12, 18],
};

export const DASH = {
  kpis: [
    { icon: "users", tone: "violet", label: "Total followers", value: "248,532", delta: "12.4%", spark: SPARK.up, color: "#5b4cf6" },
    { icon: "heart", tone: "green", label: "Engagement rate", value: "4.8%", delta: "0.6 pts", spark: SPARK.wavy, color: "#10b981" },
    { icon: "eye", tone: "blue", label: "Total reach", value: "1.2M", delta: "18.1%", spark: SPARK.up2, color: "#0ea5e9" },
    { icon: "magnet", tone: "amber", label: "Leads captured", value: "1,248", delta: "32.4%", spark: SPARK.up, color: "#f59e0b" },
  ],
  ranges: {
    "24h": { labels: ["12a", "3a", "6a", "9a", "12p", "3p", "6p", "9p"], reach: [4200, 3100, 3900, 8800, 12100, 10400, 15800, 13600], eng: [1200, 900, 1100, 2900, 4100, 3600, 5900, 5100] },
    "7d": { labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], reach: [42000, 51000, 49000, 62000, 58000, 86400, 82000, 101000].slice(0, 7), eng: [18000, 22000, 21000, 27000, 24000, 31000, 39000] },
    "30d": { labels: Array.from({ length: 30 }, (_, i) => `Sep ${i + 1}`), reach: wave(30, 30000, 5000, 2200, 1), eng: wave(30, 12000, 2500, 900, 2) },
    quarter: { labels: ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10", "W11", "W12", "W13"], reach: wave(13, 180000, 22000, 21000, 3), eng: wave(13, 70000, 9000, 8000, 4) },
  },
  insights: [
    { icon: "clock", tone: "violet", title: "Post Reels at 7–9 PM", sub: "Engagement is 2.3× higher in the evening", to: "/app/calendar" },
    { icon: "trend", tone: "green", title: "\"AI workflows\" is trending", sub: "+340% mentions in your niche · 2 drafts ready", to: "/app/trends" },
    { icon: "swords", tone: "amber", title: "Competitor B launched a series", sub: "Carousel format, 12% avg. engagement", to: "/app/competitors" },
    { icon: "alert", tone: "red", title: "X engagement dropped 9%", sub: "Try threads with a strong first-line hook", to: "/app/analyst" },
  ],
  topPosts: [
    { title: "5 AI tools that save 10h/week", type: "Carousel", date: "Sep 22", ch: "instagram", reach: "84.2K", eng: "7.9%", score: 96 },
    { title: "How we grew a B2B brand 3×", type: "Document", date: "Sep 21", ch: "linkedin", reach: "52.6K", eng: "6.1%", score: 91 },
    { title: "Behind the scenes: launch day", type: "Reel", date: "Sep 20", ch: "tiktok", reach: "41.9K", eng: "5.4%", score: 84 },
  ],
  audience: [
    { label: "Instagram", value: 42, color: "#5b4cf6" },
    { label: "LinkedIn", value: 26, color: "#0ea5e9" },
    { label: "TikTok", value: 18, color: "#d946ef" },
    { label: "Other", value: 14, color: "#f59e0b" },
  ],
  upNext: [
    { m: "SEP", d: 26, title: "AI trends weekly recap", ch: "linkedin", meta: "10:30 AM · Scheduled", accent: true },
    { m: "SEP", d: 26, title: "Product teaser reel", ch: "instagram", meta: "7:15 PM · Needs approval" },
    { m: "SEP", d: 27, title: "Customer story thread", ch: "x", meta: "9:00 AM · Scheduled" },
    { m: "SEP", d: 28, title: "Weekend tips carousel", ch: "facebook", meta: "11:00 AM · Draft" },
  ],
};

export const ACCOUNTS = [
  { key: "instagram", name: "Instagram", handle: "@northbeam.studio", status: "connected", followers: "104.2K", eng: "5.6%", ppw: 12, autopilot: true, spark: SPARK.up },
  { key: "linkedin", name: "LinkedIn", handle: "Northbeam Studio", status: "connected", followers: "64.8K", eng: "6.1%", ppw: 8, autopilot: true, spark: SPARK.up2 },
  { key: "tiktok", name: "TikTok", handle: "@northbeam", status: "connected", followers: "44.7K", eng: "8.2%", ppw: 10, autopilot: true, spark: SPARK.wavy },
  { key: "x", name: "X (Twitter)", handle: "@northbeamHQ", status: "reconnect", followers: "21.3K", eng: "2.4%", ppw: 14, autopilot: false, spark: SPARK.spiky },
  { key: "youtube", name: "YouTube", handle: "Northbeam Studio", status: "connected", followers: "9.8K", eng: "4.1%", ppw: 2, autopilot: true, spark: SPARK.up },
  { key: "facebook", name: "Facebook", handle: "Northbeam Studio", status: "connected", followers: "3.7K", eng: "1.9%", ppw: 5, autopilot: false, spark: SPARK.wavy },
  { key: "pinterest", name: "Pinterest", status: "available" },
  { key: "threads", name: "Threads", status: "available" },
  { key: "whatsapp", name: "WhatsApp Business", status: "available" },
];

export const PIPELINE_DEMO = {
  drafting: [
    { title: "Why agencies are switching to AI reporting", ch: "linkedin", progress: 72, label: "Writing… 72%", who: "Sarah Johnson" },
    { title: "5 prompts for better captions", ch: "instagram", progress: 55, label: "Generating visuals", who: "Mo Reyes" },
    { title: "Thread: our 30-day growth sprint", ch: "x", progress: 40, label: "Writing… 40%", who: "Ava Lin" },
  ],
  safety: [
    { title: "Launch day behind the scenes", ch: "tiktok", pill: ["green", "Tone check passed"], who: "Sarah Johnson", cover: true },
    { title: "Customer love wall — September", ch: "instagram", pill: ["amber", "Checking image rights"], who: "Mo Reyes" },
    { title: "Hot take: vanity metrics are dead", ch: "linkedin", pill: ["red", "Claim needs a source"], who: "Ava Lin" },
  ],
  approval: [
    { title: "Product teaser reel", ch: "instagram", pill: ["amber", "Sarah J. · due 5 PM"], who: "Sarah Johnson", cover: true, actions: true },
    { title: "Insights 2.0 launch post", ch: "linkedin", pill: ["amber", "Client: Acme · due today"], who: "Mo Reyes" },
    { title: "Tutorial ep. 5 thumbnail", ch: "youtube", pill: ["amber", "Mo R. · due tomorrow"], who: "Ava Lin" },
  ],
  scheduled: [
    { title: "AI trends weekly recap", ch: "linkedin", pill: ["violet", "Today · 10:30 AM"], who: "Sarah Johnson", cover: true },
    { title: "Weekend tips carousel", ch: "instagram", pill: ["violet", "Sep 28 · 11:00 AM"], who: "Mo Reyes" },
    { title: "Customer story thread", ch: "x", pill: ["violet", "Sep 27 · 9:00 AM"], who: "Ava Lin" },
  ],
  published: [
    { title: "5 AI tools that save 10h/week", ch: "instagram", pill: ["green", "84.2K reach · 7.9%"], who: "Sarah Johnson", cover: true },
    { title: "How we grew a B2B brand 3×", ch: "linkedin", pill: ["green", "52.6K reach · 6.1%"], who: "Mo Reyes" },
    { title: "Behind the scenes: launch day", ch: "tiktok", pill: ["green", "41.9K reach · 5.4%"], who: "Ava Lin" },
  ],
};

// Calendar demo events for Sept 2026 (day -> events)
export const CAL_DEMO = {
  1: [["linkedin", "9:00", "AI trends", "pub"]],
  2: [["instagram", "18:00", "Tool stack", "pub"], ["x", "12:00", "Hot take", "pub"]],
  3: [["tiktok", "19:00", "BTS reel", "pub"]],
  4: [["linkedin", "10:30", "Case study", "pub"]],
  7: [["instagram", "19:15", "5 AI tools", "pub"], ["linkedin", "9:00", "Hiring post", "pub"]],
  8: [["x", "11:00", "Thread: workflows", "pub"]],
  9: [["youtube", "17:00", "Tutorial ep. 4", "pub"], ["instagram", "20:00", "Story poll", "pub"]],
  10: [["linkedin", "10:30", "Webinar invite", "pub"]],
  11: [["tiktok", "18:30", "Trend remix", "pub"], ["instagram", "12:00", "Meme Monday", "pub"]],
  14: [["linkedin", "9:00", "Weekly recap", "pub"]],
  15: [["instagram", "19:00", "Reel: tips", "pub"], ["x", "13:00", "Poll", "pub"], ["tiktok", "20:00", "Duet", "pub"]],
  16: [["linkedin", "10:00", "Guide drop", "pub"]],
  17: [["instagram", "18:00", "Customer love", "pub"]],
  18: [["x", "9:30", "Industry news", "pub"], ["linkedin", "12:00", "Founder story", "pub"]],
  21: [["instagram", "19:15", "Carousel: AI", "pub"], ["linkedin", "10:30", "B2B growth", "pub"]],
  22: [["tiktok", "19:00", "Launch day", "pub"]],
  23: [["x", "12:00", "Q&A", "pub"], ["youtube", "17:00", "Short: 80/20", "pub"]],
  24: [["linkedin", "9:00", "Report teaser", "pub"]],
  25: [["instagram", "18:00", "Insights 2.0", "pub"], ["tiktok", "20:00", "Before/after", "pub"]],
  26: [["linkedin", "10:30", "AI recap", "sch"], ["instagram", "19:15", "Teaser reel", "appr"]],
  27: [["x", "9:00", "Customer story", "sch"]],
  28: [["instagram", "11:00", "Weekly tips", "sch"], ["ai", "", "Trend: AI agents", "ai"]],
  29: [["linkedin", "10:30", "Insights launch", "sch"], ["ai", "", "Poll idea", "ai"]],
  30: [["ai", "", "Case study slides", "ai"]],
};

export const DRAFTS_DEMO = [
  { title: "Q4 planning template", ch: "instagram" },
  { title: "Webinar recap thread", ch: "x" },
  { title: "Team spotlight: design", ch: "linkedin" },
  { title: "Myth vs fact carousel", ch: "instagram" },
];

export const TRENDS = [
  { name: "AI agents for marketing", cat: "Technology", vol: "412K", growth: 340, fit: 96, spark: [5, 6, 6, 7, 8, 10, 14, 20], create: true },
  { name: "Zero-click content", cat: "Strategy", vol: "188K", growth: 122, fit: 91, spark: [6, 7, 7, 8, 9, 11, 13, 15], create: true },
  { name: "Founder-led marketing", cat: "B2B", vol: "164K", growth: 86, fit: 88, spark: [5, 6, 8, 9, 9, 10, 12, 14], create: true },
  { name: "Short-form B2B video", cat: "Video", vol: "141K", growth: 64, fit: 84, spark: [6, 5, 7, 8, 7, 9, 10, 12] },
  { name: "Community-led growth", cat: "Community", vol: "96K", growth: 48, fit: 79, spark: [8, 5, 7, 4, 8, 10, 11, 10] },
  { name: "Q4 planning", cat: "Seasonal", vol: "88K", growth: 41, fit: 76, spark: [5, 6, 6, 8, 7, 9, 10, 11] },
  { name: "AI search (GEO)", cat: "SEO", vol: "73K", growth: 38, fit: 72, spark: [4, 5, 5, 6, 6, 8, 11, 12] },
  { name: "Creator partnerships", cat: "Influencer", vol: "61K", growth: 22, fit: 64, spark: [5, 6, 12, 5, 11, 6, 12, 11] },
  { name: "Remote team culture", cat: "Workplace", vol: "54K", growth: -6, fit: 41, spark: [10, 9, 9, 8, 9, 7, 6, 6] },
];

export const COMPETITORS = [
  { name: "Northbeam Studio (you)", short: "NS", you: true, followers: "248.5K", growth: 12.4, eng: 4.8, ppw: 18, format: "Carousel", sov: 34, color: "#5b4cf6", spark: SPARK.up },
  { name: "Competitor A · Brightloop", short: "B", followers: "312.0K", growth: 4.1, eng: 3.2, ppw: 22, format: "Video", sov: 28, color: "#0ea5e9", spark: SPARK.spiky },
  { name: "Competitor B · Stackwise", short: "S", followers: "186.4K", growth: 9.8, eng: 5.1, ppw: 14, format: "Reels", sov: 21, color: "#d946ef", spark: SPARK.up2 },
  { name: "Competitor C · Vantage", short: "V", followers: "141.2K", growth: 1.2, eng: 2.6, ppw: 9, format: "Text", sov: 11, color: "#f59e0b", spark: [10, 10, 10, 10, 10, 10, 10, 10] },
  { name: "Competitor D · Pixelforge", short: "P", followers: "98.7K", growth: -2.3, eng: 2.1, ppw: 7, format: "Images", sov: 6, color: "#9ca3af", spark: SPARK.down },
];

export const COMP_POSTS = [
  { brand: "Brightloop", ch: "instagram", title: "We tested 12 AI tools so you don't have to", views: "48.2K", eng: "9.4%", seed: "a" },
  { brand: "Stackwise", ch: "tiktok", title: "POV: your client asks for the report again", views: "112K", eng: "12.1%", seed: "b" },
  { brand: "Vantage", ch: "linkedin", title: "The 2027 B2B benchmark report is live", views: "21.6K", eng: "4.2%", seed: "c" },
  { brand: "Stackwise", ch: "instagram", title: "Office tour: how we work remotely", views: "36.9K", eng: "7.8%", seed: "f" },
];

export const HASHTAGS = [
  { tag: "#aimarketing", posts: "4.2M", comp: "High", rel: 96, reach: "48K", sel: true },
  { tag: "#marketingautomation", posts: "1.1M", comp: "Medium", rel: 94, reach: "32K", sel: true },
  { tag: "#agencylife", posts: "2.8M", comp: "Medium", rel: 90, reach: "29K", sel: true },
  { tag: "#socialmediatips", posts: "12.4M", comp: "High", rel: 82, reach: "21K" },
  { tag: "#contentstrategy", posts: "3.3M", comp: "Medium", rel: 88, reach: "26K", sel: true },
  { tag: "#b2bmarketing", posts: "920K", comp: "Low", rel: 86, reach: "18K", sel: true },
  { tag: "#aitools", posts: "6.1M", comp: "High", rel: 79, reach: "14K" },
  { tag: "#growthmarketing", posts: "740K", comp: "Low", rel: 74, reach: "12K" },
  { tag: "#contentcreator", posts: "18.9M", comp: "High", rel: 68, reach: "11K" },
  { tag: "#smallbusinesstips", posts: "2.2M", comp: "Medium", rel: 66, reach: "10K" },
  { tag: "#agencyowner", posts: "310K", comp: "Low", rel: 81, reach: "9K" },
  { tag: "#northbeamtips", posts: "12K", comp: "Low", rel: 99, reach: "4K" },
];

export const PERSONAS = [
  { icon: "rocket", grad: "linear-gradient(135deg,#6366f1,#a855f7)", name: "Growth-focused founder", pct: 42, desc: "Founders of 10–50 person B2B startups. Want predictable pipeline, hate fluff.", ch: ["LinkedIn", "Threads", "Podcasts"] },
  { icon: "building", grad: "linear-gradient(135deg,#8b5cf6,#d946ef)", name: "Agency marketing lead", pct: 33, desc: "Juggles 5–15 clients. Looks for tools, templates and time savers.", ch: ["Instagram", "LinkedIn", "YouTube"] },
  { icon: "sparkles", grad: "linear-gradient(135deg,#f97316,#f43f5e)", name: "Aspiring creator", pct: 25, desc: "Early-career marketers building a personal brand. Love tutorials.", ch: ["TikTok", "Instagram", "X"] },
];

export const HEAT = (() => {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const base = [0.1, 0.05, 0.22, 0.62, 0.55, 0.45, 0.78, 0.58];
  return days.map((d, di) => ({
    label: d,
    values: base.map((b, i) => Math.min(1, Math.max(0.02, b + (di === 3 && i === 6 ? 0.22 : 0) - (di >= 5 && i >= 3 ? 0.18 : 0) + ((di * 7 + i * 3) % 5) * 0.02))),
  }));
})();

export const INBOX = [
  { id: 1, name: "Jessica Morales", ch: "instagram", time: "2m", text: "Could we get a quick demo next week?", tag: ["amber", "Sales"], role: "Head of Marketing @ Fernway", intent: 92 },
  { id: 2, name: "Daniel Kim", ch: "linkedin", time: "8m", text: "Loved the case study! Which CRM do you integrate with?", tag: ["amber", "Sales"], role: "Founder @ Orbitly", intent: 86 },
  { id: 3, name: "@growthwithpriya", ch: "x", time: "14m", text: "Mentioned you: best tool stack for agencies 🔥", tag: ["green", "Positive"], role: "Creator", intent: 40 },
  { id: 4, name: "Marcus Chen", ch: "instagram", time: "21m", text: "The link in bio isn't working for me", tag: ["red", "Issue"], role: "Customer", intent: 20 },
  { id: 5, name: "Emma Wilson", ch: "tiktok", time: "34m", text: "What app is this?? Need it", tag: ["amber", "Sales"], role: "Social Lead @ Bloomcart", intent: 74 },
  { id: 6, name: "Olivia Brown", ch: "facebook", time: "1h", text: "Great webinar yesterday, thank you!", tag: ["green", "Positive"], role: "Attendee", intent: 30 },
  { id: 7, name: "Ryan Patel", ch: "linkedin", time: "1h", text: "Are you hiring for remote roles?", tag: ["blue", "Question"], role: "CMO @ Northwind Labs", intent: 15 },
  { id: 8, name: "Sofia Garcia", ch: "youtube", time: "2h", text: "Can you do a tutorial on the calendar?", tag: ["blue", "Question"], role: "Marketing Mgr @ Casa Verde", intent: 48 },
  { id: 9, name: "Liam Turner", ch: "x", time: "3h", text: "Your pricing page is confusing tbh", tag: ["red", "Negative"], role: "Visitor", intent: 22 },
];

export const LEADS = [
  { name: "Jessica Morales", role: "Head of Marketing", company: "Fernway Agency", ch: "instagram", source: "Comment · DEMO", score: 92, signal: "Asked for demo + pricing", status: ["green", "Demo booked"], temp: "hot" },
  { name: "Daniel Kim", role: "Founder", company: "Orbitly", ch: "linkedin", source: "DM", score: 86, signal: "Compared with current tool", status: ["violet", "Contacted"], temp: "hot" },
  { name: "Emma Wilson", role: "Social Lead", company: "Bloomcart", ch: "tiktok", source: "Link in bio", score: 74, signal: "Visited pricing 3×", status: ["blue", "New"], temp: "hot" },
  { name: "Ryan Patel", role: "CMO", company: "Northwind Labs", ch: "linkedin", source: "Webinar", score: 61, signal: "Downloaded guide", status: ["amber", "Nurturing"], temp: "warm" },
  { name: "Sofia Garcia", role: "Marketing Mgr", company: "Casa Verde", ch: "facebook", source: "Lead form", score: 48, signal: "Generic question", status: ["blue", "New"], temp: "cold" },
];

export const CHANNEL_PERF = [
  { ch: "instagram", name: "Instagram", posts: 22, reach: "486K", eng: "5.6%", followers: "+4,210", clicks: "3,820", leads: 402, spark: SPARK.up },
  { ch: "linkedin", name: "LinkedIn", posts: 16, reach: "312K", eng: "6.1%", followers: "+2,640", clicks: "2,910", leads: 524, spark: SPARK.up2 },
  { ch: "tiktok", name: "TikTok", posts: 12, reach: "268K", eng: "8.2%", followers: "+5,120", clicks: "1,240", leads: 86, spark: SPARK.up },
  { ch: "x", name: "X", posts: 12, reach: "94K", eng: "2.4%", followers: "+310", clicks: "980", leads: 74, spark: SPARK.down, down: true },
  { ch: "youtube", name: "YouTube", posts: 4, reach: "61K", eng: "4.1%", followers: "+880", clicks: "470", leads: 102, spark: SPARK.wavy },
];

export const TEAM = [
  { name: "Sarah Johnson", email: "sarah@northbeam.studio", role: ["violet", "Admin"] },
  { name: "Mo Reyes", email: "mo@northbeam.studio", role: ["blue", "Editor"] },
  { name: "Ava Lin", email: "ava@northbeam.studio", role: ["blue", "Editor"] },
  { name: "Kai Tan", email: "kai@northbeam.studio", role: ["amber", "Approver"] },
];

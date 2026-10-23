// ─────────────────────────────────────────────────────────────
// Icon.jsx — one small stroke-icon set for the whole app (no extra npm package)
// Usage: <Icon name="sparkles" size={18} />
// ─────────────────────────────────────────────────────────────
const P = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>,
  link: <><path d="M9 17H7A5 5 0 0 1 7 7h2" /><path d="M15 7h2a5 5 0 1 1 0 10h-2" /><path d="M8 12h8" /></>,
  sparkles: <><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" /><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /><path d="M5 3.5l.6 1.4 1.4.6-1.4.6L5 7.5l-.6-1.4L3 5.5l1.4-.6z" /></>,
  pen: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  pipeline: <><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M6 8.5v4a3 3 0 0 0 3 3h6.5" /><path d="M18 15.5V9a3 3 0 0 0-3-3h-3" /><path d="m14 4-2 2 2 2" /></>,
  repeat: <><path d="m17 2 4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="m7 22-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></>,
  trend: <><path d="m22 7-8.5 8.5-5-5L2 17" /><path d="M16 7h6v6" /></>,
  swords: <><path d="M14.5 17.5 3 6V3h3l11.5 11.5" /><path d="m13 19 6-6M16 16l4 4M19 21l2-2" /><path d="M14.5 6.5 18 3h3v3l-3.5 3.5" /><path d="m5 14 4 4M7 17l-3 3M3 19l2 2" /></>,
  hash: <><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
  scan: <><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><circle cx="12" cy="12" r="3" /><path d="m16 16-1.9-1.9" /></>,
  inbox: <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z" /></>,
  bot: <><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M12 8V4M8 4h8" /><circle cx="8.5" cy="14" r="1" /><circle cx="15.5" cy="14" r="1" /></>,
  magnet: <><path d="m6 15-4-4 6.8-6.8a5.7 5.7 0 0 1 8 8L10 19l-4-4" /><path d="m5 8 4 4M12 15l4 4" /></>,
  chart: <><path d="M3 3v18h18" /><path d="M7 16v-3M11 16V9M15 16v-5M19 16V6" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  help: <><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" /></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronUpDown: <><path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" /></>,
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  arrowRight: <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>,
  arrowLeft: <><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></>,
  arrowUpRight: <><path d="M7 17 17 7" /><path d="M7 7h10v10" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  minus: <path d="M5 12h14" />,
  x: <><path d="M18 6 6 18M6 6l12 12" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  checkCircle: <><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></>,
  alert: <><path d="m10.3 3.9-8.2 14a2 2 0 0 0 1.7 3h16.4a2 2 0 0 0 1.7-3l-8.2-14a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5M12 15V3" /></>,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5M12 3v12" /></>,
  share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></>,
  imagePlus: <><path d="M16 5h6M19 2v6" /><path d="M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /><circle cx="9" cy="9" r="2" /></>,
  video: <><path d="m22 8-6 4 6 4V8z" /><rect x="2" y="6" width="14" height="12" rx="2" /></>,
  layers: <><path d="m12 2 10 5-10 5L2 7z" /><path d="m2 17 10 5 10-5M2 12l10 5 10-5" /></>,
  carousel: <><rect x="6" y="4" width="12" height="16" rx="2" /><path d="M2 7v10M22 7v10" /></>,
  bulb: <><path d="M9 18h6M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z" /></>,
  wand: <><path d="m15 4-1 1 5 5 1-1a2.8 2.8 0 0 0-4-4z" /><path d="M14 5 3 16l5 5L19 10" /><path d="M5 3v2M4 4h2M19 17v2M18 18h2" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l4 2" /></>,
  template: <><rect x="3" y="3" width="18" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  copy: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  send: <><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></>,
  refresh: <><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5M3 21v-5h5" /></>,
  filter: <path d="M22 3H2l8 9.5V19l4 2v-8.5z" />,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  trash: <><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></>,
  heart: <path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z" />,
  message: <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.2a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.5-8.5h.5a8.5 8.5 0 0 1 8 8z" />,
  bookmark: <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></>,
  shieldCheck: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></>,
  rocket: <><path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1z" /><path d="m12 15-3-3a22 22 0 0 1 2-4A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2z" /><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5" /></>,
  flame: <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.5.5 1 1.5 2 2.5 3z" />,
  target: <><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>,
  globe: <><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></>,
  mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  key: <><circle cx="7.5" cy="15.5" r="5.5" /><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3" /></>,
  card: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>,
  building: <><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01" /></>,
  brain: <><path d="M12 5a3 3 0 1 0-6 .1 4 4 0 0 0-2.5 5.8A4 4 0 0 0 6 18a4 4 0 0 0 6 1z" /><path d="M12 5a3 3 0 1 1 6 .1 4 4 0 0 1 2.5 5.8A4 4 0 0 1 18 18a4 4 0 0 1-6 1z" /><path d="M12 5v14" /></>,
  plug: <><path d="M12 22v-5M9 8V2M15 8V2" /><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z" /></>,
  database: <><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5" /><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3" /></>,
  pause: <><circle cx="12" cy="12" r="10" /><path d="M10 15V9M14 15V9" /></>,
  play: <path d="m6 3 14 9-14 9z" />,
  flag: <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><path d="M4 22v-7" /></>,
  tag: <><path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z" /><circle cx="7.5" cy="7.5" r="1" /></>,
  archive: <><rect x="2" y="3" width="20" height="5" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4" /></>,
  userPlus: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></>,
  paperclip: <path d="m21.4 11-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />,
  smile: <><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></>,
  at: <><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" /></>,
  bold: <><path d="M6 12h9a4 4 0 0 1 0 8H6V4h8a4 4 0 0 1 0 8" /></>,
  italic: <><path d="M19 4h-9M14 20H5M15 4 9 20" /></>,
  dollar: <><circle cx="12" cy="12" r="10" /><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 18V6" /></>,
  phone: <><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" /></>,
  zoomIn: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3M11 8v6M8 11h6" /></>,
  expand: <><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></>,
  flask: <><path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3" /><path d="M7 15h10" /></>,
  thumbsUp: <><path d="M7 10v12M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.8a2 2 0 0 0 1.8-1.1L12 2a3.1 3.1 0 0 1 3 3.9z" /></>,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  grip: <><circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></>,
  fingerprint: <><path d="M12 10a2 2 0 0 0-2 2c0 1 0 3.5-1 6M14 13.1c0 2.4 0 6.9-2 8.9M17.3 21c.2-1 .7-3 .7-4M2 12a10 10 0 0 1 18-6M2 16h.01M21.8 16c.2-2 .1-5.4 0-6M5 19.5c.5-1.5 1-3 1-7.5a6 6 0 0 1 .3-2M8.7 6.4A6 6 0 0 1 18 12v1" /></>,
  zap: <path d="M13 2 3 14h9l-1 8 10-12h-9z" />,
  server: <><rect x="2" y="3" width="20" height="8" rx="2" /><rect x="2" y="13" width="20" height="8" rx="2" /><path d="M6 7h.01M6 17h.01" /></>,
  wifiOff: <><path d="M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M2 8.8a15 15 0 0 1 4.2-2.6M10.7 5.1A15 15 0 0 1 22 8.8M5 12.9a10 10 0 0 1 5.2-2.8M17.5 12.9c-.5-.5-1-.8-1.6-1.2M12 20h.01" /></>,
  quote: <><path d="M3 21c3 0 7-1 7-8V5c0-1.3-.8-2-2-2H4c-1.3 0-2 .7-2 2v6c0 1.3.7 2 2 2h2c0 3-1 5-3 5zM15 21c3 0 7-1 7-8V5c0-1.3-.8-2-2-2h-4c-1.3 0-2 .7-2 2v6c0 1.3.7 2 2 2h2c0 3-1 5-3 5z" /></>,
  music: <><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>,
  newspaper: <><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" /><path d="M18 14h-8M15 18h-5M10 6h8v4h-8z" /></>,
  folder: <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" />,
  folderOpen: <path d="m6 14 1.5-2.9A2 2 0 0 1 9.2 10H20a2 2 0 0 1 1.9 2.5l-1.5 6a2 2 0 0 1-2 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.7.9l.8 1.2a2 2 0 0 0 1.7.9H18a2 2 0 0 1 2 2v2" />,
  bookOpen: <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></>,
  timer: <><path d="M10 2h4M12 14l3-3" /><circle cx="12" cy="14" r="8" /></>,
  branch: <><circle cx="6" cy="6" r="3" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M6 9v6M18 9a9 9 0 0 1-9 9" /></>,
};

export default function Icon({ name, size = 18, stroke = 1.8, className = "", style, title }) {
  const body = P[name] || P.info;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`sa-icon ${className}`}
      style={style}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title && <title>{title}</title>}
      {body}
    </svg>
  );
}

/* ── Brand marks (filled, coloured) ── */
const BRAND = {
  instagram: { bg: "radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)", label: "Instagram" },
  linkedin: { bg: "#0a66c2", label: "LinkedIn" },
  x: { bg: "#111", label: "X" },
  tiktok: { bg: "#111", label: "TikTok" },
  youtube: { bg: "#ff0000", label: "YouTube" },
  facebook: { bg: "#1877f2", label: "Facebook" },
  pinterest: { bg: "#e60023", label: "Pinterest" },
  threads: { bg: "#1c1c1e", label: "Threads" },
  whatsapp: { bg: "#25d366", label: "WhatsApp" },
};

const GLYPH = {
  instagram: <><rect x="5" y="5" width="14" height="14" rx="4" fill="none" stroke="#fff" strokeWidth="1.8" /><circle cx="12" cy="12" r="3.2" fill="none" stroke="#fff" strokeWidth="1.8" /><circle cx="16.3" cy="7.7" r="1" fill="#fff" /></>,
  linkedin: <><rect x="6" y="10" width="2.6" height="8" fill="#fff" /><circle cx="7.3" cy="7.2" r="1.5" fill="#fff" /><path d="M10.8 10h2.5v1.2c.4-.7 1.3-1.4 2.7-1.4 2.6 0 3 1.7 3 3.9V18h-2.6v-3.8c0-1 0-2.2-1.4-2.2s-1.6 1-1.6 2.1V18h-2.6z" fill="#fff" /></>,
  x: <path d="M6 5.5h3.4l3.1 4.4 3.8-4.4h1.6l-4.7 5.4 5.3 7.6h-3.4l-3.4-4.8-4.2 4.8H5.9l5.1-5.8z" fill="#fff" />,
  tiktok: <path d="M14.5 5c.3 1.9 1.5 3.1 3.5 3.3v2.4a6 6 0 0 1-3.4-1.1v5.2a4.6 4.6 0 1 1-4.6-4.6h.5v2.5a2.1 2.1 0 1 0 1.6 2.1V5z" fill="#fff" />,
  youtube: <path d="M10 8.8v6.4l5.6-3.2z" fill="#fff" />,
  facebook: <path d="M13.2 19v-6h2l.3-2.4h-2.3V9.1c0-.7.2-1.2 1.2-1.2h1.2V5.8c-.2 0-1-.1-1.8-.1-1.8 0-3 1.1-3 3.1v1.8h-2V13h2v6z" fill="#fff" />,
  pinterest: <path d="M12.3 5C8.4 5 6.5 7.7 6.5 10c0 1.4.5 2.6 1.6 3.1.2.1.3 0 .4-.2l.2-.6c0-.2 0-.3-.1-.5-.3-.4-.5-.9-.5-1.6 0-2.1 1.6-3.9 4.1-3.9 2.2 0 3.5 1.4 3.5 3.2 0 2.4-1.1 4.4-2.6 4.4-.9 0-1.5-.7-1.3-1.6.2-1 .7-2.2.7-2.9 0-.7-.4-1.2-1.1-1.2-.9 0-1.6.9-1.6 2.1 0 .8.3 1.3.3 1.3l-1 4.4c-.3 1.3 0 2.9 0 3 0 .1.1.1.2 0 .1-.1 1.1-1.4 1.4-2.6l.6-2.1c.3.5 1.1 1 2 1 2.6 0 4.4-2.4 4.4-5.6C17.7 7.3 15.7 5 12.3 5z" fill="#fff" />,
  threads: <path d="M15.4 11.2c-.1 0-.2-.1-.3-.1-.2-2.1-1.3-3.3-3.3-3.3-1.2 0-2.2.5-2.8 1.4l1.1.8c.5-.7 1.2-.8 1.7-.8.6 0 1.1.2 1.4.6.2.3.4.7.4 1.1-.6-.1-1.2-.1-1.8-.1-1.9.1-3.1 1.2-3 2.7.1 1.6 1.5 2.5 3.2 2.4 1.3-.1 2.3-.6 2.9-1.6.4-.7.7-1.6.7-2.7.5.3.9.7 1.1 1.2.4.9.4 2.3-.7 3.4-1 1-2.2 1.4-4 1.4-2 0-3.6-.7-4.6-2-.9-1.2-1.4-2.9-1.4-5s.5-3.8 1.4-5c1-1.3 2.6-1.9 4.6-2 2 0 3.6.7 4.6 2 .5.6.9 1.4 1.1 2.3l1.3-.3c-.3-1.1-.7-2-1.4-2.8C16.4 3.7 14.5 2.9 12 2.9 9.6 3 7.7 3.7 6.4 5.3 5.3 6.7 4.7 8.6 4.7 11s.6 4.3 1.7 5.7c1.3 1.6 3.2 2.4 5.6 2.4 2.1 0 3.6-.6 4.9-1.8 1.7-1.6 1.6-3.7 1.1-5-.4-.8-1.1-1.5-2.6-1.1zm-3.3 3.6c-.8 0-1.6-.3-1.7-1-.1-.6.4-1.2 1.8-1.3h.6c.5 0 .9 0 1.3.1-.1 1.6-.9 2.1-2 2.2z" fill="#fff" />,
  whatsapp: <path d="M12 4.5a7.5 7.5 0 0 0-6.5 11.2L4.5 19.5l3.9-1a7.5 7.5 0 1 0 3.6-14zm4.3 10.4c-.2.5-1 1-1.5 1-.4.1-.9.1-1.5-.1-.3-.1-.8-.3-1.4-.5-2.4-1-4-3.5-4.1-3.6-.1-.2-1-1.3-1-2.5s.6-1.8.9-2c.2-.2.5-.3.6-.3h.5c.1 0 .3 0 .5.4l.7 1.6c.1.1.1.3 0 .4l-.2.4-.3.4c-.1.1-.2.2-.1.5.1.2.6 1 1.3 1.6.9.8 1.6 1 1.9 1.1.2.1.4.1.5-.1l.7-.8c.2-.2.3-.2.5-.1l1.5.7c.2.1.4.2.4.3.1.1.1.5-.1 1z" fill="#fff" />,
};

export function PlatformIcon({ platform, size = 22, radius }) {
  const key = String(platform || "").toLowerCase();
  const b = BRAND[key] || { bg: "#6b7280", label: platform };
  return (
    <span
      className="sa-platform"
      title={b.label}
      style={{ width: size, height: size, borderRadius: radius ?? Math.round(size * 0.28), background: b.bg }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.82} height={size * 0.82} aria-hidden>
        {key === "youtube" ? <><rect x="4" y="7" width="16" height="10" rx="3" fill="#fff" /><path d="M10.5 9.6v4.8l4.2-2.4z" fill="#ff0000" /></> : GLYPH[key]}
      </svg>
    </span>
  );
}

export const PLATFORM_LABEL = Object.fromEntries(Object.entries(BRAND).map(([k, v]) => [k, v.label]));

// Small inline SVG icon set for the Product Brain page (no icon library needed)
const base = (size = 18) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
});

export const LogoIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
    <path d="M20 12a8 8 0 1 1-3-6.25" />
    <circle cx="12" cy="12" r="3.2" />
    <circle cx="18.5" cy="5.5" r="1.4" fill="#fff" stroke="none" />
  </svg>
);

export const Check = ({ size = 16 }) => (<svg {...base(size)} strokeWidth="2.4"><path d="M5 12.5l4.2 4.2L19 7" /></svg>);
export const Plus = ({ size = 16 }) => (<svg {...base(size)}><path d="M12 5v14M5 12h14" /></svg>);
export const ArrowRight = ({ size = 18 }) => (<svg {...base(size)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>);
export const ArrowLeft = ({ size = 18 }) => (<svg {...base(size)}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>);
export const Refresh = ({ size = 18 }) => (<svg {...base(size)}><path d="M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4" /></svg>);
export const Eye = ({ size = 20 }) => (<svg {...base(size)}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>);
export const Brain = ({ size = 15 }) => (<svg {...base(size)}><path d="M9 4a3 3 0 0 0-3 3v.2A3 3 0 0 0 4 10a3 3 0 0 0 1 2.2A3 3 0 0 0 6 17a3 3 0 0 0 3 3V4zM15 4a3 3 0 0 1 3 3v.2A3 3 0 0 1 20 10a3 3 0 0 1-1 2.2A3 3 0 0 1 18 17a3 3 0 0 1-3 3V4z" /></svg>);
export const Box = ({ size = 20 }) => (<svg {...base(size)}><path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" /></svg>);
export const Sparkle = ({ size = 18 }) => (<svg {...base(size)}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" /></svg>);
export const Copy = ({ size = 16 }) => (<svg {...base(size)}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></svg>);
export const Pencil = ({ size = 15 }) => (<svg {...base(size)}><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" /></svg>);
export const Alert = ({ size = 18 }) => (<svg {...base(size)}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.01" /></svg>);
export const Clock = ({ size = 16 }) => (<svg {...base(size)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
export const Lock = ({ size = 13 }) => (<svg {...base(size)}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>);
export const Share = ({ size = 16 }) => (<svg {...base(size)}><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" /></svg>);
export const Fingerprint = ({ size = 20 }) => (<svg {...base(size)}><path d="M12 11v3a8 8 0 0 1-1.5 4.7M8.5 21A12 12 0 0 0 9 14v-2a3 3 0 0 1 6 0v1M15 16.5a17 17 0 0 1-.8 4M6 18a14 14 0 0 0 .5-4v-2a5.5 5.5 0 0 1 9-4.2M18 12v2c0 1-.1 2-.2 3M4.5 9A8 8 0 0 1 19 9" /></svg>);
export const Target = ({ size = 20 }) => (<svg {...base(size)}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></svg>);
export const Rocket = ({ size = 20 }) => (<svg {...base(size)}><path d="M5 15c-1.5 1.3-2 4-2 6 2 0 4.7-.5 6-2M9 18l-3-3M14.5 4.5C17 2 21 3 21 3s1 4-1.5 6.5L13 16l-5-5 6.5-6.5zM15.5 8.5h.01" /></svg>);

/* Platform marks — simple generic glyphs */
export const InstagramIcon = ({ size = 18 }) => (<svg {...base(size)}><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.3" cy="6.7" r="0.9" fill="currentColor" stroke="none" /></svg>);
export const XIcon = ({ size = 16 }) => (<svg {...base(size)} strokeWidth="2.1"><path d="M4 4l16 16M20 4L4 20" /></svg>);
export const WhatsAppIcon = ({ size = 18 }) => (<svg {...base(size)}><path d="M4 20l1.3-4A8 8 0 1 1 8 18.8L4 20z" /><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-1.8-1.8l.8-1-1-2L9 9.5z" /></svg>);
export const LinkedInIcon = ({ size = 16 }) => (<svg {...base(size)}><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="M8 10.5V16M8 7.8v.01M12 16v-5.5M12 13a2.5 2.5 0 0 1 5 0v3" /></svg>);

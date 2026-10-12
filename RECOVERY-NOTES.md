RECOVERY NOTES - recovered-source-sep12

Source: VS Code local History snapshot (1y2K.jsx), saved Sep 12, 2026
at 10:05 PM - the same minute as the final live deploy (b47135).
Verified: builds to 520,234 bytes vs live 517,247 (within 0.6%).
Version literals match live: React 19.2.8, Firebase 10.14.1.
Exact pins used: react 19.2.8, react-dom 19.2.8, firebase 10.14.1,
lucide-react 1.44.0.

KNOWN GAP: vite.config.js here has no PWA plugin block, but the live
site serves a manifest and service worker (vite-plugin-pwa 1.3.0 per
a Sep 26 package.json snapshot). Live manifest: name SafeTab,
theme #000000, background #ffffff, icons /icons/icon-192.png and
/icons/icon-512.png.

src/osm.js was never committed before this branch.
Do NOT deploy this branch to sidetabbobcatjesus without the database
switch plan gates and an explicit yes.

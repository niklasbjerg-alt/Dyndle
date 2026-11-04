// Bundles the whole game into one self-contained HTML file: dyndle.html
// Usage: node scripts/build-single.js
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

// KaTeX CSS with its fonts inlined as data URIs (woff2 only; others dropped)
let katexCss = read("vendor/katex/katex.min.css").replace(/src:([^;}]+)/g, (m, srcs) => {
  const woff2 = srcs.match(/url\((fonts\/[^)]+\.woff2)\)/);
  if (!woff2) return m;
  const b64 = fs.readFileSync(path.join(root, "vendor/katex", woff2[1])).toString("base64");
  return `src:url(data:font/woff2;base64,${b64}) format("woff2")`;
});

const safe = (js) => js.replace(/<\/script/gi, "<\\/script");
let html = read("index.html")
  .replace(/<link rel="stylesheet" href="vendor\/katex\/katex.min.css">/, () => `<style>${katexCss}</style>`)
  .replace(/<script defer src="vendor\/katex\/katex.min.js"><\/script>/, () => `<script>${safe(read("vendor/katex/katex.min.js"))}</script>`)
  .replace(/<link rel="stylesheet" href="style.css">/, () => `<style>\n${read("style.css")}</style>`)
  .replace(/<script src="js\/data.js"><\/script>/, () => `<script>\n${safe(read("js/data.js"))}</script>`)
  .replace(/<script src="js\/game.js"><\/script>/, () => `<script>\n${safe(read("js/game.js"))}</script>`);

if (/(src|href)="(?!data:|https?:|#)[^"]+\.(js|css)"/.test(html)) throw new Error("unbundled local asset left in output");
fs.writeFileSync(path.join(root, "dyndle.html"), html);
console.log(`dyndle.html written (${(html.length / 1024).toFixed(0)} KB)`);

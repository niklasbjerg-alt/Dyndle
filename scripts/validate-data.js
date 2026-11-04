// Sanity-checks js/data.js: run with `node scripts/validate-data.js`.
const { CHAPTERS, CONCEPTS } = require("../js/data.js");
const KINDS = ["Matrix", "Vector", "Scalar", "Equation", "Algorithm", "Control law", "Property", "Map", "Theorem", "Convention"];
const SIGNALS = ["q", "q̇", "q̈", "τ", "x", "F"];
const SPACES = ["Joint", "Task", "Body"];
const errors = [];
const ids = new Set(), names = new Set(), sigs = new Map();
for (const c of CONCEPTS) {
  const e = (m) => errors.push(`${c.id}: ${m}`);
  if (ids.has(c.id)) e("duplicate id"); ids.add(c.id);
  if (names.has(c.name.toLowerCase())) e("duplicate name"); names.add(c.name.toLowerCase());
  if (!CHAPTERS[c.chapter]) e(`bad chapter ${c.chapter}`);
  if (!KINDS.includes(c.kind)) e(`bad kind ${c.kind}`);
  for (const s of c.depends) if (!SIGNALS.includes(s)) e(`bad signal ${s}`);
  for (const s of c.space) if (!SPACES.includes(s)) e(`bad space ${s}`);
  for (const k of ["name", "symbol", "desc", "size"]) if (!c[k]) e(`missing ${k}`);
  if (!Array.isArray(c.aliases) || !Array.isArray(c.tags)) e("aliases/tags must be arrays");
  const sig = JSON.stringify([c.chapter, c.kind, c.size, [...c.depends].sort(), [...c.tags].sort(), [...c.space].sort()]);
  if (sigs.has(sig)) e(`indistinguishable from ${sigs.get(sig)} (identical attributes)`); sigs.set(sig, c.id);
}
const tagCounts = {};
CONCEPTS.forEach((c) => c.tags.forEach((t) => (tagCounts[t] = (tagCounts[t] || 0) + 1)));
console.log(`${CONCEPTS.length} concepts, ${Object.keys(tagCounts).length} distinct tags`);
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log("OK");

# Dyndle 🦾

A daily guessing game ("-dle") for learning **robot dynamics**, in the style of mcdle / Wordle.

Guess the hidden concept: the mass matrix, RNEA, the skew-symmetry property, computed torque control, and so on. Each guess is compared with the answer on six attributes:

| Attribute | Meaning | Feedback |
|---|---|---|
| **Chapter** | Position in a typical course (1 Rigid-body motion → 10 Identification) | 🟩 same chapter, 🟥 + ↑/↓ arrow pointing toward the answer |
| **Kind** | Matrix, Vector, Scalar, Equation, Algorithm, Control law, Property, Map, … | 🟩 / 🟥 |
| **Size** | `n×n`, `6×n`, `3×3`, … (n = joints) | 🟨 when one dimension matches |
| **Depends on** | q, q̇, q̈, τ, task pose x, external wrench F | 🟨 when some overlap |
| **Properties** | Symmetric, Positive definite, Recursive, O(n), Model-based, … | 🟨 when some overlap |
| **Space** | Joint space, Task space, single Body | 🟨 when some overlap |

The answer's symbol is revealed after 4 guesses and its description after 7. Click any guessed concept, or open 📖 **Study**, to see its definition and key equations, rendered with KaTeX.

**Modes:** *Daily* (the same puzzle for everyone each day, with stats, streaks and a shareable emoji grid) and *Practice* (unlimited random concepts).

## Running

**Easiest:** download [`dyndle.html`](dyndle.html) and double-click it. It's a single self-contained file with all code, data and math fonts inlined, so it works offline and needs no server.

Or serve the source folder (no build step):

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

To deploy on GitHub Pages: Settings → Pages → *Deploy from a branch* → `main` / root.

## Adding concepts

All content lives in [`js/data.js`](js/data.js). Each entry has `chapter`, `kind`, `size`, `depends`, `tags`, `space`, plus `symbol`/`eq` (LaTeX) and `desc`. After editing, run:

```sh
node scripts/validate-data.js
```

then rebuild the single-file version with `node scripts/build-single.js`. The validation script checks the vocabularies and makes sure no two concepts have identical attributes, since a player could never tell those apart.

KaTeX 0.16.9 (MIT) is vendored in `vendor/katex/`.

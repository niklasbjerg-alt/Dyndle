"use strict";
/* Dyndle – a Wordle-style guessing game for robot dynamics. */
(() => {
  const $ = (sel) => document.querySelector(sel);
  const BY_ID = Object.fromEntries(CONCEPTS.map((c) => [c.id, c]));
  const EPOCH = new Date(2026, 10, 1); // 1 Nov 2026 = Dyndle #1
  const HINT_SYMBOL_AT = 4;
  const HINT_DESC_AT = 7;
  const STORE_KEY = "dyndle:v1";

  // ── storage (wrapped: private windows may throw) ──────────────────────
  const store = {
    load() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; } },
    save(data) { try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch { /* ignore */ } },
  };
  let saved = store.load();
  saved.stats ||= { played: 0, won: 0, streak: 0, maxStreak: 0, dist: {}, lastWinDay: null };

  // ── seeded daily answer ───────────────────────────────────────────────
  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function dayIndex(d = new Date()) {
    const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.round((local - EPOCH) / 86400000);
  }
  function dailyAnswer(day) {
    const n = CONCEPTS.length;
    const cycle = Math.floor(day / n);
    const rand = mulberry32(0xd1d1e + cycle * 7919);
    const order = CONCEPTS.map((c) => c.id).sort(); // stable base order
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return order[((day % n) + n) % n];
  }

  // ── comparison logic ──────────────────────────────────────────────────
  const setOf = (arr) => (arr.length ? arr : ["—"]);
  function cmpSet(g, a) {
    const G = setOf(g), A = setOf(a);
    const same = G.length === A.length && G.every((x) => A.includes(x));
    if (same) return "green";
    return G.some((x) => A.includes(x)) ? "yellow" : "red";
  }
  function cmpSize(g, a) {
    if (g === a) return "green";
    const dims = (s) => (s.includes("×") ? s.split("×") : null);
    const G = dims(g), A = dims(a);
    if (G && A && G.some((d, i) => A[i] === d)) return "yellow";
    return "red";
  }
  function compare(guess, answer) {
    const ch = guess.chapter === answer.chapter ? "green" : "red";
    return {
      chapter: { color: ch, arrow: guess.chapter < answer.chapter ? "↑" : guess.chapter > answer.chapter ? "↓" : "" },
      kind: { color: guess.kind === answer.kind ? "green" : "red" },
      size: { color: cmpSize(guess.size, answer.size) },
      depends: { color: cmpSet(guess.depends, answer.depends) },
      tags: { color: cmpSet(guess.tags, answer.tags) },
      space: { color: cmpSet(guess.space, answer.space) },
    };
  }

  // ── KaTeX helper ──────────────────────────────────────────────────────
  function tex(src, display = false) {
    const span = document.createElement("span");
    if (window.katex) {
      try { katex.render(src, span, { throwOnError: false, displayMode: display }); return span; } catch { /* fall through */ }
    }
    span.textContent = src;
    span.className = "tex-fallback";
    return span;
  }
  function el(tag, attrs = {}, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") e.className = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c != null) e.append(c);
    return e;
  }

  // ── game state ────────────────────────────────────────────────────────
  let mode = "daily";
  const today = dayIndex();
  function currentGame() {
    if (mode === "daily") {
      if (!saved.daily || saved.daily.day !== today) {
        saved.daily = { day: today, answer: dailyAnswer(today), guesses: [], done: false, won: false };
      }
      saved.daily.answer = dailyAnswer(today);
      return saved.daily;
    }
    if (!saved.practice) newPractice();
    return saved.practice;
  }
  function newPractice() {
    const prev = saved.practice?.answer;
    let id;
    do { id = CONCEPTS[Math.floor(Math.random() * CONCEPTS.length)].id; } while (id === prev && CONCEPTS.length > 1);
    saved.practice = { answer: id, guesses: [], done: false, won: false };
    store.save(saved);
  }

  // ── search / autocomplete ─────────────────────────────────────────────
  const norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9†]+/g, " ").trim();
  const INDEX = CONCEPTS.map((c) => ({ c, keys: [c.name, ...c.aliases].map(norm) }));
  function search(q) {
    const nq = norm(q);
    if (!nq) return [];
    const guessed = new Set(currentGame().guesses);
    const out = [];
    for (const { c, keys } of INDEX) {
      if (guessed.has(c.id)) continue;
      let score = Infinity, hit = null;
      keys.forEach((k, i) => {
        let s = Infinity;
        if (k === nq) s = 0;
        else if (k.startsWith(nq)) s = 1;
        else if (k.split(" ").some((w) => w.startsWith(nq))) s = 2;
        else if (k.includes(nq)) s = 3;
        if (s < score) { score = s + (i ? 0.5 : 0); hit = i ? [c.name, ...c.aliases][i] : null; }
      });
      if (score < Infinity) out.push({ c, score, hit });
    }
    return out.sort((a, b) => a.score - b.score || a.c.name.localeCompare(b.c.name)).slice(0, 8);
  }

  const input = $("#guess-input");
  const sugg = $("#suggestions");
  let sel = 0, results = [];
  function showSuggestions() {
    results = search(input.value);
    sel = 0;
    sugg.innerHTML = "";
    if (!results.length) { sugg.hidden = true; return; }
    results.forEach((r, i) => {
      const li = el("li", { role: "option", class: i === sel ? "sel" : "" },
        el("span", {}, r.c.name), el("span", { class: "alias" }, r.hit ? `aka ${r.hit}` : r.c.aliases[0] || ""));
      li.addEventListener("mousedown", (e) => { e.preventDefault(); submit(r.c.id); });
      sugg.append(li);
    });
    sugg.hidden = false;
  }
  function moveSel(d) {
    if (!results.length) return;
    sel = (sel + d + results.length) % results.length;
    [...sugg.children].forEach((li, i) => li.classList.toggle("sel", i === sel));
    sugg.children[sel].scrollIntoView({ block: "nearest" });
  }
  input.addEventListener("input", showSuggestions);
  input.addEventListener("blur", () => setTimeout(() => (sugg.hidden = true), 100));
  input.addEventListener("focus", showSuggestions);
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); moveSel(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveSel(-1); }
    else if (e.key === "Enter") { e.preventDefault(); if (results[sel]) submit(results[sel].c.id); else toast("Pick a concept from the list"); }
    else if (e.key === "Escape") sugg.hidden = true;
  });
  $("#btn-guess").addEventListener("click", () => {
    if (!results.length) results = search(input.value);
    if (results[0]) submit(results[sel]?.c.id || results[0].c.id); else toast("No matching concept");
  });

  // ── submit a guess ────────────────────────────────────────────────────
  function submit(id) {
    const g = currentGame();
    if (g.done || g.guesses.includes(id)) return;
    g.guesses.push(id);
    input.value = "";
    sugg.hidden = true;
    if (id === g.answer) finish(true);
    store.save(saved);
    render(true);
  }
  function finish(won) {
    const g = currentGame();
    g.done = true; g.won = won;
    if (mode === "daily") {
      const s = saved.stats;
      s.played++;
      if (won) {
        s.won++;
        s.streak = s.lastWinDay === today - 1 ? s.streak + 1 : 1;
        s.maxStreak = Math.max(s.maxStreak, s.streak);
        s.lastWinDay = today;
        const k = g.guesses.length >= 10 ? "10+" : String(g.guesses.length);
        s.dist[k] = (s.dist[k] || 0) + 1;
      } else {
        s.streak = 0;
      }
    }
    store.save(saved);
  }

  // ── rendering ─────────────────────────────────────────────────────────
  const fmtSet = (arr) => setOf(arr).join(", ");
  function cell(color, main, sub) {
    return el("div", { class: `cell ${color}` }, main, sub ? el("small", {}, sub) : null);
  }
  function rowFor(guess, answer, animate, idx) {
    const r = compare(guess, answer);
    const name = el("div", { class: "cell name", title: "Click to study", tabindex: "0", role: "button", onclick: () => openCard(guess), onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openCard(guess); } } },
      guess.name, el("span", { class: "sym" }, tex(guess.symbol)));
    const ch = cell(r.chapter.color, el("span", {}, `Ch ${guess.chapter} `, r.chapter.arrow ? el("span", { class: "arrow" }, r.chapter.arrow) : null), CHAPTERS[guess.chapter]);
    const cells = [
      name, ch,
      cell(r.kind.color, guess.kind),
      cell(r.size.color, guess.size),
      cell(r.depends.color, fmtSet(guess.depends)),
      cell(r.tags.color, fmtSet(guess.tags)),
      cell(r.space.color, fmtSet(guess.space)),
    ];
    cells.forEach((c, i) => { c.style.animationDelay = animate && idx === 0 ? `${i * 90}ms` : "0ms"; if (!(animate && idx === 0)) c.style.animation = "none"; });
    return el("div", { class: "row" }, cells);
  }

  function render(animate = false) {
    const g = currentGame();
    const answer = BY_ID[g.answer];
    document.querySelectorAll(".mode").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    $("#daily-no").textContent = `#${today + 1}`;

    // board, newest first
    const board = $("#board");
    board.querySelectorAll(".row:not(.head)").forEach((r) => r.remove());
    [...g.guesses].reverse().forEach((id, i) => board.append(rowFor(BY_ID[id], answer, animate, i)));
    $("#empty-msg").hidden = g.guesses.length > 0;

    // input
    input.disabled = g.done; $("#btn-guess").disabled = g.done;
    input.placeholder = g.done ? "Solved! Study the concept below." : "Type a concept… e.g. mass matrix, RNEA, Jacobian";

    // hints
    const hints = $("#hints");
    hints.innerHTML = "";
    const n = g.guesses.length;
    const symOpen = g.done || n >= HINT_SYMBOL_AT;
    const descOpen = g.done || n >= HINT_DESC_AT;
    hints.append(
      el("div", { class: `hint ${symOpen ? "open" : ""}` }, el("b", {}, "Symbol"),
        symOpen ? tex(answer.symbol) : `unlocks in ${HINT_SYMBOL_AT - n} guess${HINT_SYMBOL_AT - n === 1 ? "" : "es"}`),
      el("div", { class: `hint ${descOpen ? "open" : ""}` }, el("b", {}, "Description"),
        descOpen ? answer.desc : `unlocks in ${HINT_DESC_AT - n} guess${HINT_DESC_AT - n === 1 ? "" : "es"}`),
    );
    if (!g.done && n > 0) {
      const btn = el("button", { class: "hint", id: "btn-giveup", style: "cursor:pointer" }, "🏳 Give up");
      btn.addEventListener("click", () => {
        if (btn.dataset.armed) return giveUp();
        btn.dataset.armed = "1";
        btn.classList.add("confirm");
        btn.textContent = mode === "daily" ? "Reveal answer? Resets your streak. Click again" : "Reveal answer? Click again";
        setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.classList.remove("confirm"); btn.textContent = "🏳 Give up"; } }, 4000);
      });
      hints.append(btn);
    }

    // win/lose banner
    const banner = $("#win-banner");
    banner.innerHTML = "";
    banner.hidden = !g.done;
    if (g.done) {
      banner.style.borderColor = g.won ? "var(--green)" : "var(--red)";
      banner.append(
        el("h2", {}, g.won ? `🎉 ${answer.name}` : `The answer was ${answer.name}`),
        el("div", {}, g.won ? `Solved in ${n} guess${n === 1 ? "" : "es"}.` : "Better luck next time, and study up below!"),
        el("div", { class: "actions" },
          el("button", { class: "primary", onclick: () => openCard(answer) }, "📖 Study this concept"),
          mode === "daily" ? el("button", { onclick: share }, "📋 Share") : null,
          mode === "daily" ? el("button", { onclick: () => setMode("practice") }, "Keep practicing →")
                           : el("button", { onclick: () => { newPractice(); render(); input.focus(); } }, "Next concept →"),
        ),
      );
      if (mode === "daily") banner.append(el("div", { class: "hint", style: "margin-top:10px;display:inline-block" }, `Next daily concept in ${untilMidnight()}`));
    }
  }

  function giveUp() {
    finish(false);
    render();
  }
  function untilMidnight() {
    const now = new Date();
    const mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const m = Math.round((mid - now) / 60000);
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  }

  function setMode(m) {
    mode = m;
    render();
    if (!currentGame().done) input.focus();
  }
  document.querySelectorAll(".mode").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));

  // ── share ─────────────────────────────────────────────────────────────
  function share() {
    const g = saved.daily;
    const answer = BY_ID[g.answer];
    const sq = { green: "🟩", yellow: "🟨", red: "🟥" };
    const lines = g.guesses.map((id) => {
      const r = compare(BY_ID[id], answer);
      return ["chapter", "kind", "size", "depends", "tags", "space"].map((k) => sq[r[k].color]).join("");
    });
    const text = `Dyndle #${today + 1} 🦾 ${g.won ? g.guesses.length : "X"} guess${g.guesses.length === 1 ? "" : "es"}\n${lines.join("\n")}\n${location.href.split("#")[0]}`;
    const fallback = () => {
      const box = el("textarea", { class: "share-box", readonly: "", id: "share-text" });
      box.value = text;
      openModal(el("h2", {}, "Share your result"), el("p", {}, "Copying was blocked here. Select the text below and copy it."), box);
      box.focus(); box.select();
    };
    try { navigator.clipboard.writeText(text).then(() => toast("Result copied"), fallback); } catch { fallback(); }
  }

  // ── modals ────────────────────────────────────────────────────────────
  const modal = $("#modal"), modalBody = $("#modal-body");
  function openModal(...content) {
    modalBody.innerHTML = "";
    modalBody.append(...content);
    modal.hidden = false;
  }
  function closeModal() { modal.hidden = true; }
  $("#modal-close").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closeModal(); });

  function openCard(c) {
    const chip = (label, val) => el("span", { class: "chip" }, el("b", {}, label), val);
    openModal(el("div", { class: "card" },
      el("h2", {}, c.name),
      el("div", { class: "sym-big" }, tex(c.symbol)),
      c.aliases.length ? el("div", { style: "color:var(--muted);font-size:13px" }, "Also: " + c.aliases.join(" · ")) : null,
      el("div", { class: "chips" },
        chip("Chapter", `${c.chapter} · ${CHAPTERS[c.chapter]}`), chip("Kind", c.kind), chip("Size", c.size),
        chip("Depends on", fmtSet(c.depends)), chip("Properties", fmtSet(c.tags)), chip("Space", fmtSet(c.space))),
      el("p", {}, c.desc),
      c.eq ? el("div", { class: "eq" }, tex(c.eq, true)) : null,
    ));
  }

  function openStudy() {
    const filter = el("input", { class: "study-filter", placeholder: "Filter concepts…" });
    const list = el("div", { class: "study-list" });
    const draw = () => {
      list.innerHTML = "";
      const q = norm(filter.value);
      for (const [num, title] of Object.entries(CHAPTERS)) {
        const items = CONCEPTS.filter((c) => c.chapter === +num && (!q || [c.name, ...c.aliases].some((k) => norm(k).includes(q))));
        if (!items.length) continue;
        list.append(el("h3", {}, `${num}. ${title}`));
        items.forEach((c) => list.append(el("button", { onclick: () => openCard(c) }, c.name, el("span", {}, c.kind))));
      }
    };
    filter.addEventListener("input", draw);
    draw();
    openModal(el("h2", {}, "📖 Study"),
      el("p", { style: "color:var(--muted);margin-top:-6px" }, `${CONCEPTS.length} concepts, ordered by course chapter. Click any one for its definition and equations. (Spoiler warning for today's puzzle!)`),
      filter, list);
    filter.focus();
  }

  function openHelp() {
    const lg = (cls, sym, text) => el("div", {}, el("span", { class: `sw ${cls}` }, sym), el("span", {}, text));
    openModal(
      el("h2", {}, "How to play"),
      el("p", {}, "Guess the hidden robot-dynamics concept. Each guess is compared with the answer on six attributes:"),
      el("ul", {},
        el("li", {}, el("b", {}, "Chapter"), ": where the topic sits in a typical robotics course (1 Rigid-body motion → 10 Identification). ↑ means the answer comes later, ↓ means earlier."),
        el("li", {}, el("b", {}, "Kind"), ": Matrix, Vector, Scalar, Equation, Algorithm, Control law, Property, Map, Theorem or Convention."),
        el("li", {}, el("b", {}, "Size"), ": dimensions, with n joints and p parameters. Yellow means at least one dimension matches."),
        el("li", {}, el("b", {}, "Depends on"), ": which signals it is a function of: q, q̇, q̈, τ, task pose x, or external wrench F."),
        el("li", {}, el("b", {}, "Properties"), ": e.g. Symmetric, Positive definite, Recursive, O(n), Model-based…"),
        el("li", {}, el("b", {}, "Space"), ": Joint space, Task space, or a single Body."),
      ),
      el("div", { class: "legend" },
        lg("green", "", "Exact match"),
        lg("yellow", "", "Partial match: some items shared"),
        lg("red", "", "No match"),
      ),
      el("p", {}, `After ${HINT_SYMBOL_AT} guesses the answer's symbol is revealed; after ${HINT_DESC_AT}, its description. Click any guessed concept to open its study card: learning is the point!`),
      el("p", { style: "color:var(--muted)" }, "Daily: one shared puzzle per day, with stats and streaks. Practice: unlimited random concepts."),
    );
  }

  function openStats() {
    const s = saved.stats;
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10+"];
    const max = Math.max(1, ...keys.map((k) => s.dist[k] || 0));
    const g = saved.daily;
    const hlKey = g && g.day === today && g.won ? (g.guesses.length >= 10 ? "10+" : String(g.guesses.length)) : null;
    openModal(
      el("h2", {}, "📊 Statistics"),
      el("div", { class: "stats-grid" },
        ...[[s.played, "Played"], [s.played ? Math.round((100 * s.won) / s.played) : 0, "Win %"], [s.streak, "Streak"], [s.maxStreak, "Max streak"]]
          .map(([n, l]) => el("div", {}, el("div", { class: "n" }, String(n)), el("div", { class: "l" }, l)))),
      el("h3", {}, "Guess distribution"),
      el("div", { class: "dist" }, keys.map((k) => {
        const v = s.dist[k] || 0;
        return el("div", { class: "bar" }, el("span", {}, k),
          el("div", { class: k === hlKey ? "hl" : "", style: `width:${8 + (92 * v) / max}%` }, String(v)));
      })),
    );
  }

  $("#btn-help").addEventListener("click", openHelp);
  $("#btn-study").addEventListener("click", openStudy);
  $("#btn-stats").addEventListener("click", openStats);

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 1800);
  }

  // ── boot ──────────────────────────────────────────────────────────────
  window.addEventListener("load", () => render()); // re-render once KaTeX has loaded
  render();
  if (!saved.seenHelp) { saved.seenHelp = true; store.save(saved); openHelp(); }
})();

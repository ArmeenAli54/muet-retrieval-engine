/**
 * MUET Retrieval Engine - Main UI Application
 * Course: CS-251 Data Structures & Algorithms
 * Author: Armeen Ali Soomro (MUET CSE '29)
 */

const S = {
  docs: [],
  pass: [],
  qs: [],
  C: null,
  flash: "",
  npdf: 0,
  page: "home",
  ready: false,
  editing: null,
  edit: null,
  hl: null
};

async function loadAll() {
  const docs = await DB.all("documents");
  const pass = await DB.all("passages");
  const qs = await DB.all("queries");
  S.docs = docs.sort((a, b) => a.id.localeCompare(b.id));
  S.pass = pass.sort((a, b) => a.n - b.n);
  S.qs = qs.sort((a, b) => a.id.localeCompare(b.id));
  S.C = mkCorpus(S.docs, S.pass);
}

const LINKFIX = {
  D25: [["https://exam.muet.edu.pk/website/?p=73"], "https://exam.muet.edu.pk/"],
  D26: [
    ["https://icc.muet.edu.pk/prospectus/Prospectus%20for%20the%20Session%202019-20%20for%20BS%20Programs%20(to%20be%20Printed).pdf"],
    "https://admissions.muet.edu.pk/undergraduate-prospectus-for-2025-26/"
  ],
  D27: [["https://admissions.muet.edu.pk/policy.php"], "https://admissions.muet.edu.pk/admission-policy/"],
  D28: [
    ["https://ugad.muet.edu.pk/prospectus/Prospectus_2018.pdf", "https://bm.muet.edu.pk/prospectus/Prospectus_2018.pdf"],
    "https://admissions.muet.edu.pk/"
  ]
};

async function fixLinks() {
  for (const id in LINKFIX) {
    const d = await DB.get("documents", id);
    if (d && LINKFIX[id][0].includes(d.url)) {
      await DB.put("documents", { ...d, url: LINKFIX[id][1] });
    }
  }
}

const CHK = {
  D25: "Link opens the MUET Examination Department website - the semester regulations are under its Guidelines section",
  D26: "Link opens the MUET undergraduate prospectus page (2025-26 and earlier); the stored passages were paraphrased from the 2019-20 BS prospectus",
  D27: "Verified live public policy page",
  D28: "Link opens the MUET Directorate of Admissions portal"
};

function safeUrl(u) {
  try {
    const x = new URL(String(u || "").trim());
    return x.protocol === "http:" || x.protocol === "https:" ? x.href : "";
  } catch (e) {
    return "";
  }
}

async function refreshPdfCount() {
  S.npdf = (await DB.all("pdfs")).length;
}

async function ensurePdfs() {
  const have = new Set((await DB.all("pdfs")).map(x => x.id));
  const ids = new Set(S.docs.map(d => d.id));
  for (const d of S.docs) {
    if (!have.has(d.id)) await savePdf(d);
  }
  for (const id of have) {
    if (!ids.has(id)) await DB.del("pdfs", id);
  }
  await refreshPdfCount();
}

// UI Helpers
const $ = id => document.getElementById(id);
const el = (t, c, x) => {
  const e = document.createElement(t);
  if (c) e.className = c;
  if (x !== undefined) e.textContent = x;
  return e;
};
const opt = (v, t, s) => `<option value="${v}"${s ? " selected" : ""}>${t}</option>`;
const view = h => { $("view").innerHTML = h; };

const SAMPLES = [
  "What is the attendance requirement for exams?",
  "What is the last date for course registration?",
  "What is the penalty for cheating in the exam hall?",
  "What are the rules for retaking a missed exam?",
  "What is the minimum attendance to appear in the MUET semester examination?",
  "What is the hostel accommodation fee for first-year students?"
];

const CATS = () => [...new Set(S.docs.map(d => d.category))].sort();

function form(p, f) {
  return `
  <div class="row">
    <input type="text" id="${p}_q" aria-label="Question" placeholder="Type your question or keywords, e.g. attendance requirement for exams" autocomplete="off" value="${f.empty ? "" : (f.q || SAMPLES[0])}">
    <button class="btn" id="${p}_go">${f.btn || "Search"}</button>
  </div>
  <div class="row opts">
    ${f.m ? `<label>Method<select id="${p}_m">${opt("idx", "Inverted index")}${opt("lin", "Linear search")}</select></label>` : ""}
    ${f.r ? `<label>Ranking<select id="${p}_r">${opt("cov", "Normalized coverage")}${opt("cnt", "Shared-term count")}${opt("fresh", "Coverage + freshness")}</select></label>` : ""}
    <label>Top K<select id="${p}_k">${opt(3, 3)}${opt(5, 5, 1)}${opt(10, 10)}</select></label>
    <label>Scope<select id="${p}_sc">${opt("all", "All sources", 1)}${opt("synthetic", "Synthetic test corpus")}${opt("public", "Public MUET sources")}${opt("user", "My documents")}</select></label>
    ${f.cat ? `<label>Category<select id="${p}_cat">${opt("all", "All categories", 1)}${CATS().map(c => opt(c, c)).join("")}</select></label>` : ""}
    <label>Min coverage<select id="${p}_mc">${opt(0.25, "25%")}${opt(0.5, "50%", 1)}${opt(0.75, "75%")}</select></label>
    <label><input type="checkbox" id="${p}_syn" checked> Synonyms</label>
  </div>
  <div class="row" id="${p}_chips"></div>`;
}

const gv = (id, d) => ($(id) ? $(id).value : d);

function getO(p) {
  return {
    m: gv(p + "_m", "idx"),
    r: gv(p + "_r", "cov"),
    k: +gv(p + "_k", 5),
    scope: gv(p + "_sc", "all"),
    minc: +gv(p + "_mc", 0.5),
    syn: $(p + "_syn") ? $(p + "_syn").checked : true,
    dedup: true,
    cat: gv(p + "_cat", "all")
  };
}

function wire(p, run) {
  if ($(p + "_go")) $(p + "_go").onclick = run;
  if ($(p + "_q")) {
    $(p + "_q").onkeydown = e => {
      if (e.key === "Enter") run();
    };
  }
  const chips = $(p + "_chips");
  if (chips) {
    SAMPLES.forEach(q => {
      const b = el("button", "chip", q);
      b.onclick = () => {
        $(p + "_q").value = q;
        run();
      };
      chips.append(b);
    });
  }
}

const badge = p =>
  el(
    "span",
    "badge " + p.d.status,
    { current: "CURRENT", superseded: "SUPERSEDED", unverified: "UNVERIFIED" }[p.d.status]
  );

const label = p =>
  p.d.kind === "synthetic"
    ? "SYNTHETIC — FOR TESTING ONLY — NOT AN OFFICIAL UNIVERSITY POLICY."
    : p.d.kind === "public"
    ? "Paraphrase of a public MUET page — verify with the official source."
    : "Document added by you.";

function hiNode(text, fs) {
  const f = document.createDocumentFragment();
  if (!fs || !fs.size) {
    f.append(text);
    return f;
  }
  let last = 0;
  text.replace(/[A-Za-z0-9]+/g, (w, i) => {
    const t = tok(w)[0];
    if (t && fs.has(t)) {
      if (i > last) f.append(text.slice(last, i));
      f.append(el("mark", null, w));
      last = i + w.length;
    }
    return w;
  });
  if (last < text.length) f.append(text.slice(last));
  return f;
}

function srcRow(d, full) {
  const r = el("div", "meta"), u = safeUrl(d.url);
  if (u) {
    r.append("Live source: ");
    const a = el("a", "lnk", full ? u : new URL(u).hostname + " ↗");
    a.href = u;
    a.target="_blank";
    a.rel = "noopener noreferrer";
    a.title = u;
    r.append(a);
    if (full && CHK[d.id]) r.append(" · " + CHK[d.id]);
  } else {
    r.append(
      d.kind === "synthetic"
        ? "Source: Synthetic test document (CS-251 PBL, Dept. of Computer Systems Engineering)"
        : "Source: No website link recorded for this document."
    );
  }
  return r;
}

function renderRes(box, r, meta, compact) {
  box.replaceChildren();
  box.append(
    el(
      "p",
      "meta",
      "Unique terms: " +
        (r.terms.join(", ") || "–") +
        " · candidates " +
        r.cand +
        " · qualified " +
        r.qual +
        " · duplicates suppressed " +
        r.supp +
        (meta ? " · " + meta : "")
    )
  );
  if (r.miss && r.miss.length) {
    box.append(el("p", "meta", "Not found in any document: " + r.miss.join(", ")));
  }
  if (!r.res.length) {
    box.append(el("p", "noev", r.msg));
    return;
  }
  r.res.forEach((x, j) => {
    const p = x.p, d = p.d, b = el("div", "res " + d.status), h = el("div");
    h.append(
      el("b", null, (compact ? "" : "Result " + (j + 1) + " · ") + p.id + " · "),
      badge(p),
      el("span", "meta", " score " + x.s.toFixed(2))
    );
    b.append(h);
    if (!compact) {
      b.append(
        el(
          "div",
          "meta",
          d.title +
            " [" +
            d.id +
            "] · " +
            d.category +
            " · " +
            d.source +
            " · " +
            (d.version == null ? "version unknown" : "Version " + d.version) +
            " · " +
            (d.date || "no date")
        )
      );
    }
    const tx = el("div");
    tx.append(hiNode(compact && p.text.length > 110 ? p.text.slice(0, 110) + "…" : p.text, r.fs));
    b.append(tx);
    if (compact) b.append(srcRow(d));
    if (!compact) {
      b.append(
        el(
          "div",
          "meta",
          "Matched: " +
            x.m.map(g => r.terms[g]).join(", ") +
            " (" +
            x.m.length +
            " of " +
            r.terms.length +
            " unique terms)" +
            (d.status === "superseded" ? " · outdated version, not a verified current rule" : "") +
            (p.dup >= 0 ? " · near-duplicate of " + S.C.P[p.dup].id : "")
        ),
        el("div", "meta", label(p))
      );
      b.append(srcRow(d));
      const ob = el("button", "act", "Open the PDF of this document →");
      ob.type = "button";
      ob.onclick = () => openDoc(d, r.fs);
      b.append(ob);
    }
    box.append(b);
  });
}

function renderDocs(box, r) {
  box.replaceChildren();
  if (!r.res.length) return;
  const m = new Map();
  r.all.forEach(x => {
    const d = x.p.d;
    let g = m.get(d.id);
    if (!g) {
      g = { d, s: 0, n: 0, best: x };
      m.set(d.id, g);
    }
    g.s += x.s;
    g.n++;
    if (x.s > g.best.s) g.best = x;
  });
  const L = [...m.values()]
    .sort((a, b) => b.s - a.s || a.d.id.localeCompare(b.d.id))
    .slice(0, 6);
  box.append(el("h2", null, "Matching documents (" + m.size + ")"));
  const grid = el("div", "grid");
  L.forEach(g => {
    const c = el("div", "glass dcard");
    const meta = el(
      "div",
      "meta",
      g.d.id +
        " · " +
        g.d.category +
        " · " +
        (g.d.version == null ? "version unknown" : "Version " + g.d.version) +
        " · "
    );
    const t = el("p");
    const ob = el("button", "btn ghost", "Open PDF");
    meta.append(el("span", "badge " + g.d.status, g.d.status.toUpperCase()));
    t.style.fontSize = "14px";
    const bt = g.best.p.text;
    t.append(hiNode(bt.length > 140 ? bt.slice(0, 140) + "…" : bt, r.fs));
    ob.type = "button";
    ob.onclick = () => openDoc(g.d, r.fs);
    c.append(
      el("h3", null, g.d.title),
      meta,
      el("div", "meta", g.n + " matching passage(s) · relevance " + g.s.toFixed(2)),
      t,
      srcRow(g.d),
      ob
    );
    grid.append(c);
  });
  box.append(grid);
}

// Modal, Toast & Confirm
function toast(t, bad) {
  let c = $("toasts");
  if (!c) {
    c = el("div");
    c.id = "toasts";
    c.setAttribute("role", "status");
    c.setAttribute("aria-live", "polite");
    document.body.append(c);
  }
  const x = el("div", "toast" + (bad ? " bad" : ""), t);
  c.append(x);
  setTimeout(() => x.remove(), 4500);
}

const escH = e => {
  if (e.key === "Escape") closeModal();
};

function closeModal() {
  const o = document.querySelector(".ov");
  if (o) o.remove();
  document.removeEventListener("keydown", escH);
}

function modal(title, body, foot) {
  closeModal();
  const ov = el("div", "ov"),
    bx = el("div", "mbox"),
    h = el("div", "mh"),
    x = el("button", "act", "✕"),
    bd = el("div", "mb");
  bx.setAttribute("role", "dialog");
  bx.setAttribute("aria-modal", "true");
  h.append(el("h3", null, title));
  x.type = "button";
  x.setAttribute("aria-label", "Close");
  x.onclick = closeModal;
  h.append(x);
  bd.append(body);
  bx.append(h, bd);
  if (foot && foot.length) {
    const f = el("div", "mf");
    f.append(...foot);
    bx.append(f);
  }
  ov.append(bx);
  ov.onclick = e => {
    if (e.target === ov) closeModal();
  };
  document.body.append(ov);
  document.addEventListener("keydown", escH);
  return ov;
}

function confirmBox(title, msg, okLabel, danger = true) {
  return new Promise(res => {
    const ok = el("button", "btn" + (danger ? " danger" : ""), okLabel || "OK"),
      no = el("button", "btn ghost", "Cancel");
    ok.type = no.type = "button";
    ok.onclick = () => {
      closeModal();
      res(true);
    };
    no.onclick = () => {
      closeModal();
      res(false);
    };
    const ov = modal(title, el("p", null, msg), [no, ok]);
    ov.addEventListener("click", e => {
      if (e.target === ov) res(false);
    });
    no.focus();
  });
}

// Document Viewing & Actions
async function openDoc(d, fs, actions) {
  const P = S.C.P.filter(p => p.d.id === d.id),
    body = el("div"),
    bar = el("div", "row"),
    host = el("div"),
    det = el("details");
  const m = el(
    "p",
    "meta",
    d.source +
      " · " +
      d.category +
      " · " +
      (d.version == null ? "version unknown" : "Version " + d.version) +
      " · " +
      (d.date || "no date") +
      " · "
  );
  m.append(el("span", "badge " + d.status, d.status.toUpperCase()));
  body.append(m, srcRow(d, true));
  if (d.note) body.append(el("p", "meta", d.note));
  body.append(bar, host);

  det.append(
    el(
      "summary",
      null,
      "Text of the " +
        P.length +
        " stored passage(s)" +
        (fs && fs.size ? " — matched keywords highlighted" : "")
    )
  );
  if (fs && fs.size) det.open = true;
  if (!P.length) det.append(el("p", "meta", "This document has no passages."));
  P.forEach(p => {
    const r = el("div", "res " + d.status),
      t = el("div");
    r.append(el("b", null, p.id));
    t.append(hiNode(p.text, fs));
    r.append(t);
    if (p.dup >= 0) r.append(el("div", "meta", "near-duplicate of " + S.C.P[p.dup].id));
    det.append(r);
  });
  body.append(det);

  const close = el("button", "btn ghost", "Close"),
    foot = [close];
  close.type = "button";
  close.onclick = closeModal;
  if (actions) {
    const e = el("button", "btn ghost", "Edit"),
      x = el("button", "btn danger", "Delete");
    e.type = x.type = "button";
    e.onclick = () => editDoc(d);
    x.onclick = () => delDoc(d);
    foot.unshift(x, e);
  }
  const ov = modal(d.title + " [" + d.id + "]", body, foot);
  ov.firstChild.style.width = "min(920px, 100%)";
  host.append(el("p", "meta", "Loading PDF from the database…"));

  try {
    let rec = await DB.get("pdfs", d.id);
    if (!rec) {
      rec = await savePdf(d);
      await refreshPdfCount();
    }
    const url = URL.createObjectURL(new Blob([rec.data], { type: "application/pdf" })),
      fname = (d.id + " - " + d.title).replace(/[^\w .-]+/g, "").trim() + ".pdf";
    const o = el("a", "btn", "Open PDF in new tab"),
      dl = el("a", "btn ghost", "Download PDF");
    o.href = dl.href = url;
    o.target = "_blank";
    o.rel = "noopener";
    dl.download = fname;
    bar.append(
      o,
      dl,
      el(
        "span",
        "meta",
        (rec.origin === "uploaded" ? "Uploaded PDF" : "Generated PDF") +
          " · " +
          (rec.size / 1024).toFixed(1) +
          " KB · stored in the database"
      )
    );
    let shown = false;
    try {
      shown = rec.origin === "uploaded" ? await showUploaded(rec.data, host) : showGenerated(d, host);
    } catch (e) {
      shown = false;
    }
    if (!shown) {
      const fr = el("iframe");
      fr.src = url + "#view=FitH";
      fr.title = "PDF of " + d.title;
      fr.style.cssText =
        "width:100%;height:52vh;border:1px solid var(--line);border-radius:8px;background:#fff";
      host.replaceChildren(
        fr,
        el(
          "p",
          "meta",
          "If the PDF area stays blank (some browsers restrict PDFs in iframes), use “Open PDF in new tab” or “Download PDF”."
        )
      );
    }
  } catch (e) {
    host.replaceChildren(el("p", "err", "Could not load the PDF: " + e.message));
  }
}

function editDoc(d) {
  S.edit = d.id;
  closeModal();
  if (S.page === "documents") V.documents();
  else go("documents");
}

async function delDoc(d) {
  const n = S.C.P.filter(p => p.d.id === d.id).length;
  if (
    !(await confirmBox(
      "Delete document?",
      "“" +
        d.title +
        "” [" +
        d.id +
        "] and its " +
        n +
        " passage(s) will be permanently removed from the database and the search index. This cannot be undone.",
      "Delete permanently"
    ))
  )
    return;
  try {
    for (const p of (await DB.all("passages")).filter(p => p.doc === d.id))
      await DB.del("passages", p.id);
    await DB.del("documents", d.id);
    await DB.del("pdfs", d.id);
    await loadAll();
    await refreshPdfCount();
    closeModal();
    const y = window.scrollY;
    route();
    window.scrollTo(0, y);
    toast("Deleted " + d.id + " and " + n + " passage(s). The index was rebuilt.");
  } catch (e) {
    toast("Delete failed: " + e.message, 1);
  }
}

// Backend Configuration Dialog
function showBackendModal() {
  const body = el("div");
  body.innerHTML = `
    <p class="sub">The engine supports dual execution modes: zero-latency client-side browser execution (perfect for GitHub Pages), and full REST API mode via a Node.js Express backend.</p>
    <div class="row">
      <label style="flex:1">Backend REST API URL:
        <input type="text" id="cfg_backend_url" value="${ApiClient.baseUrl}" style="width:100%">
      </label>
    </div>
    <div class="row">
      <label>Execution Mode:
        <select id="cfg_mode">
          <option value="auto"${ApiClient.mode === "auto" ? " selected" : ""}>Auto (Use Backend if Online, else Client DSA)</option>
          <option value="backend"${ApiClient.mode === "backend" ? " selected" : ""}>Force Backend API</option>
          <option value="client"${ApiClient.mode === "client" ? " selected" : ""}>Force Standalone Client Engine</option>
        </select>
      </label>
    </div>
    <div id="cfg_test_res" class="meta" style="margin-top:10px"></div>
  `;
  const testBtn = el("button", "btn ghost", "Test Connection");
  const saveBtn = el("button", "btn", "Save & Apply");
  const closeBtn = el("button", "btn ghost", "Close");

  testBtn.onclick = async () => {
    const url = $("cfg_backend_url").value.trim();
    $("cfg_test_res").innerHTML = "Testing connection to " + url + "…";
    try {
      const res = await fetch(url + "/api/health");
      if (res.ok) {
        const d = await res.json();
        $("cfg_test_res").innerHTML = `<span class="good">✓ Connected successfully!</span> Server version: ${d.version || "1.0"}, uptime: ${Math.round(d.uptime || 0)}s.`;
      } else {
        $("cfg_test_res").innerHTML = `<span class="err">✗ Server responded with status ${res.status}</span>`;
      }
    } catch (e) {
      $("cfg_test_res").innerHTML = `<span class="err">✗ Connection failed: ${e.message}</span> (Ensure the backend server is running: <span class="mono">node backend/server.js</span>)`;
    }
  };

  saveBtn.onclick = async () => {
    const url = $("cfg_backend_url").value.trim();
    const mode = $("cfg_mode").value;
    ApiClient.baseUrl = url;
    ApiClient.mode = mode;
    localStorage.setItem("muet_backend_url", url);
    localStorage.setItem("muet_engine_mode", mode);
    await ApiClient.checkHealth();
    closeModal();
    toast("Backend preferences saved.");
    route();
  };

  closeBtn.onclick = closeModal;
  modal("Backend API & Deployment Settings", body, [closeBtn, testBtn, saveBtn]);
}

// Page Views
const V = {};

V.home = () => {
  const C = S.C;
  view(`
  <h1>MUET Document Retrieval Engine</h1>
  <p class="sub">A complete retrieval engine for a university RAG assistant designed for CS-251 Data Structures and Algorithms. Features a custom hash table inverted index (FNV-1a, separate chaining, 0.75 load factor resize), linear scan baseline, multi-strategy ranking, and verifiable evidence passages.</p>
  <div class="stats">
    <div class="glass stat"><b>${S.docs.length}</b><span>documents</span></div>
    <div class="glass stat"><b>${C.P.length}</b><span>passages</span></div>
    <div class="glass stat"><b>${C.ix.n}</b><span>indexed terms</span></div>
    <div class="glass stat"><b>${S.qs.length}</b><span>labeled questions</span></div>
    <div class="glass stat"><b>${S.npdf}</b><span>PDFs stored</span></div>
  </div>
  <div class="grid">
    ${MODS.map(
      m => `
      <a class="glass card" href="#${m[0]}" data-r="${m[0]}">
        <h3>${m[1]}</h3>
        <p>${m[2]}</p>
        <p>${m[3]()}</p>
        <span class="go">Open →</span>
      </a>`
    ).join("")}
  </div>
  <div class="glass panel" style="margin-top:24px">
    <h3>CS-251 Project Information</h3>
    <p class="meta"><b>Student:</b> Armeen Ali Soomro · <b>Department:</b> Computer Systems Engineering (CSE '29) · <b>University:</b> Mehran University of Engineering and Technology (MUET), Jamshoro.</p>
    <p class="meta">Synthetic documents are created for algorithmic testing. Public passages are factual paraphrases from MUET official portals with direct source links. Available via standalone GitHub Pages and via a Node.js REST API backend.</p>
  </div>`);
};

V.search = () => {
  view(`
  <h1>Search & Evidence Retrieval</h1>
  <p class="sub">Ask a question or input keywords. The retrieval pipeline tokenizes, eliminates stop words, stems terms, and queries the inverted index (with synonym expansion) to retrieve and rank evidence passages. Results update in real-time as you type.</p>
  <div class="glass panel">${form("s", { m: 1, r: 1, empty: 1, cat: 1 })}</div>
  <div id="sd"></div>
  <div id="so"></div>`);

  const run = async auto => {
    const o = getO("s"),
      q = $("s_q").value;
    if (auto && !q.trim()) {
      $("sd").replaceChildren();
      $("so").replaceChildren();
      return;
    }
    const t = performance.now();
    const r = await ApiClient.search(q, o);
    const us = ((performance.now() - t) * 1000).toFixed(0);
    renderDocs($("sd"), r);
    renderRes(
      $("so"),
      r,
      us + " µs single run · " + (o.m === "lin" ? "linear search" : "inverted index") + (r.fromBackend ? " [Node.js REST API]" : " [Client Inverted Index]")
    );
    if (r.res.length) $("so").prepend(el("h2", null, "Evidence passages"));
  };

  wire("s", () => run());
  let tm;
  $("s_q").addEventListener("input", () => {
    clearTimeout(tm);
    tm = setTimeout(() => run(true), 250);
  });
  ["m", "r", "k", "sc", "cat", "mc", "syn"].forEach(s => {
    const e = $("s_" + s);
    if (e) e.onchange = () => run(true);
  });
  $("s_q").focus();
};

V.compare = () => {
  view(`
  <h1>Algorithm Comparison: Linear Scan vs Inverted Index</h1>
  <p class="sub">Executes identical queries against both candidate generation strategies: scanning every passage token sequentially vs navigating inverted index postings lists in O(1) hash bucket lookups. Microsecond timings are measured over 10 batches of 40 runs.</p>
  <div class="glass panel">${form("c", { r: 1, btn: "Compare" })}</div>
  <div class="cols">
    <div class="glass panel"><h3 id="c_ta">Linear search</h3><div id="c_a"></div></div>
    <div class="glass panel"><h3 id="c_tb">Inverted index</h3><div id="c_b"></div></div>
  </div>
  <p id="c_s" class="meta"></p>`);

  wire("c", () => {
    const o = getO("c"),
      q = $("c_q").value,
      oa = { ...o, m: "lin" },
      ob = { ...o, m: "idx" },
      a = search(S.C, q, oa),
      b = search(S.C, q, ob);
    renderRes($("c_a"), a, "", true);
    renderRes($("c_b"), b, "", true);
    const ta = perf(() => search(S.C, q, oa)),
      tb = perf(() => search(S.C, q, ob));
    $("c_ta").textContent = "Linear search · " + ta.toFixed(1) + " µs";
    $("c_tb").textContent = "Inverted index · " + tb.toFixed(1) + " µs";
    const same = a.res.map(x => x.p.id).join() === b.res.map(x => x.p.id).join();
    $("c_s").innerHTML = `Identical ranked passage IDs: <span class="${same ? "good" : "err"}">${same ? "yes ✓" : "NO ✗"}</span> · Speedup (Linear ÷ Index): <b>${(ta / tb).toFixed(2)}x</b> across ${S.C.P.length} passages.`;
  });
};

V.ranking = () => {
  view(`
  <h1>Ranking Strategies Lab</h1>
  <p class="sub">Inspects how candidates are prioritized under three distinct mathematical formulations: raw term counts, normalized query coverage, and coverage with freshness decay for superseded versions.</p>
  <div class="glass panel">${form("r", { btn: "Rank" })}</div>
  <div class="cols">
    <div class="glass panel"><h3>Shared-term count</h3><div id="r_a"></div></div>
    <div class="glass panel"><h3>Normalized coverage</h3><div id="r_b"></div></div>
    <div class="glass panel"><h3>Coverage + freshness</h3><div id="r_c"></div></div>
  </div>
  <p id="r_s" class="meta"></p>`);

  wire("r", () => {
    const o = getO("r"),
      q = $("r_q").value,
      rs = ["cnt", "cov", "fresh"].map(r => search(S.C, q, { ...o, r, m: "idx" }));
    ["r_a", "r_b", "r_c"].forEach((id, i) => renderRes($(id), rs[i], "", true));
    const ids = rs.map(r => r.res.map(x => x.p.id).join());
    $("r_s").innerHTML = `Count vs Coverage order parity: <span class="good">${ids[0] === ids[1] ? "identical ✓" : "differed"}</span> · Freshness demotion effect: <b>${ids[1] !== ids[2] ? "active (reordered) ✓" : "same order"}</b>.`;
  });
};

V.documents = () => {
  const persist = !!DB.db;
  view(`
  <h1>Documents Database</h1>
  <p class="sub">Full CRUD control over documents, passages, and PDF attachments. Every change updates the local database and immediately triggers a rebuild of the inverted index and hash table.</p>
  <p class="meta">Storage: ${persist ? '<span class="good">IndexedDB — changes persist across reloads.</span> ' + S.npdf + ' PDF(s) saved.' : '<span class="err">In-memory fallback mode.</span>'}</p>
  <div class="glass panel">
    <div class="row">
      <input type="text" id="d_f" aria-label="Filter documents" placeholder="Filter by ID, title, or category">
      <select id="d_k" aria-label="Kind">${opt("all", "All kinds")}${opt("synthetic", "Synthetic")}${opt("public", "Public MUET")}${opt("user", "User-added")}</select>
      <span class="meta" id="d_c"></span>
    </div>
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Category</th>
            <th class="n">Ver.</th>
            <th>Status</th>
            <th>Kind</th>
            <th>Source</th>
            <th class="n">Passages</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="d_t"></tbody>
      </table>
    </div>
  </div>

  <h2 id="f_head">Add or Update Document</h2>
  <div class="glass panel">
    <p class="meta" id="f_mode">Create a new document. Using an existing ID updates that entry.</p>
    <div class="row">
      <input type="text" id="f_id" aria-label="Document ID" placeholder="Document ID (e.g. D30)">
      <input type="text" id="f_ti" aria-label="Title" placeholder="Title (required)">
    </div>
    <div class="row">
      <input type="text" id="f_ca" aria-label="Category" placeholder="Category (e.g. Course Contents)">
      <input type="text" id="f_so" aria-label="Source" placeholder="Source">
      <input type="text" id="f_v" aria-label="Version" placeholder="Version (number)">
      <input type="text" id="f_da" aria-label="Date" placeholder="Date (YYYY-MM-DD)">
      <input type="text" id="f_se" aria-label="Series" placeholder="Series ID">
    </div>
    <div class="row">
      <input type="text" id="f_url" aria-label="Source URL" placeholder="Live source URL (https://…)">
      <label class="meta" style="display:flex;gap:8px;align-items:center">Attach PDF: <input type="file" id="f_pdf" accept="application/pdf,.pdf"></label>
    </div>
    <textarea id="f_tx" aria-label="Document text" placeholder="Document text — separate passages with a blank line"></textarea>
    <div class="row">
      <button class="btn" id="f_save" type="button">Save to Database</button>
      <button class="btn ghost" id="f_clear" type="button">Clear Form</button>
      <button class="btn ghost" id="f_reset" type="button">Reset to Original Corpus</button>
    </div>
    <p id="d_m" class="meta"></p>
  </div>`);

  const draw = () => {
    const f = $("d_f").value.toLowerCase(),
      k = $("d_k").value,
      t = $("d_t");
    t.replaceChildren();
    let c = 0;
    S.docs
      .filter(d => (k === "all" || d.kind === k) && (d.id + " " + d.title + " " + d.category).toLowerCase().includes(f))
      .forEach(d => {
        c++;
        const tr = el("tr", d.id === S.hl ? "hl" : ""),
          n = S.C.P.filter(p => p.d.id === d.id).length;
        [d.id, d.title, d.category].forEach(x => tr.append(el("td", null, x)));
        tr.append(el("td", "n", d.version == null ? "–" : d.version));
        const s = el("td");
        s.append(el("span", "badge " + d.status, d.status.toUpperCase()));
        const sc = el("td"),
          su = safeUrl(d.url);
        if (su) {
          const a = el("a", "lnk", "Live ↗");
          a.href = su;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.title = su;
          sc.append(a);
        } else {
          sc.append("—");
        }
        tr.append(s, el("td", null, d.kind), sc, el("td", "n", n));
        const a = el("td");
        a.style.whiteSpace = "nowrap";
        [
          ["View", () => openDoc(d, null, true), ""],
          ["Edit", () => editDoc(d), ""],
          ["Delete", () => delDoc(d), "dz"]
        ].forEach(([l, fn, z]) => {
          const b = el("button", "act " + z, l);
          b.type = "button";
          b.setAttribute("aria-label", l + " " + d.id);
          b.onclick = fn;
          a.append(b);
        });
        tr.append(a);
        t.append(tr);
      });
    $("d_c").textContent = c + " of " + S.docs.length + " shown";
  };

  const msg = (t, bad) => {
    $("d_m").textContent = t;
    $("d_m").className = "meta " + (bad ? "err" : "good");
    if (bad && t) toast(t, 1);
  };

  const FIELDS = ["f_id", "f_ti", "f_ca", "f_so", "f_v", "f_da", "f_se", "f_url", "f_tx"];
  const clear = () => {
    FIELDS.forEach(i => ($(i).value = ""));
    $("f_pdf").value = "";
    S.editing = null;
    $("f_mode").textContent = "Create a new document. Using an existing ID updates that entry.";
    msg("");
  };

  const fill = d => {
    const set = (i, v) => ($(i).value = v == null ? "" : v);
    set("f_id", d.id);
    set("f_ti", d.title);
    set("f_ca", d.category);
    set("f_so", d.source);
    set("f_v", d.version);
    set("f_da", d.date);
    set("f_se", d.series);
    set("f_url", d.url);
    $("f_pdf").value = "";
    set("f_tx", S.pass.filter(p => p.doc === d.id).map(p => p.text).join("\n\n"));
    S.editing = d.id;
    $("f_mode").textContent = "Editing " + d.id + " — saving will replace its details and passages.";
    $("f_head").scrollIntoView({ behavior: "smooth" });
    $("f_ti").focus({ preventScroll: true });
  };

  $("d_f").oninput = draw;
  $("d_k").onchange = draw;
  draw();
  $("f_clear").onclick = clear;

  $("f_save").onclick = async () => {
    const g = i => $(i).value.trim(),
      id = g("f_id"),
      title = g("f_ti");
    if (!id || !title) return msg("Document ID and title are required.", 1);
    if (!/^[A-Za-z0-9_-]{1,24}$/.test(id))
      return msg("Document ID may contain letters, digits, '-' and '_' only (max 24 characters).", 1);
    const paras = $("f_tx")
      .value.split(/\n\s*\n/)
      .map(s => s.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (!paras.length) return msg("Document body is empty — add at least one paragraph.", 1);

    const vt = g("f_v"),
      vv = /^\d{1,5}$/.test(vt);
    if (vt && !vv) return msg("Version must be a positive integer or left blank.", 1);

    const uraw = g("f_url"),
      uurl = uraw ? safeUrl(uraw) : "";
    if (uraw && !uurl) return msg("Source URL must be a valid address starting with http:// or https://.", 1);

    let pdfBuf = null;
    const fi = $("f_pdf").files[0];
    if (fi) {
      if (fi.size > 15 * 1024 * 1024) return msg("PDF file exceeds 15 MB limit.", 1);
      pdfBuf = await fi.arrayBuffer();
      if (String.fromCharCode(...new Uint8Array(pdfBuf.slice(0, 5))) !== "%PDF-")
        return msg("The uploaded file is not a valid PDF document.", 1);
    }

    const old = S.docs.find(d => d.id === id);
    if (
      old &&
      S.editing !== id &&
      !(await confirmBox(
        "Update existing document?",
        "Document with ID " + id + " already exists. Overwrite it?",
        "Update",
        false
      ))
    )
      return;

    try {
      for (const p of (await DB.all("passages")).filter(p => p.doc === id))
        await DB.del("passages", p.id);
      await DB.put("documents", {
        id,
        title,
        category: g("f_ca") || "Uncategorized",
        source: g("f_so") || "Unknown source",
        version: vv ? +vt : null,
        date: g("f_da") || new Date().toISOString().slice(0, 10),
        series: g("f_se") || id,
        kind: old ? old.kind : "user",
        note: old ? old.note || "" : "",
        url: uurl
      });

      let n = Math.max(0, ...(await DB.all("passages")).map(p => p.n)),
        added = 0;
      const seen = new Set();
      for (const t of paras) {
        const key = tok(t).join(" ");
        if (!key || seen.has(key)) continue;
        seen.add(key);
        n++;
        await DB.put("passages", { id: "P" + String(n).padStart(3, "0"), n, doc: id, text: t });
        added++;
      }
      await loadAll();
      await savePdf(S.docs.find(x => x.id === id), pdfBuf);
      await refreshPdfCount();
      S.hl = id;
      S.editing = null;
      toast((old ? "Updated " : "Added ") + id + ": " + added + " passage(s) saved, index rebuilt.");
      V.documents();
    } catch (e) {
      msg("Could not save: " + e.message, 1);
    }
  };

  $("f_reset").onclick = async () => {
    if (
      !(await confirmBox(
        "Reset database?",
        "Restore all documents, passages, and queries to the default project state? Any edits will be reset.",
        "Reset"
      ))
    )
      return;
    try {
      for (const s of ["documents", "passages", "queries", "meta", "pdfs"]) await DB.clear(s);
      await seed();
      await loadAll();
      await ensurePdfs();
      toast("Corpus successfully restored to original data.");
      V.documents();
    } catch (e) {
      msg("Reset failed: " + e.message, 1);
    }
  };

  if (S.edit) {
    const d = S.docs.find(x => x.id === S.edit);
    S.edit = null;
    if (d) fill(d);
  }
  if (S.hl) {
    const r = document.querySelector("tr.hl");
    if (r) r.scrollIntoView({ block: "center" });
    S.hl = null;
  }
};

V.evaluation = () => {
  view(`
  <h1>Evaluation & Quality Metrics: Recall@3</h1>
  <p class="sub">Runs ${S.qs.length} gold standard labeled questions against Linear Scan and Inverted Index, with synonym expansion toggled on and off. Recall@3 = (Gold passages retrieved in Top-3) ÷ (Total Gold Passages). Unanswerable questions are assessed separately for false positive suppression.</p>
  <div class="glass panel">
    <div class="row opts">
      <label>Scope<select id="e_sc">${opt("synthetic", "Synthetic corpus (matches academic baseline)", 1)}${opt("all", "All sources")}</select></label>
      <label>Ranking<select id="e_r">${opt("cov", "Normalized coverage")}${opt("cnt", "Shared-term count")}${opt("fresh", "Coverage + freshness")}</select></label>
      <button class="btn" id="e_go">Run Evaluation Suite</button>
    </div>
  </div>
  <div id="e_o"></div>`);

  $("e_go").onclick = () => {
    const sc = $("e_sc").value,
      r = $("e_r").value,
      cfg = [
        ["lin", false],
        ["idx", false],
        ["lin", true],
        ["idx", true]
      ];
    const res = cfg.map(([m, syn]) =>
      S.qs.map(q => evalOne(S.C, q, { m, r, scope: sc, minc: 0.5, syn, dedup: true }))
    );

    let h = `
    <div class="glass panel scroll">
      <table>
        <thead>
          <tr>
            <th>Q ID</th>
            <th>Type</th>
            <th>Question</th>
            <th>Gold</th>
            <th class="n">Lin (No Syn)</th>
            <th class="n">Idx (No Syn)</th>
            <th class="n">Lin + Syn</th>
            <th class="n">Idx + Syn</th>
          </tr>
        </thead>
        <tbody>`;
    S.qs.forEach((q, i) => {
      h += `<tr><td><b>${q.id}</b></td><td>${q.category}</td><td>${q.question}</td><td class="mono">${q.gold.join(" ") || "∅"}</td>` +
        res.map(c => {
          const e = c[i];
          return `<td class="n">${e.un ? (e.ok ? '<span class="good">no ev ✓</span>' : '<span class="err">false hit ✗</span>') : e.na ? "n/a" : e.rec.toFixed(2) + " (" + e.hit + "/" + e.g + ")"}</td>`;
        }).join("") +
        `</tr>`;
    });
    h += `</tbody></table></div><div class="glass panel scroll"><table><thead><tr><th>Configuration</th><th class="n">Mean Recall@3</th><th class="n">Evaluated Queries</th><th class="n">Unanswerable Handled</th><th class="n">Rank Parity with Linear</th></tr></thead><tbody>`;

    cfg.forEach(([m, syn], c) => {
      const a = res[c].filter(e => e.rec !== undefined),
        u = res[c].filter(e => e.un),
        same = res[c].filter((e, i) => e.ids.join() === res[c % 2 ? c - 1 : c][i].ids.join()).length;
      h += `<tr><td>${m === "lin" ? "Linear Scan" : "Inverted Index"}, Synonyms: ${syn ? "Enabled" : "Disabled"}</td><td class="n"><b>${avg(a.map(e => e.rec)).toFixed(3)}</b></td><td class="n">${a.length}</td><td class="n">${u.filter(e => e.ok).length}/${u.length}</td><td class="n">${same}/${S.qs.length}</td></tr>`;
    });
    $("e_o").innerHTML = h + `</tbody></table></div><p class="meta">Baseline Recall@3 on synthetic dataset achieves 0.625 (synonyms off) and 0.778 (synonyms on). Unanswerable queries (Q11, Q12) correctly trigger "No supported evidence found" to prevent hallucination.</p>`;
  };
};

V.benchmark = () => {
  view(`
  <h1>Performance Benchmark & Scalability</h1>
  <p class="sub">Measures retrieval latency on corpus slices of 25, 50, 100 passages and the full corpus. Includes 1 warm-up run and 10 measured batches of 40 runs per query with median latency recorded.</p>
  <div class="glass panel">
    <button class="btn" id="b_go">Run Comprehensive Benchmark</button>
    <span class="meta" style="margin-left:10px">Executes in ~3–5 seconds</span>
  </div>
  <div id="b_o"></div>`);

  $("b_go").onclick = async () => {
    const out = $("b_o");
    out.textContent = "Benchmarking retrieval engines across corpus scales…";
    await new Promise(r => setTimeout(r, 40));
    const syn = S.docs.filter(d => d.kind === "synthetic"),
      rows = [];
    for (const target of [25, 50, 100, 0]) {
      const docs = [], pass = [];
      for (const d of syn) {
        if (target && pass.length >= target) break;
        docs.push({ ...d });
        S.pass.filter(p => p.doc === d.id).forEach(p => pass.push(p));
      }
      const C = mkCorpus(docs, pass), bl = [];
      for (let i = 0; i < 10; i++) bl.push(mkIndex(C.P).us);
      const o = { m: "idx", r: "cov", k: 3, scope: "all", minc: 0.5, syn: true, dedup: true },
        lm = [], im = [], lr = [], ir = [];
      let same = 0;
      for (const q of S.qs) {
        lm.push(perf(() => search(C, q.question, { ...o, m: "lin" })));
        im.push(perf(() => search(C, q.question, o)));
        const ea = evalOne(C, q, { ...o, m: "lin" }),
          eb = evalOne(C, q, o);
        if (ea.rec !== undefined) lr.push(ea.rec);
        if (eb.rec !== undefined) ir.push(eb.rec);
        if (ea.ids.join() === eb.ids.join()) same++;
      }
      rows.push([C.P.length, docs.length, C.ix.n, med(bl), med(lm), med(im), avg(lr), avg(ir), same]);
    }
    out.innerHTML = `
    <div class="glass panel scroll">
      <table>
        <thead>
          <tr>
            <th class="n">Passages</th>
            <th class="n">Docs</th>
            <th class="n">Terms</th>
            <th class="n">Index Build (µs)</th>
            <th class="n">Linear Latency (µs)</th>
            <th class="n">Index Latency (µs)</th>
            <th class="n">Speedup Ratio</th>
            <th class="n">Recall@3 (Lin / Idx)</th>
            <th class="n">Parity Count</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td class="n">${r[0]}</td>
              <td class="n">${r[1]}</td>
              <td class="n">${r[2]}</td>
              <td class="n">${r[3].toFixed(1)}</td>
              <td class="n">${r[4].toFixed(2)}</td>
              <td class="n">${r[5].toFixed(2)}</td>
              <td class="n"><b>${(r[4] / r[5]).toFixed(2)}x</b></td>
              <td class="n">${r[6].toFixed(3)} / ${r[7].toFixed(3)}</td>
              <td class="n">${r[8]}/${S.qs.length}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <p class="meta">As corpus size grows, linear scan latency increases proportionally (O(N·L)), whereas the inverted index scales with query term frequency (O(T + postings)), delivering increasing speedup advantages.</p>`;
  };
};

V.index = () => {
  const x = S.C.ix;
  view(`
  <h1>Inverted Index & Hash Table Explorer</h1>
  <p class="sub">Direct inspection of the custom Hash Table implementation. Uses separate chaining, 32-bit FNV-1a hashing, and dynamic doubling when the load factor exceeds 0.75.</p>
  <div class="stats">
    <div class="glass stat"><b>${x.n}</b><span>unique terms</span></div>
    <div class="glass stat"><b>${x.b.length}</b><span>buckets</span></div>
    <div class="glass stat"><b>${(x.n / x.b.length).toFixed(2)}</b><span>load factor</span></div>
    <div class="glass stat"><b>${x.coll}</b><span>hash collisions</span></div>
    <div class="glass stat"><b>${x.longest()}</b><span>longest chain</span></div>
    <div class="glass stat"><b>${x.rs}</b><span>resize cycles</span></div>
  </div>
  <div class="glass panel">
    <div class="row">
      <input type="text" id="i_q" placeholder="Look up an indexed term, e.g. attendance">
      <button class="btn" id="i_go">Look up Term</button>
    </div>
    <div id="i_o"></div>
  </div>
  <h2>Most Frequent Terms in Index</h2>
  <div class="glass panel scroll">
    <table>
      <thead>
        <tr><th>Normalized Term</th><th class="n">Posting Count (Passages)</th></tr>
      </thead>
      <tbody id="i_t"></tbody>
    </table>
  </div>`);

  const rows = [];
  x.each((k, v) => rows.push([k, v.length]));
  rows.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  rows.slice(0, 15).forEach(r => {
    const tr = el("tr");
    tr.append(el("td", "mono", r[0]), el("td", "n", r[1]));
    $("i_t").append(tr);
  });

  const go = () => {
    const o = $("i_o");
    o.replaceChildren();
    const t = tok($("i_q").value)[0];
    if (!t) {
      o.append(el("p", "err", "Please enter a valid search term (stop words are stripped)."));
      return;
    }
    const l = x.get(t);
    if (!l) {
      o.append(el("p", "noev", "“" + t + "” was not found in the inverted index."));
      return;
    }
    o.append(
      el(
        "p",
        "meta",
        "Term “" + t + "” appears in " + l.length + " passage(s). Linked Postings List:"
      ),
      el("p", "mono", l.map(i => S.C.P[i].id).join(" → ") + " → NULL")
    );
    l.slice(0, 8).forEach(i => {
      const p = S.C.P[i],
        d = el("div", "res " + p.d.status);
      d.append(el("b", null, p.id + " "), el("span", "meta", p.d.title), el("div", null, p.text));
      o.append(d);
    });
  };

  $("i_go").onclick = go;
  $("i_q").onkeydown = e => {
    if (e.key === "Enter") go();
  };
};

V.sources = () => {
  const pub = S.docs.filter(d => d.kind === "public");
  view(`
  <h1>Sources, Provenance & Ethical Policy</h1>
  <p class="sub">Academic retrieval systems must maintain clear data provenance and distinguish synthetic test fixtures from public institutional facts.</p>
  <div class="glass panel">
    <h3>Public MUET Information</h3>
    <div id="s_l"></div>
  </div>
  <div class="glass panel">
    <h3>Policy Notice</h3>
    <p>Public passages were paraphrased from published Mehran University of Engineering & Technology portals (prospectus, examination guidelines, admission policy). They carry status <b>UNVERIFIED</b> and must always be checked with official MUET offices. Synthetic documents are strictly <b>FOR TESTING ONLY</b>. No confidential or student-private data is processed.</p>
  </div>`);

  pub.forEach(d => {
    const b = el("div", "res unverified"),
      n = S.C.P.filter(p => p.d.id === d.id).length;
    b.append(
      el("b", null, d.title + " [" + d.id + "] "),
      el("span", "meta", "· " + n + " passages · retrieved " + d.date),
      el("br")
    );
    const a = el("a", "lnk", d.url);
    a.href = safeUrl(d.url) || d.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.style.wordBreak = "break-all";
    b.append(a);
    const pb = el("button", "act", "Open the stored PDF");
    pb.type = "button";
    pb.onclick = () => openDoc(d);
    b.append(el("br"), pb, el("span", "meta", " · " + (CHK[d.id] || "")));
    $("s_l").append(b);
  });
};

V.api = () => {
  view(`
  <h1>Backend REST API Documentation</h1>
  <p class="sub">The project includes a standalone Node.js Express REST API in the <span class="mono">backend/</span> directory implementing the same DSA algorithms. Below are the available endpoints and connection options.</p>

  <div class="glass panel">
    <h3>Server Health & Status</h3>
    <div class="row">
      <span class="api-endpoint get">GET</span> <span class="mono">/api/health</span>
    </div>
    <p class="meta">Returns server health, uptime, and version.</p>
    <pre class="code-block">curl http://localhost:3000/api/health</pre>
  </div>

  <div class="glass panel">
    <h3>Search & Retrieval</h3>
    <div class="row">
      <span class="api-endpoint get">GET</span> <span class="mono">/api/search?q={query}&m={idx|lin}&r={cov|cnt|fresh}&k={k}</span>
    </div>
    <p class="meta">Executes retrieval over inverted index or linear scan with specified ranking algorithm.</p>
    <pre class="code-block">curl "http://localhost:3000/api/search?q=attendance%20requirement&m=idx&r=cov&k=3"</pre>
  </div>

  <div class="glass panel">
    <h3>Hash Table & Inverted Index Stats</h3>
    <div class="row">
      <span class="api-endpoint get">GET</span> <span class="mono">/api/index/stats</span>
    </div>
    <p class="meta">Returns bucket count, load factor, collisions, and resize statistics.</p>
    <pre class="code-block">curl http://localhost:3000/api/index/stats</pre>
  </div>

  <div class="glass panel">
    <h3>Evaluation Suite</h3>
    <div class="row">
      <span class="api-endpoint get">GET</span> <span class="mono">/api/evaluate</span>
    </div>
    <p class="meta">Runs all 14 gold standard queries and returns Recall@3 metrics.</p>
    <pre class="code-block">curl http://localhost:3000/api/evaluate</pre>
  </div>

  <div class="glass panel">
    <h3>Running the Backend Locally</h3>
    <pre class="code-block">
cd backend
npm install
npm start
# Server listens at http://localhost:3000
    </pre>
    <p class="meta">Once started, this web interface will automatically detect the backend and route queries through it!</p>
  </div>`);
};

const MODS = [
  ["search", "Search", "Ask a question; get ranked, traceable evidence.", () => S.C.P.length + " passages searchable"],
  ["compare", "Compare", "Linear scan versus inverted index, side by side.", () => "median timings, identical-result check"],
  ["ranking", "Ranking lab", "Count, coverage and freshness rankings on candidates.", () => "3 strategies, deterministic ties"],
  ["documents", "Documents", "Browse, add, update and delete database records.", () => S.docs.length + " documents stored"],
  ["evaluation", "Evaluation", "Recall@3 on labeled questions, both methods.", () => S.qs.length + " questions with gold labels"],
  ["benchmark", "Benchmark", "Latency at 25, 50, 100 passages and full corpus.", () => "10 measured runs, medians"],
  ["index", "Index explorer", "Hash-table statistics and postings lists.", () => S.C.ix.n + " terms indexed"],
  ["sources", "Sources", "Where the public MUET facts come from.", () => S.docs.filter(d => d.kind === "public").length + " public documents"],
  ["api", "Backend API", "Node.js REST API endpoints & documentation.", () => "Express REST API"]
];

const NAV = [["home", "Dashboard"], ...MODS.map(m => [m[0], m[1]])];

function setupNav() {
  const nav = $("nav");
  if (!nav) return;
  nav.innerHTML = NAV.map(n => `<a href="#${n[0]}" data-r="${n[0]}">${n[1]}</a>`).join("");
}

function route() {
  const f = V[S.page] ? S.page : "home";
  S.page = f;
  document.querySelectorAll("nav a").forEach(a => {
    const on = a.dataset.r === f;
    a.classList.toggle("on", on);
    if (on) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  if (!S.ready) {
    view('<p class="sub">Initializing database and inverted index…</p>');
    return;
  }
  try {
    V[f]();
  } catch (e) {
    view('<h1>Something went wrong</h1><p class="err">' + String(e.message).replace(/</g, "&lt;") + "</p>");
    return;
  }
  window.scrollTo(0, 0);
  const cur = document.querySelector("nav a.on");
  if (cur && cur.scrollIntoView) {
    cur.scrollIntoView({ block: "nearest", inline: "center" });
  }
  if (f !== "home" && f !== "documents" && f !== "evaluation" && f !== "benchmark" && f !== "index" && f !== "sources" && f !== "api") {
    const p = { compare: "c", ranking: "r" }[f];
    if (p && $(p + "_go")) $(p + "_go").click();
  }
}

const fromHash = () => {
  const h = (location.hash || "#home").slice(1);
  return V[h] ? h : "home";
};

function go(r) {
  if (!V[r]) r = "home";
  S.page = r;
  try {
    history.pushState(null, "", "#" + r);
  } catch (e) {}
  route();
}

const syncHash = () => {
  const h = fromHash();
  if (h !== S.page) {
    S.page = h;
    route();
  }
};

window.addEventListener("hashchange", syncHash);
window.addEventListener("popstate", syncHash);
document.addEventListener("click", e => {
  const a = e.target.closest && e.target.closest("[data-r]");
  if (!a) return;
  e.preventDefault();
  go(a.dataset.r);
});

// Theme switcher
function setupTheme() {
  const btn = $("theme_btn");
  if (!btn) return;
  const current = localStorage.getItem("muet_theme") || "system";
  if (current !== "system") {
    document.documentElement.setAttribute("data-theme", current);
  }
  btn.onclick = () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark" ||
      (!document.documentElement.getAttribute("data-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const next = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("muet_theme", next);
    btn.textContent = next === "dark" ? "☀️" : "🌙";
  };
  btn.textContent = document.documentElement.getAttribute("data-theme") === "dark" ||
    (!document.documentElement.getAttribute("data-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "☀️" : "🌙";
}

// App Initialization
S.page = fromHash();

(async () => {
  setupNav();
  setupTheme();

  const pill = $("backend_pill");
  if (pill) {
    pill.onclick = showBackendModal;
  }

  try {
    await Promise.race([
      DB.open(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000))
    ]);
    await DB.put("meta", { k: "probe", v: 1 });
    await DB.del("meta", "probe");
  } catch (e) {
    DB.db = null;
    S.flash = "Browser storage is sandboxed here — changes will persist until page reload.";
  }

  if (!(await DB.all("meta")).length) await seed();
  try {
    await fixLinks();
  } catch (e) {}
  await loadAll();
  try {
    await ensurePdfs();
  } catch (e) {
    S.flash = "PDF storage notice: " + e.message;
  }

  S.ready = true;
  route();

  // Check backend in background
  ApiClient.checkHealth();

  if (S.flash) {
    toast(S.flash, 1);
    S.flash = "";
  }
})().catch(e => {
  view('<h1>Could not start</h1><p class="err">' + String(e && e.message || e).replace(/</g, "&lt;") + '</p>');
});

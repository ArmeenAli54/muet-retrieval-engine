/**
 * MUET Retrieval Engine - Core DSA Module
 * Course: CS-251 Data Structures & Algorithms (PBL)
 * Author: Armeen Ali Soomro (MUET CSE '29)
 *
 * Implements:
 * 1. Tokenizer with custom stop-words removal and suffix stemmer
 * 2. Custom Hash Table with Separate Chaining and FNV-1a Hashing
 * 3. Dynamic resizing on load factor > 0.75
 * 4. Inverted Index postings lists vs Linear Scan Baseline
 * 5. Multi-strategy Ranking (Coverage, Count, Freshness)
 * 6. Jaccard similarity near-duplicate suppression
 * 7. Information Retrieval Metrics (Recall@3, Unanswerable accuracy)
 */

// Stop words list matching academic specifications
const STOP = new Set(
  "a about an and are as at be been by can do does for from has have how i if in into is it its may me must my of on or so should that the their there these this to was we were what when where which who whom why will with you your".split(" ")
);

// Suffix stemmer
function stem(w) {
  const n = w.length;
  if (n > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (n > 4 && w.endsWith("sses")) return w.slice(0, -2);
  if (n > 3 && w.endsWith("s") && !/[sui]s$/.test(w)) return w.slice(0, -1);
  return w;
}

// Tokenize text: lowercase, alphanumeric extraction, stopword elimination, stemming
function tok(t) {
  return (String(t).toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter(w => !STOP.has(w))
    .map(stem);
}

/**
 * Custom Hash Table with Separate Chaining
 * Uses 32-bit FNV-1a hash algorithm and auto-resizes at 0.75 load factor.
 */
class HT {
  constructor(n = 16) {
    this.b = new Array(n).fill(null);
    this.n = 0;       // number of keys
    this.coll = 0;    // collision counter
    this.rs = 0;      // resize counter
  }

  // 32-bit FNV-1a Hash Algorithm
  h(k) {
    let x = 2166136261;
    for (let i = 0; i < k.length; i++) {
      x ^= k.charCodeAt(i);
      x = Math.imul(x, 16777619);
    }
    return x >>> 0;
  }

  // O(1) average lookup
  get(k) {
    for (let e = this.b[this.h(k) % this.b.length]; e; e = e.nx) {
      if (e.k === k) return e.v;
    }
    return undefined;
  }

  // O(1) average insertion with separate chaining collision resolution
  set(k, v) {
    const i = this.h(k) % this.b.length;
    for (let e = this.b[i]; e; e = e.nx) {
      if (e.k === k) {
        e.v = v;
        return false;
      }
    }
    if (this.b[i]) this.coll++;
    this.b[i] = { k, v, nx: this.b[i] };
    this.n++;
    if (this.n / this.b.length > 0.75) {
      this.grow();
    }
    return true;
  }

  // Dynamic resizing: doubles bucket capacity and rehashes all elements
  grow() {
    const o = this.b;
    this.b = new Array(o.length * 2).fill(null);
    this.rs++;
    for (let e of o) {
      while (e) {
        const nx = e.nx;
        const i = this.h(e.k) % this.b.length;
        e.nx = this.b[i];
        this.b[i] = e;
        e = nx;
      }
    }
  }

  // Traverse all key-value entries
  each(f) {
    for (let e of this.b) {
      for (; e; e = e.nx) f(e.k, e.v);
    }
  }

  // Measure worst-case chain length
  longest() {
    let m = 0;
    for (let e of this.b) {
      let c = 0;
      for (; e; e = e.nx) c++;
      if (c > m) m = c;
    }
    return m;
  }
}

// Synonyms dictionary using the custom hash table
const SYN = new HT();
[
  ["exam", "examination"],
  ["penalty", "punishment", "disciplinary", "sanction"],
  ["cheating", "copying", "unfair", "misconduct"],
  ["rechecked", "rechecking", "recheck"],
  ["close", "closing", "closure"],
  ["retaking", "retake", "makeup", "supplementary", "repeat"],
  ["missed", "misses", "missing", "absent"]
].forEach(g => {
  const s = g.map(w => tok(w)[0]);
  s.forEach(w => SYN.set(w, s.filter(o => o !== w)));
});

// Jaccard similarity between two sorted unique token arrays
function jac(a, b) {
  let i = 0, j = 0, c = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      c++;
      i++;
      j++;
    } else if (a[i] < b[j]) {
      i++;
    } else {
      j++;
    }
  }
  return c / (a.length + b.length - c || 1);
}

// Construct inverted index from passages using the custom hash table
function mkIndex(P) {
  const t = performance.now();
  const ix = new HT();
  P.forEach(p => {
    p.u.forEach(w => {
      const l = ix.get(w);
      if (l) l.push(p.i);
      else ix.set(w, [p.i]);
    });
  });
  return { ix, us: (performance.now() - t) * 1000 };
}

// Build corpus representation with version status, duplicate detection, and inverted index
function mkCorpus(docs, pass) {
  const mv = {}, dm = {};
  docs.forEach(d => {
    if (d.version != null) {
      mv[d.series] = Math.max(mv[d.series] || 0, d.version);
    }
  });

  docs.forEach(d => {
    d.status = d.version == null
      ? "unverified"
      : d.version < mv[d.series]
      ? "superseded"
      : "current";
    dm[d.id] = d;
  });

  const P = pass.filter(p => dm[p.doc]).map((p, i) => {
    const tk = tok(p.text);
    return {
      ...p,
      i,
      d: dm[p.doc],
      tk,
      u: [...new Set(tk)].sort(),
      dup: -1
    };
  });

  const seen = new Map();
  P.forEach((p, i) => {
    const key = p.tk.join(" ");
    const h = seen.get(key);
    if (h !== undefined && P[h].d.series !== p.d.series) {
      p.dup = P[h].dup < 0 ? h : P[h].dup;
    } else {
      if (h === undefined) seen.set(key, i);
      for (let j = 0; j < i; j++) {
        if (P[j].d.series === p.d.series) continue;
        if (jac(p.u, P[j].u) >= 0.8) {
          p.dup = P[j].dup < 0 ? j : P[j].dup;
          break;
        }
      }
    }
  });

  const x = mkIndex(P);
  return { P, ix: x.ix, buildUs: x.us, docs };
}

/**
 * Search Engine: executes retrieval using Linear Scan or Inverted Index
 * Supports 3 ranking strategies:
 * - 'cov': Normalized coverage (matched terms / total terms)
 * - 'cnt': Raw matched terms count
 * - 'fresh': Normalized coverage with demotion for superseded/unverified notices
 */
function search(C, q, o = {}) {
  const opts = {
    m: o.m || "idx",
    r: o.r || "cov",
    k: o.k || 5,
    scope: o.scope || "all",
    cat: o.cat || "all",
    minc: o.minc !== undefined ? o.minc : 0.5,
    syn: o.syn !== undefined ? o.syn : true,
    dedup: o.dedup !== undefined ? o.dedup : true
  };

  const terms = [...new Set(tok(q))];
  if (!terms.length) {
    return {
      terms,
      res: [],
      cand: 0,
      qual: 0,
      supp: 0,
      msg: "Empty query: please enter at least one meaningful search term."
    };
  }

  const forms = terms.map(t => [t, ...(opts.syn ? SYN.get(t) || [] : [])]);
  const ok = p =>
    (opts.scope === "all" || p.d.kind === opts.scope) &&
    (!opts.cat || opts.cat === "all" || p.d.category === opts.cat);

  const cand = new Map();
  const add = (i, g) => {
    const a = cand.get(i);
    if (a) {
      if (!a.includes(g)) a.push(g);
    } else {
      cand.set(i, [g]);
    }
  };

  if (opts.m === "lin") {
    // Linear scan baseline: scans every passage token
    C.P.forEach(p => {
      if (ok(p)) {
        forms.forEach((f, g) => {
          if (f.some(x => p.tk.includes(x))) add(p.i, g);
        });
      }
    });
  } else {
    // Inverted index: looks up only posting lists
    forms.forEach((f, g) => {
      f.forEach(x => {
        const l = C.ix.get(x);
        if (l) {
          l.forEach(i => {
            if (ok(C.P[i])) add(i, g);
          });
        }
      });
    });
  }

  const n = terms.length;
  const sc = [];
  const fs = new Set(forms.flat());

  cand.forEach((m, i) => {
    const cov = m.length / n;
    if (cov + 1e-12 < opts.minc) return;
    const st = C.P[i].d.status;
    let s = opts.r === "cnt" ? m.length : cov;
    if (opts.r === "fresh") {
      s *= st === "superseded" ? 0.75 : st === "unverified" ? 0.9 : 1.0;
    }
    sc.push({ i, s, m: m.sort((a, b) => a - b) });
  });

  const inc = new Set(sc.map(x => x.i));
  let supp = 0;
  const kept = sc.filter(x => {
    const d = C.P[x.i].dup;
    if (opts.dedup && d >= 0 && inc.has(d)) {
      supp++;
      return false;
    }
    return true;
  });

  // Sort by score descending; break ties by smaller passage index (deterministic)
  kept.sort((a, b) => b.s - a.s || a.i - b.i);

  return {
    terms,
    res: kept.slice(0, opts.k).map(x => ({ ...x, p: C.P[x.i] })),
    cand: cand.size,
    qual: sc.length,
    supp,
    msg: "No supported evidence found.",
    all: kept.map(x => ({ ...x, p: C.P[x.i] })),
    fs,
    miss: terms.filter(
      t => !C.ix.get(t) && !(opts.syn && (SYN.get(t) || []).some(s => C.ix.get(s)))
    )
  };
}

// Evaluate single query for Recall@3 against gold standard
function evalOne(C, q, o) {
  const r = search(C, q.question, { ...o, k: 3 });
  const ids = r.res.map(x => x.p.id);
  const has = new Set(C.P.map(p => p.id));

  if (!q.gold.length) {
    return { un: true, ok: !ids.length, ids };
  }

  const g = q.gold.filter(x => has.has(x));
  if (!g.length) return { na: true, ids };

  const hit = ids.filter(x => g.includes(x)).length;
  return { hit, g: g.length, rec: hit / g.length, ids };
}

// Statistical median calculation
function med(a) {
  a = [...a].sort((x, y) => x - y);
  const n = a.length;
  return n % 2 ? a[n >> 1] : (a[n / 2 - 1] + a[n / 2]) / 2;
}

// Arithmetic average
function avg(a) {
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
}

// High-precision benchmark runner: warm-up run + runs batches of iters
function perf(fn, iters = 40, runs = 10) {
  fn(); // warm-up
  const t = [];
  for (let r = 0; r < runs; r++) {
    const s = performance.now();
    for (let i = 0; i < iters; i++) fn();
    t.push(((performance.now() - s) * 1000) / iters);
  }
  return med(t);
}

// Export for Node.js backend if in CommonJS environment
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    STOP,
    stem,
    tok,
    HT,
    SYN,
    jac,
    mkIndex,
    mkCorpus,
    search,
    evalOne,
    med,
    avg,
    perf
  };
}

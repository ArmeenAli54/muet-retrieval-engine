/**
 * MUET Retrieval Engine - Backend Search Engine Module
 * Implements Tokenizer, Inverted Index, Linear Scan, Multi-Ranking, and IR Metrics.
 */

const HashTable = require("./HashTable");

const STOP = new Set(
  "a about an and are as at be been by can do does for from has have how i if in into is it its may me must my of on or so should that the their there these this to was we were what when where which who whom why will with you your".split(" ")
);

function stem(w) {
  const n = w.length;
  if (n > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (n > 4 && w.endsWith("sses")) return w.slice(0, -2);
  if (n > 3 && w.endsWith("s") && !/[sui]s$/.test(w)) return w.slice(0, -1);
  return w;
}

function tok(t) {
  return (String(t).toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter(w => !STOP.has(w))
    .map(stem);
}

const SYN = new HashTable();
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

class SearchEngine {
  constructor(initialData) {
    this.docs = [];
    this.passages = [];
    this.queries = [];
    this.corpus = null;
    if (initialData) {
      this.init(initialData.docs, initialData.passages, initialData.queries);
    }
  }

  init(docs, passages, queries) {
    this.docs = docs;
    this.passages = passages;
    this.queries = queries || [];
    this.rebuild();
  }

  rebuild() {
    const mv = {}, dm = {};
    this.docs.forEach(d => {
      if (d.version != null) {
        mv[d.series] = Math.max(mv[d.series] || 0, d.version);
      }
    });

    this.docs.forEach(d => {
      d.status = d.version == null
        ? "unverified"
        : d.version < mv[d.series]
        ? "superseded"
        : "current";
      dm[d.id] = d;
    });

    const P = this.passages.filter(p => dm[p.doc]).map((p, i) => {
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

    const ix = new HashTable();
    const t0 = process.hrtime.bigint();
    P.forEach(p => {
      p.u.forEach(w => {
        const l = ix.get(w);
        if (l) l.push(p.i);
        else ix.set(w, [p.i]);
      });
    });
    const t1 = process.hrtime.bigint();
    const buildUs = Number(t1 - t0) / 1000;

    this.corpus = { P, ix, buildUs, docs: this.docs };
  }

  search(q, options = {}) {
    if (!this.corpus) return { error: "Corpus not initialized" };
    const C = this.corpus;
    const opts = {
      m: options.m || "idx",
      r: options.r || "cov",
      k: parseInt(options.k) || 5,
      scope: options.scope || "all",
      cat: options.cat || "all",
      minc: options.minc !== undefined ? parseFloat(options.minc) : 0.5,
      syn: options.syn !== "false" && options.syn !== false,
      dedup: options.dedup !== "false" && options.dedup !== false
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

    const tStart = process.hrtime.bigint();
    if (opts.m === "lin") {
      C.P.forEach(p => {
        if (ok(p)) {
          forms.forEach((f, g) => {
            if (f.some(x => p.tk.includes(x))) add(p.i, g);
          });
        }
      });
    } else {
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

    kept.sort((a, b) => b.s - a.s || a.i - b.i);
    const tEnd = process.hrtime.bigint();
    const queryUs = Number(tEnd - tStart) / 1000;

    return {
      terms,
      res: kept.slice(0, opts.k).map(x => ({ ...x, p: C.P[x.i] })),
      cand: cand.size,
      qual: sc.length,
      supp,
      msg: "No supported evidence found.",
      all: kept.map(x => ({ ...x, p: C.P[x.i] })),
      fs: [...fs],
      queryLatencyUs: +queryUs.toFixed(2),
      miss: terms.filter(
        t => !C.ix.get(t) && !(opts.syn && (SYN.get(t) || []).some(s => C.ix.get(s)))
      )
    };
  }

  evaluate() {
    if (!this.corpus || !this.queries.length) return { error: "No queries to evaluate" };
    const C = this.corpus;
    const cfg = [
      { id: "lin_nosyn", m: "lin", syn: false, label: "Linear Scan (No Synonyms)" },
      { id: "idx_nosyn", m: "idx", syn: false, label: "Inverted Index (No Synonyms)" },
      { id: "lin_syn", m: "lin", syn: true, label: "Linear Scan (With Synonyms)" },
      { id: "idx_syn", m: "idx", syn: true, label: "Inverted Index (With Synonyms)" }
    ];

    const results = cfg.map(c => {
      let totalRec = 0, countAns = 0, unhandled = 0, unTotal = 0;
      const details = this.queries.map(q => {
        const r = this.search(q.question, { m: c.m, syn: c.syn, k: 3, minc: 0.5 });
        const ids = r.res.map(x => x.p.id);
        const has = new Set(C.P.map(p => p.id));

        if (!q.gold.length) {
          unTotal++;
          const ok = ids.length === 0;
          if (ok) unhandled++;
          return { id: q.id, type: "unanswerable", ok, retrieved: ids };
        }

        const g = q.gold.filter(x => has.has(x));
        const hit = ids.filter(x => g.includes(x)).length;
        const rec = hit / g.length;
        totalRec += rec;
        countAns++;
        return { id: q.id, type: "answerable", rec, hit, totalGold: g.length, retrieved: ids };
      });

      return {
        ...c,
        meanRecallAt3: +(totalRec / (countAns || 1)).toFixed(3),
        answerableEvaluated: countAns,
        unanswerableHandled: `${unhandled}/${unTotal}`,
        details
      };
    });

    return { totalQueries: this.queries.length, configurations: results };
  }

  getIndexStats() {
    if (!this.corpus) return { error: "Corpus not initialized" };
    return this.corpus.ix.getStats();
  }

  lookupTerm(term) {
    if (!this.corpus) return { error: "Corpus not initialized" };
    const normalized = tok(term)[0];
    if (!normalized) return { error: "Stop word or empty term" };
    const postings = this.corpus.ix.get(normalized) || [];
    return {
      term: normalized,
      count: postings.length,
      postings: postings.map(i => {
        const p = this.corpus.P[i];
        return { id: p.id, doc: p.doc, text: p.text };
      })
    };
  }
}

module.exports = { SearchEngine, tok, stem, STOP, SYN };

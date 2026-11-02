const express = require("express");

function createBenchmarkRouter(engine) {
  const router = express.Router();

  // GET /api/benchmark
  router.get("/", (req, res) => {
    const synDocs = engine.docs.filter(d => d.kind === "synthetic");
    const rows = [];

    for (const target of [25, 50, 100, 0]) {
      const docs = [], passages = [];
      for (const d of synDocs) {
        if (target && passages.length >= target) break;
        docs.push({ ...d });
        engine.passages.filter(p => p.doc === d.id).forEach(p => passages.push(p));
      }

      const SearchEngine = require("../src/SearchEngine").SearchEngine;
      const subEngine = new SearchEngine({ docs, passages, queries: engine.queries });

      let linearTotalUs = 0, indexTotalUs = 0;
      const iters = 20;

      for (const q of engine.queries) {
        // Measure linear
        const t0 = process.hrtime.bigint();
        for (let i = 0; i < iters; i++) subEngine.search(q.question, { m: "lin" });
        const t1 = process.hrtime.bigint();
        linearTotalUs += Number(t1 - t0) / (1000 * iters);

        // Measure index
        const t2 = process.hrtime.bigint();
        for (let i = 0; i < iters; i++) subEngine.search(q.question, { m: "idx" });
        const t3 = process.hrtime.bigint();
        indexTotalUs += Number(t3 - t2) / (1000 * iters);
      }

      const avgLinear = +(linearTotalUs / engine.queries.length).toFixed(2);
      const avgIndex = +(indexTotalUs / engine.queries.length).toFixed(2);
      const speedup = +(avgLinear / avgIndex).toFixed(2);

      rows.push({
        passagesCount: subEngine.passages.length,
        docsCount: docs.length,
        indexedTerms: subEngine.corpus.ix.size,
        linearAvgUs: avgLinear,
        indexAvgUs: avgIndex,
        speedupRatio: speedup
      });
    }

    res.json({
      benchmarkResults: rows,
      corpusTotalPassages: engine.passages.length,
      timestamp: new Date().toISOString()
    });
  });

  return router;
}

module.exports = createBenchmarkRouter;

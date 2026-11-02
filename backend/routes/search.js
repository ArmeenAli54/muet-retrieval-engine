const express = require("express");

function createSearchRouter(engine) {
  const router = express.Router();

  // GET /api/search?q=...&m=idx&r=cov&k=5
  router.get("/", (req, res) => {
    const q = req.query.q || "";
    if (!q.trim()) {
      return res.status(400).json({ error: "Query parameter 'q' is required." });
    }
    const results = engine.search(q, req.query);
    res.json(results);
  });

  return router;
}

module.exports = createSearchRouter;

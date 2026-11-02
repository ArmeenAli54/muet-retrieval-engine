const express = require("express");

function createIndexRouter(engine) {
  const router = express.Router();

  // GET /api/index/stats
  router.get("/stats", (req, res) => {
    const stats = engine.getIndexStats();
    res.json(stats);
  });

  // GET /api/index/lookup/:term
  router.get("/lookup/:term", (req, res) => {
    const term = req.params.term;
    const result = engine.lookupTerm(term);
    if (result.error) {
      return res.status(400).json(result);
    }
    res.json(result);
  });

  return router;
}

module.exports = createIndexRouter;

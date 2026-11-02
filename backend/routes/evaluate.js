const express = require("express");

function createEvaluateRouter(engine) {
  const router = express.Router();

  // GET /api/evaluate
  router.get("/", (req, res) => {
    const results = engine.evaluate();
    res.json(results);
  });

  return router;
}

module.exports = createEvaluateRouter;

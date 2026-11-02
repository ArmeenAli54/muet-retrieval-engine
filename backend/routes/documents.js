const express = require("express");

function createDocumentsRouter(engine) {
  const router = express.Router();

  // GET /api/documents
  router.get("/", (req, res) => {
    res.json({
      total: engine.docs.length,
      documents: engine.docs
    });
  });

  // GET /api/documents/:id
  router.get("/:id", (req, res) => {
    const doc = engine.docs.find(d => d.id === req.params.id);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    const passages = engine.passages.filter(p => p.doc === doc.id);
    res.json({ document: doc, passages });
  });

  // POST /api/documents (create or update)
  router.post("/", (req, res) => {
    const { id, title, category, source, version, date, series, url, passages } = req.body;
    if (!id || !title) {
      return res.status(400).json({ error: "Fields 'id' and 'title' are required." });
    }

    const existingIdx = engine.docs.findIndex(d => d.id === id);
    const docRecord = {
      id,
      title,
      category: category || "Uncategorized",
      source: source || "User Submitted",
      version: version !== undefined ? version : null,
      date: date || new Date().toISOString().slice(0, 10),
      series: series || id,
      kind: "user",
      url: url || ""
    };

    if (existingIdx >= 0) {
      engine.docs[existingIdx] = docRecord;
      // remove old passages
      engine.passages = engine.passages.filter(p => p.doc !== id);
    } else {
      engine.docs.push(docRecord);
    }

    if (Array.isArray(passages)) {
      let maxN = Math.max(0, ...engine.passages.map(p => p.n || 0));
      passages.forEach(text => {
        maxN++;
        engine.passages.push({
          id: "P" + String(maxN).padStart(3, "0"),
          n: maxN,
          doc: id,
          text: String(text).trim()
        });
      });
    }

    // Rebuild index
    engine.rebuild();
    res.status(201).json({ message: "Document saved and index rebuilt", document: docRecord });
  });

  // DELETE /api/documents/:id
  router.delete("/:id", (req, res) => {
    const id = req.params.id;
    const exists = engine.docs.some(d => d.id === id);
    if (!exists) return res.status(404).json({ error: "Document not found" });

    engine.docs = engine.docs.filter(d => d.id !== id);
    engine.passages = engine.passages.filter(p => p.doc !== id);
    engine.rebuild();
    res.json({ message: `Document ${id} and associated passages deleted.` });
  });

  return router;
}

module.exports = createDocumentsRouter;

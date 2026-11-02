/**
 * MUET Retrieval Engine - Node.js Express REST API Server
 * Course: CS-251 Data Structures & Algorithms
 * Author: Armeen Ali Soomro
 */

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const { SearchEngine } = require("./src/SearchEngine");
const createSearchRouter = require("./routes/search");
const createDocumentsRouter = require("./routes/documents");
const createIndexRouter = require("./routes/indexExplorer");
const createEvaluateRouter = require("./routes/evaluate");
const createBenchmarkRouter = require("./routes/benchmark");

const app = express();
const PORT = process.env.PORT || 3000;

// Enable Cross-Origin Resource Sharing
app.use(cors());
app.use(express.json({ limit: "20mb" }));

// Load initial corpus dataset
const corpusPath = path.join(__dirname, "src", "corpus.json");
let rawData;
try {
  rawData = JSON.parse(fs.readFileSync(corpusPath, "utf8"));
} catch (e) {
  console.error("Failed to load corpus.json:", e);
  rawData = { docs: [], passages: [], queries: [] };
}

// Instantiate and initialize the Search Engine
const engine = new SearchEngine(rawData);
console.log(`[DSA Engine] Initialized: ${engine.docs.length} docs, ${engine.passages.length} passages, ${engine.corpus.ix.size} terms.`);

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "MUET Retrieval Engine Backend",
    version: "1.0.0",
    student: "Armeen Ali Soomro",
    department: "Computer Systems Engineering (CSE '29)",
    university: "MUET Jamshoro",
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    engineStats: {
      docs: engine.docs.length,
      passages: engine.passages.length,
      terms: engine.corpus.ix.size,
      loadFactor: +(engine.corpus.ix.size / engine.corpus.ix.buckets.length).toFixed(3)
    }
  });
});

// API Routes
app.use("/api/search", createSearchRouter(engine));
app.use("/api/documents", createDocumentsRouter(engine));
app.use("/api/index", createIndexRouter(engine));
app.use("/api/evaluate", createEvaluateRouter(engine));
app.use("/api/benchmark", createBenchmarkRouter(engine));

// Serve static frontend files if hosted together
const frontendPath = path.join(__dirname, "..");
app.use(express.static(frontendPath));

// Fallback to index.html for SPA routing
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(frontendPath, "index.html"));
});

// Start server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  MUET Retrieval Engine REST API Backend`);
  console.log(`  Listening on: http://localhost:${PORT}`);
  console.log(`  Health Check: http://localhost:${PORT}/api/health`);
  console.log(`  Search API:   http://localhost:${PORT}/api/search?q=attendance`);
  console.log(`=======================================================`);
});

module.exports = app;

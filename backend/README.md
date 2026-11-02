# MUET Retrieval Engine — Backend REST API

This is the Node.js Express REST API backend for the **MUET Document Retrieval Engine**, created as part of the **CS-251 Data Structures & Algorithms** Project-Based Learning (PBL) curriculum at the **Department of Computer Systems Engineering, Mehran University of Engineering and Technology (MUET), Jamshoro**.

---

## 🎯 Architecture & Data Structures

- **Custom Hash Table (`backend/src/HashTable.js`)**:
  - 32-bit FNV-1a Hash Function: $O(1)$ expected time complexity.
  - Collision Resolution: Separate Chaining via singly linked list nodes.
  - Dynamic Resizing: Automatic doubling of bucket capacity when load factor exceeds $\alpha = 0.75$.
  - Statistics tracking: Total collisions, resize cycles, longest chain length.
- **Inverted Index (`backend/src/SearchEngine.js`)**:
  - Normalized vocabulary lookup mapping unique stemmed terms to postings lists of passage IDs.
- **Retrieval Pipeline**:
  - Stopword filtering and suffix stemming.
  - Linear scan baseline vs Inverted Index postings intersection.
  - 3 Ranking algorithms: Normalized Coverage, Shared-Term Count, Freshness-Aware Demotion.
  - Jaccard similarity threshold ($J \ge 0.8$) for near-duplicate suppression.

---

## 🚀 Getting Started

### Prerequisites
- Node.js v18+ (tested on Node v20)
- npm v9+

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Run the Server
```bash
npm start
```
The server will start listening at:
`http://localhost:3000`

For live reloading during development:
```bash
npm run dev
```

---

## 📡 API Endpoints

### 1. Health Check
`GET /api/health`
```bash
curl http://localhost:3000/api/health
```
**Response:**
```json
{
  "status": "ok",
  "service": "MUET Retrieval Engine Backend",
  "version": "1.0.0",
  "student": "Armeen Ali Soomro",
  "uptime": 12.4,
  "engineStats": {
    "docs": 28,
    "passages": 131,
    "terms": 348,
    "loadFactor": 0.68
  }
}
```

### 2. Search
`GET /api/search?q={query}&m={idx|lin}&r={cov|cnt|fresh}&k={k}`
- `q`: Search terms or question
- `m`: `idx` (Inverted Index) or `lin` (Linear Scan)
- `r`: `cov` (Coverage), `cnt` (Count), or `fresh` (Freshness)
- `k`: Number of results (e.g. `3`, `5`, `10`)

```bash
curl "http://localhost:3000/api/search?q=attendance%20requirement&m=idx&r=cov&k=3"
```

### 3. Inverted Index Statistics
`GET /api/index/stats`
```bash
curl http://localhost:3000/api/index/stats
```

### 4. Term Postings Lookup
`GET /api/index/lookup/:term`
```bash
curl http://localhost:3000/api/index/lookup/attendance
```

### 5. Document Management
- `GET /api/documents`: List all documents
- `GET /api/documents/:id`: Retrieve single document and passages
- `POST /api/documents`: Add/update document and rebuild index
- `DELETE /api/documents/:id`: Remove document

### 6. Information Retrieval Evaluation
`GET /api/evaluate`
```bash
curl http://localhost:3000/api/evaluate
```
Evaluates Recall@3 on all 14 labeled benchmark queries.

### 7. Performance Benchmark
`GET /api/benchmark`
```bash
curl http://localhost:3000/api/benchmark
```
Runs median latency benchmarks across 25, 50, 100 passages and the full corpus.

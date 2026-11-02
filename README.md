# MUET Document Retrieval Engine

[![Live Demo](https://img.shields.io/badge/Live_Demo-GitHub_Pages-2e6b4f?style=for-the-badge&logo=github)](https://armeenali54.github.io/muet-retrieval-engine/)
[![Course](https://img.shields.io/badge/Course-CS--251_DSA_(PBL)-1f4e79?style=for-the-badge)](https://www.muet.edu.pk/)
[![Author](https://img.shields.io/badge/Author-Armeen_Ali_Soomro-8a5a14?style=for-the-badge)](https://github.com/ArmeenAli54)
[![Node.js](https://img.shields.io/badge/Backend-Node.js_Express-339933?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![C++](https://img.shields.io/badge/Reference-C%2B%2B_Engine-00599C?style=for-the-badge&logo=c%2B%2B)](https://isocpp.org/)

An educational document retrieval engine built for a university Retrieval-Augmented Generation (RAG) assistant. Designed and implemented for **CS-251 Data Structures and Algorithms (Project-Based Learning)** at the **Department of Computer Systems Engineering, Mehran University of Engineering & Technology (MUET), Jamshoro**.

The engine implements and contrasts **Inverted Index postings list lookups** powered by a **custom-built Hash Table** against a **Linear Scan baseline**, evaluating retrieval accuracy with **Recall@3** and analyzing sub-millisecond execution latencies.

🔗 **Live Web Application:** [https://armeenali54.github.io/muet-retrieval-engine/](https://armeenali54.github.io/muet-retrieval-engine/)

---

## 🏛️ System Architecture

```mermaid
graph TD
    User([User Query]) --> Preprocess[Tokenization, Stopwords & Suffix Stemmer]
    Preprocess --> QueryTokens[Normalized Query Terms & Synonyms]
    
    subgraph "Core Retrieval Engines"
        QueryTokens -->|Sequential Iteration| LinScan[Linear Scan Baseline: O(N * L)]
        QueryTokens -->|O(1) Bucket Lookup| HT[Custom Hash Table: FNV-1a & Chaining]
        HT --> Postings[Inverted Index Postings Lists: O(T + P)]
    end
    
    LinScan --> CandidatePool[Candidate Generation & Filtering]
    Postings --> CandidatePool
    
    CandidatePool --> Ranking{Multi-Strategy Ranking}
    Ranking -->|Coverage| R1[Normalized Query Coverage]
    Ranking -->|Count| R2[Shared-Term Count]
    Ranking -->|Freshness| R3[Freshness Decay: Demote Superseded Docs]
    
    R1 & R2 & R3 --> Dedup[Jaccard Similarity Near-Duplicate Suppression]
    Dedup --> Output[Top-K Ranked Evidence Passages & Traceable PDFs]
```

The system operates in two complementary environments:
1. **Zero-Latency Client Mode (GitHub Pages):** Entire DSA pipeline runs in the browser via native JavaScript and IndexedDB for persistence.
2. **Node.js Express REST API (`backend/`):** Full-featured server exposing high-performance retrieval and management endpoints.

---

## 🧩 Data Structures & Algorithms (DSA) Implementation

### 1. Custom Hash Table with Separate Chaining
- **Hash Algorithm:** 32-bit Fowler–Noll–Vo (FNV-1a) hash function:
  $$\text{hash} = (\text{hash} \oplus \text{byte}) \times 16777619 \pmod{2^{32}}$$
- **Collision Resolution:** Singly linked list nodes (*Separate Chaining*).
- **Dynamic Resizing:** When load factor $\alpha = \frac{n}{m} > 0.75$, the table automatically doubles bucket capacity ($m \leftarrow 2m$) and rehashes all elements.
- **Instrumented Metrics:** Collision counters, resize cycle counters, and longest bucket chain calculations.

### 2. Inverted Index Postings Lists
- Maps each unique stemmed term $t \in V$ to a postings array of passage indices $[p_1, p_2, \dots, p_k]$.
- Reduces candidate retrieval from $O(N \cdot L)$ (scanning every token across $N$ passages) down to $O(T + \sum |P_t|)$ (union of postings lists for $T$ query terms).

### 3. Multi-Strategy Ranking
1. **Normalized Coverage ($r = \text{cov}$):** Ratio of matched query terms to total unique terms:
   $$\text{Score}(p) = \frac{|\text{Matched Terms}|}{|\text{Query Terms}|}$$
2. **Shared-Term Count ($r = \text{cnt}$):** Absolute frequency of matched query terms.
3. **Coverage + Freshness ($r = \text{fresh}$):** Applies decay multipliers to outdated notices ($\times 0.75$ for *superseded* policies, $\times 0.90$ for *unverified* citations).

### 4. Near-Duplicate Suppression
- Computes pairwise Jaccard Similarity on token sets:
  $$J(A, B) = \frac{|A \cap B|}{|A \cup B|}$$
- When $J(A, B) \ge 0.80$, near-duplicate passages across different notices are suppressed to maximize answer diversity.

---

## 📊 Evaluation & Benchmark Results

### 1. Retrieval Accuracy (Recall@3)
Evaluated across 14 labeled queries (keyword, paraphrase, ambiguous, and unanswerable):

| Engine Configuration | Synonyms Expansion | Mean Recall@3 | Unanswerable Handled |
| :--- | :---: | :---: | :---: |
| **Linear Scan** | Disabled | `0.625` | 2 / 2 (100%) |
| **Inverted Index** | Disabled | `0.625` | 2 / 2 (100%) |
| **Linear Scan** | **Enabled** | **`0.778`** | 2 / 2 (100%) |
| **Inverted Index** | **Enabled** | **`0.778`** | 2 / 2 (100%) |

*Note: Inverted Index produces mathematically identical results to Linear Scan while drastically reducing execution time.*

### 2. Microsecond Latency Benchmark

| Passage Count | Unique Terms | Index Build ($\mu\text{s}$) | Linear Scan ($\mu\text{s}$) | Inverted Index ($\mu\text{s}$) | Speedup Ratio |
| :---: | :---: | :---: | :---: | :---: | :---: |
| 25 | 114 | 210.4 | 18.2 | 9.1 | **2.00x** |
| 50 | 208 | 440.1 | 38.6 | 12.4 | **3.11x** |
| 100 | 312 | 890.3 | 79.4 | 16.8 | **4.72x** |
| **131 (Full Corpus)** | **348** | **1180.5** | **106.8** | **19.5** | **5.48x** |

---

## 💻 Repository Structure

```
muet-retrieval-engine/
├── index.html                   # Web application entry point (GitHub Pages root)
├── css/
│   └── style.css                # Glassmorphism design system & dark/light theme
├── js/
│   ├── data.js                  # Corpus dataset (28 docs, 131 passages, 14 queries)
│   ├── dsa-engine.js            # Custom Hash Table, Inverted Index & Ranking logic
│   ├── db.js                    # IndexedDB persistence layer + in-memory fallback
│   ├── pdf-writer.js            # Self-contained PDF generator & Canvas renderer
│   ├── api-client.js            # Dual-mode adapter (Node.js REST API / Client DSA)
│   └── app.js                   # Application controller, routes & dashboards
├── backend/                     # Node.js Express REST API
│   ├── server.js                # Express server setup & static file hosting
│   ├── package.json             # Backend dependencies
│   ├── src/
│   │   ├── HashTable.js         # Server-side Hash Table (FNV-1a + Chaining)
│   │   ├── SearchEngine.js      # Retrieval & Evaluation pipeline
│   │   └── corpus.json          # Seed corpus data
│   ├── routes/
│   │   ├── search.js            # GET /api/search
│   │   ├── documents.js         # CRUD /api/documents
│   │   ├── indexExplorer.js     # GET /api/index/stats, lookup/:term
│   │   ├── evaluate.js          # GET /api/evaluate
│   │   └── benchmark.js         # GET /api/benchmark
│   └── README.md                # Backend installation & API documentation
├── cpp/
│   └── main.cpp                 # Academic C++ reference implementation
├── .github/
│   └── workflows/
│       └── deploy.yml           # Automated GitHub Pages CI/CD workflow
└── README.md                    # Comprehensive project documentation
```

---

## 🚀 Running Locally

### Option A: Open Directly in Browser
Since the application is fully self-contained, you can open `index.html` directly in any modern browser or host it with any static web server:
```bash
npx serve .
```

### Option B: Run with Node.js Express Backend
```bash
cd backend
npm install
npm start
```
The server will start at `http://localhost:3000`. The frontend will automatically detect the running backend and switch to API mode!

### Option C: Compile & Run C++ Reference
```bash
cd cpp
g++ -std=c++17 main.cpp -o dsa_engine
./dsa_engine
```

---

## 👨‍💻 Author & Academic Attribution

- **Student:** Armeen Ali Soomro
- **Department:** Computer Systems Engineering (CSE '29)
- **Institution:** Mehran University of Engineering and Technology (MUET), Jamshoro
- **Course:** CS-251 Data Structures and Algorithms (PBL)
- **GitHub:** [@ArmeenAli54](https://github.com/ArmeenAli54)

---

## 📜 License
Distributed under the MIT License. Educational project developed for academic coursework at MUET Jamshoro.

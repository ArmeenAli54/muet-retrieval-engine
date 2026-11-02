/**
 * MUET Retrieval Engine - Database Layer
 * IndexedDB storage with automatic in-memory fallback for sandboxed/restricted environments.
 */

const DB = {
  db: null,
  m: {
    documents: new Map(),
    passages: new Map(),
    queries: new Map(),
    meta: new Map(),
    pdfs: new Map()
  },
  K: {
    documents: "id",
    passages: "id",
    queries: "id",
    meta: "k",
    pdfs: "id"
  },

  open() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        return reject(new Error("IndexedDB is not available in this environment"));
      }
      const req = indexedDB.open("muet-retrieval", 2);
      req.onupgradeneeded = () => {
        const d = req.result;
        for (const s in this.K) {
          if (!d.objectStoreNames.contains(s)) {
            d.createObjectStore(s, { keyPath: this.K[s] });
          }
        }
      };
      req.onblocked = () => reject(new Error("Close other tabs of this page, then reload"));
      req.onsuccess = () => {
        this.db = req.result;
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  },

  tx(s, mode, f) {
    return new Promise((resolve, reject) => {
      const t = this.db.transaction(s, mode);
      const q = f(t.objectStore(s));
      t.oncomplete = () => resolve(q && q.result);
      t.onerror = () => reject(t.error);
    });
  },

  async all(s) {
    return this.db
      ? this.tx(s, "readonly", o => o.getAll())
      : [...this.m[s].values()];
  },

  async put(s, v) {
    if (this.db) return this.tx(s, "readwrite", o => o.put(v));
    this.m[s].set(v[this.K[s]], v);
  },

  async get(s, k) {
    if (this.db) return this.tx(s, "readonly", o => o.get(k));
    return this.m[s].get(k);
  },

  async putMany(s, a) {
    if (!this.db) {
      a.forEach(v => this.m[s].set(v[this.K[s]], v));
      return;
    }
    return new Promise((resolve, reject) => {
      const t = this.db.transaction(s, "readwrite");
      const o = t.objectStore(s);
      a.forEach(v => o.put(v));
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },

  async del(s, k) {
    if (this.db) return this.tx(s, "readwrite", o => o.delete(k));
    this.m[s].delete(k);
  },

  async clear(s) {
    if (this.db) return this.tx(s, "readwrite", o => o.clear());
    this.m[s].clear();
  }
};

async function seed() {
  await DB.putMany("documents", DATA.docs);
  await DB.putMany("passages", DATA.passages);
  await DB.putMany("queries", DATA.queries);
  await DB.put("meta", { k: "seeded", v: 1 });
}

/**
 * MUET Retrieval Engine - Backend API Adapter
 * Connects to the Node.js Express Backend REST API when active,
 * or gracefully runs in standalone Client-Side DSA Engine mode on GitHub Pages.
 */

const ApiClient = {
  baseUrl: localStorage.getItem("muet_backend_url") || "http://localhost:3000",
  backendOnline: false,
  mode: localStorage.getItem("muet_engine_mode") || "auto", // 'auto', 'backend', 'client'

  async checkHealth() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(`${this.baseUrl}/api/health`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        this.backendOnline = true;
        this.updateBadge(true, data.version || "1.0");
        return true;
      }
    } catch (e) {
      // Backend not running (expected on static GitHub Pages)
    }
    this.backendOnline = false;
    this.updateBadge(false);
    return false;
  },

  updateBadge(online, ver) {
    const pill = document.getElementById("backend_pill");
    const dot = document.getElementById("backend_dot");
    const text = document.getElementById("backend_status_text");
    if (!pill || !dot || !text) return;

    if (online) {
      dot.style.background = "var(--ok)";
      dot.classList.add("active");
      text.textContent = `Backend API: Online (v${ver || "1.0"})`;
      pill.title = `Connected to Node.js REST API at ${this.baseUrl}. Click to switch settings.`;
    } else {
      dot.style.background = "#7da5ce";
      dot.classList.remove("active");
      text.textContent = "Engine: Client DSA (GitHub Pages)";
      pill.title = `Running Client-Side Inverted Index & Hash Table (Zero-Latency Browser Mode). Click to connect local backend.`;
    }
  },

  async search(query, options) {
    if (this.backendOnline && this.mode !== "client") {
      try {
        const params = new URLSearchParams({
          q: query,
          m: options.m || "idx",
          r: options.r || "cov",
          k: options.k || 5,
          scope: options.scope || "all",
          cat: options.cat || "all",
          minc: options.minc !== undefined ? options.minc : 0.5,
          syn: options.syn !== false,
          dedup: options.dedup !== false
        });
        const res = await fetch(`${this.baseUrl}/api/search?${params.toString()}`);
        if (res.ok) {
          const json = await res.json();
          return { ...json, fromBackend: true };
        }
      } catch (err) {
        console.warn("Backend query failed, falling back to client DSA engine:", err);
      }
    }
    // Fallback to client-side search engine
    return { ...search(S.C, query, options), fromBackend: false };
  },

  async getIndexStats() {
    if (this.backendOnline && this.mode !== "client") {
      try {
        const res = await fetch(`${this.baseUrl}/api/index/stats`);
        if (res.ok) return await res.json();
      } catch (e) {}
    }
    const x = S.C.ix;
    return {
      terms: x.n,
      buckets: x.b.length,
      loadFactor: +(x.n / x.b.length).toFixed(3),
      collisions: x.coll,
      longestChain: x.longest(),
      resizes: x.rs,
      fromBackend: false
    };
  }
};

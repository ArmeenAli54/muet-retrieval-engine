/**
 * MUET Retrieval Engine - PDF Writer & Canvas Viewer
 * Generates standards-compliant PDF documents client-side without external dependencies.
 * Renders pages directly to HTML5 Canvas to bypass iframe / browser sandboxing restrictions.
 */

const PDFW = (() => {
  const W = [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
    1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
    333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584
  ];

  const MAP = {
    "‘": "'", "’": "'", "‚": ",", "“": '"', "”": '"',
    "–": "-", "—": "-", "…": "...", " ": " ", "→": "->", "•": "*", "−": "-", "\t": " "
  };

  const norm = s =>
    String(s == null ? "" : s)
      .replace(/[‘’‚“”–—… →•−\t]/g, c => MAP[c])
      .replace(/[\r\n]+/g, " ")
      .replace(/[^\x20-\x7e\xa0-\xff]/g, "?");

  const esc = s => s.replace(/[\\()]/g, "\\$&");

  const width = (s, sz, b) => {
    let t = 0;
    for (const c of s) {
      t += (W[c.charCodeAt(0) - 32] || 556) * sz / 1000;
    }
    return t * (b ? 1.07 : 1);
  };

  const wrap = (s, sz, b, max) => {
    const out = [];
    let line = "";
    for (let w of s.split(" ")) {
      if (!w) continue;
      while (width(w, sz, b) > max) {
        let k = 1;
        while (k < w.length && width(w.slice(0, k + 1), sz, b) <= max) k++;
        if (line) {
          out.push(line);
          line = "";
        }
        out.push(w.slice(0, k));
        w = w.slice(k);
      }
      const t = line ? line + " " + w : w;
      if (width(t, sz, b) <= max) line = t;
      else {
        if (line) out.push(line);
        line = w;
      }
    }
    if (line) out.push(line);
    return out.length ? out : [""];
  };

  let last = null;

  function build(o) {
    const PW = 595, PH = 842, M = 56, CW = PW - 2 * M, pages = [[]];
    let y = PH - M;

    const room = h => {
      if (y - h < M + 16) {
        pages.push([]);
        y = PH - M;
      }
    };

    const text = (s, sz, b, g, x = M, max = CW, lead = 1.38) => {
      wrap(norm(s), sz, b, max).forEach(l => {
        room(sz * lead);
        y -= sz * lead;
        pages[pages.length - 1].push({ t: l, x, y, sz, b, g });
      });
    };

    text(o.title, 18, true, 0);
    y -= 6;
    (o.meta || []).forEach(m => text(m, 9.5, false, 0.3, M, CW, 1.45));
    if (o.note) {
      y -= 4;
      text(o.note, 9, true, 0.45);
    }
    y -= 6;
    pages[pages.length - 1].push({ rule: 1, y });
    y -= 10;

    (o.passages || []).forEach(p => {
      room(40);
      text("[" + p.id + "]", 9, true, 0.35);
      text(p.text, 11, false, 0, M + 14, CW - 14, 1.45);
      y -= 8;
    });

    if (!(o.passages || []).length) {
      text("(This document has no passages.)", 11, false, 0.3);
    }

    const N = pages.length;
    const ft = norm(o.footer || "");
    last = { pages, PW, PH, M, N, ft };

    const streams = pages.map((ops, i) => {
      let s = "";
      ops.forEach(p => {
        if (p.rule) {
          s += "0.75 G 0.6 w " + M + " " + p.y.toFixed(1) + " m " + (PW - M) + " " + p.y.toFixed(1) + " l S\n";
        } else {
          s += p.g + " g BT /F" + (p.b ? 2 : 1) + " " + p.sz + " Tf " + p.x + " " + p.y.toFixed(1) + " Td (" + esc(p.t) + ") Tj ET\n";
        }
      });
      s += "0.45 g BT /F1 8 Tf " + M + " 30 Td (" + esc((ft + " - page " + (i + 1) + " of " + N).slice(0, 125)) + ") Tj ET\n";
      return s;
    });

    let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
    const offs = [];
    const obj = (n, b) => {
      offs[n] = out.length;
      out += n + " 0 obj\n" + b + "\nendobj\n";
    };

    const kids = pages.map((_, i) => (6 + 2 * i) + " 0 R").join(" ");
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, "<< /Type /Pages /Kids [" + kids + "] /Count " + N + " >>");
    obj(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    obj(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    obj(5, "<< /Title (" + esc(norm(o.title)) + ") /Producer (MUET Document Retrieval Engine) >>");

    streams.forEach((s, i) => {
      obj(6 + 2 * i, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + PW + " " + PH + "] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents " + (7 + 2 * i) + " 0 R >>");
      obj(7 + 2 * i, "<< /Length " + s.length + " >>\nstream\n" + s + "endstream");
    });

    const total = 6 + 2 * N;
    const xr = out.length;
    out += "xref\n0 " + total + "\n0000000000 65535 f \n";
    for (let n = 1; n < total; n++) {
      out += String(offs[n]).padStart(10, "0") + " 00000 n \n";
    }
    out += "trailer\n<< /Size " + total + " /Root 1 0 R /Info 5 0 R >>\nstartxref\n" + xr + "\n%%EOF\n";

    const u = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) {
      u[i] = out.charCodeAt(i) & 255;
    }
    return u.buffer;
  }

  return {
    build,
    W,
    get last() {
      return last;
    }
  };
})();

function genPdf(d, passages) {
  const docPassages = (passages || S.pass || [])
    .filter(p => p.doc === d.id)
    .sort((a, b) => a.n - b.n)
    .map(p => ({ id: p.id, text: p.text }));

  return PDFW.build({
    title: d.title,
    meta: [
      "Document ID: " + d.id + "   |   Category: " + d.category,
      "Version: " + (d.version == null ? "unknown" : d.version) + "   |   Date: " + (d.date || "no date"),
      "Source: " + d.source,
      "Live source URL: " + (d.url || "none - synthetic test document, not published on any website")
    ],
    note: d.note || "",
    passages: docPassages,
    footer: d.id + " - " + d.title + " | MUET Document Retrieval Engine (educational project)"
  });
}

async function savePdf(d, buf) {
  const old = await DB.get("pdfs", d.id);
  let data, origin;
  if (buf) {
    data = buf;
    origin = "uploaded";
  } else if (old && old.origin === "uploaded") {
    return old;
  } else {
    data = genPdf(d);
    origin = "generated";
  }
  const rec = {
    id: d.id,
    data,
    origin,
    size: data.byteLength,
    updated: new Date().toISOString()
  };
  await DB.put("pdfs", rec);
  return rec;
}

function pdfBox() {
  const b = document.createElement("div");
  b.setAttribute("aria-label", "PDF pages");
  b.style.cssText = "height:62vh;overflow:auto;background:#5e6873;border:1px solid var(--line);border-radius:10px;padding:14px;text-align:center";
  return b;
}

function pdfSheet(w, h, dpr, n, total) {
  const wrap = document.createElement("div");
  const c = document.createElement("canvas");
  wrap.style.cssText = "margin:0 auto 14px;width:" + w + "px;max-width:100%";
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  c.style.cssText = "display:block;width:" + w + "px;height:" + h + "px;max-width:100%;background:#fff;box-shadow:0 4px 16px rgba(0,0,0,.35);border-radius:2px";
  const cap = document.createElement("div");
  cap.className = "meta";
  cap.textContent = "Page " + n + " of " + total;
  cap.style.color = "#e6ebef";
  cap.style.margin = "6px 0 0";
  wrap.append(c, cap);
  return { wrap, c };
}

function showGenerated(d, host) {
  genPdf(d);
  const L = PDFW.last;
  const box = pdfBox();
  host.replaceChildren(box);

  const cw = Math.max(280, Math.min(794, box.clientWidth - 28));
  const sc = cw / L.PW;
  const dpr = window.devicePixelRatio || 1;
  const ch = Math.round(L.PH * sc);

  L.pages.forEach((ops, i) => {
    const { wrap, c } = pdfSheet(cw, ch, dpr, i + 1, L.N);
    const g = c.getContext("2d");
    g.scale(dpr * sc, dpr * sc);
    g.fillStyle = "#fff";
    g.fillRect(0, 0, L.PW, L.PH);
    g.textBaseline = "alphabetic";

    const gray = v => {
      const k = Math.round(v * 255);
      return "rgb(" + k + "," + k + "," + k + ")";
    };

    ops.forEach(p => {
      if (p.rule) {
        g.strokeStyle = gray(0.75);
        g.lineWidth = 0.6;
        g.beginPath();
        g.moveTo(L.M, L.PH - p.y);
        g.lineTo(L.PW - L.M, L.PH - p.y);
        g.stroke();
      } else {
        g.fillStyle = gray(p.g);
        g.font = (p.b ? "bold " : "") + p.sz + "px Helvetica,Arial,'Liberation Sans',sans-serif";
        g.fillText(p.t, p.x, L.PH - p.y);
      }
    });

    g.fillStyle = gray(0.45);
    g.font = "8px Helvetica,Arial,'Liberation Sans',sans-serif";
    g.fillText((L.ft + " - page " + (i + 1) + " of " + L.N).slice(0, 125), L.M, L.PH - 30);
    box.append(wrap);
  });
  return true;
}

const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJSW = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

async function showUploaded(buf, host) {
  if (!window.pdfjsLib) {
    await new Promise((ok, no) => {
      const s = document.createElement("script");
      const t = setTimeout(() => no(new Error("PDF.js load timeout")), 10000);
      s.src = PDFJS;
      s.onload = () => {
        clearTimeout(t);
        ok();
      };
      s.onerror = () => {
        clearTimeout(t);
        no(new Error("pdf.js could not be loaded"));
      };
      document.head.append(s);
    });
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJSW;
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
  const box = pdfBox();
  host.replaceChildren(box);

  const cw = Math.max(280, Math.min(794, box.clientWidth - 28));
  const dpr = window.devicePixelRatio || 1;
  const N = Math.min(pdf.numPages, 150);

  for (let i = 1; i <= N; i++) {
    const pg = await pdf.getPage(i);
    const v1 = pg.getViewport({ scale: 1 });
    const sc = cw / v1.width;
    const v = pg.getViewport({ scale: sc * dpr });
    const { wrap, c } = pdfSheet(cw, Math.round(v1.height * sc), dpr, i, pdf.numPages);
    c.width = Math.round(v.width);
    c.height = Math.round(v.height);
    box.append(wrap);
    await pg.render({ canvasContext: c.getContext("2d"), viewport: v }).promise;
  }

  if (pdf.numPages > N) {
    const p = document.createElement("p");
    p.className = "meta";
    p.textContent = "Showing the first " + N + " of " + pdf.numPages + " pages - use Download PDF for the full file.";
    box.append(p);
  }
  return true;
}

/* The Ultraspeaker Flipbook Lab – pagine del PDF come immagini nitide, pronte da disegnare.
   Il PDF resta nel computer: nessun invio a server. */
(function () {
  "use strict";
  const MAX_PAGES = 120;
  const LONG = 1600;           // lato lungo della pagina in pixel: nitido anche in video 1080p
  let blobs = [];              // JPEG di ogni pagina
  let aspect = 0.7071;
  const cache = new Map();     // idx -> ImageBitmap (o HTMLImageElement)
  const loading = new Map();
  const CACHE_MAX = 14;
  let onReady = null;          // chiamata quando una pagina diventa disponibile

  function lib() {
    const p = window.pdfjsLib;
    if (p && !p.GlobalWorkerOptions.workerSrc) p.GlobalWorkerOptions.workerSrc = window.FB_PDF_WORKER || "vendor/pdf.worker.min.js";
    return p;
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const toBlob = (cv, q) => new Promise((r) => cv.toBlob(r, "image/jpeg", q));

  async function openPDF(data, onProgress) {
    const doc = await lib().getDocument({ data, isEvalSupported: false }).promise;
    const total = doc.numPages;
    if (!total) throw Object.assign(new Error("empty"), { code: "err.none" });
    const used = Math.min(total, MAX_PAGES);
    const first = await doc.getPage(1);
    const v1 = first.getViewport({ scale: 1 });
    const asp = v1.width / v1.height;
    const bw = asp >= 1 ? LONG : Math.round(LONG * asp), bh = asp >= 1 ? Math.round(LONG / asp) : LONG;
    const cv = document.createElement("canvas");
    cv.width = bw; cv.height = bh;
    const cx = cv.getContext("2d", { alpha: false });
    const out = [], lines = [];
    for (let i = 1; i <= used; i++) {
      onProgress && onProgress(i, used);
      const page = i === 1 ? first : await doc.getPage(i);
      const v = page.getViewport({ scale: 1 });
      const s = Math.min(bw / v.width, bh / v.height);
      const vp = page.getViewport({ scale: s });
      cx.setTransform(1, 0, 0, 1, 0, 0);
      cx.fillStyle = "#ffffff"; cx.fillRect(0, 0, bw, bh);
      const ox = Math.round((bw - vp.width) / 2), oy = Math.round((bh - vp.height) / 2);
      await page.render({ canvasContext: cx, viewport: vp, transform: [1, 0, 0, 1, ox, oy] }).promise;
      out.push(await toBlob(cv, 0.9));
      try { lines.push(await textLines(page, vp, ox, oy, bw, bh)); } catch (e) { lines.push([]); }
      page.cleanup();
      await tick();
    }
    try { doc.destroy(); } catch (e) { /* ignora */ }
    return { blobs: out, lines, aspect: asp, total, used };
  }

  /* Righe di testo della pagina (coordinate 0..1): servono ad agganciare la sottolineatura al rigo */
  async function textLines(page, vp, ox, oy, bw, bh) {
    const tc = await page.getTextContent();
    const items = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim() || !it.transform) continue;
      const [a, b, c, d, e, f] = it.transform;
      if (Math.abs(b) > 0.01 || Math.abs(c) > 0.01 || a <= 0) continue;     // solo testo orizzontale
      const [x0, y0] = vp.convertToViewportPoint(e, f);
      const [x1] = vp.convertToViewportPoint(e + it.width, f);
      const fh = Math.abs(d) * vp.scale;
      if (fh < 2 || x1 <= x0) continue;
      const u0 = (x0 + ox) / bw, u1 = (x1 + ox) / bw, vb = (y0 + oy) / bh, h = fh / bh;
      // confini approssimati delle parole, in proporzione ai caratteri
      const words = [], str = it.str, n = str.length;
      str.replace(/\S+/g, (w, i) => { words.push([u0 + (u1 - u0) * i / n, u0 + (u1 - u0) * (i + w.length) / n]); return w; });
      items.push({ u0, u1, vb, h, words });
    }
    items.sort((p, q) => p.vb - q.vb || p.u0 - q.u0);
    // righe: stessi pezzi sulla stessa linea di base, ma una colonna alla volta
    // (due pezzi separati da uno spazio grande sono in colonne diverse)
    // colonne: strisce verticali che nessuna riga attraversa (i "canali" tra le colonne)
    const BINS = 400, cov = new Uint16Array(BINS);
    let lo = 1, hi = 0;
    for (const it of items) {
      lo = Math.min(lo, it.u0); hi = Math.max(hi, it.u1);
      for (let b = Math.max(0, Math.floor(it.u0 * BINS)); b <= Math.min(BINS - 1, Math.floor(it.u1 * BINS)); b++) cov[b]++;
    }
    const maxc = Math.max(1, ...cov), gutters = [];
    for (let b = Math.ceil(lo * BINS) + 1, start = -1; b < Math.floor(hi * BINS); b++) {
      const empty = cov[b] <= maxc * 0.06;
      if (empty && start < 0) start = b;
      if ((!empty || b === Math.floor(hi * BINS) - 1) && start >= 0) {
        if ((b - start) / BINS >= 0.01) gutters.push([start / BINS, b / BINS]);
        start = -1;
      }
    }
    const splitBy = (a, b) => { const l = a.u1 < b.u0 ? a : b, r = l === a ? b : a; return gutters.some((g) => g[0] >= l.u1 - 0.002 && g[1] <= r.u0 + 0.002); };
    const out = [];
    for (const it of items) {
      const l = out.find((x) => Math.abs(x.vb - it.vb) < Math.max(x.h, it.h) * 0.35 && !splitBy(x, it) &&
        it.u0 - x.u1 < Math.max(x.h, it.h) * 4 && x.u0 - it.u1 < Math.max(x.h, it.h) * 4);
      if (l) { l.u0 = Math.min(l.u0, it.u0); l.u1 = Math.max(l.u1, it.u1); l.h = Math.max(l.h, it.h); l.words.push(...it.words); }
      else out.push({ vb: it.vb, h: it.h, u0: it.u0, u1: it.u1, words: it.words.slice() });
    }
    // piccoli rialzi (apici delle citazioni) agganciati alla riga vicina invece di formare righe proprie
    for (let i = out.length - 1; i >= 0; i--) {
      const a = out[i];
      const host = out.find((x) => x !== a && x.h > a.h * 1.25 && a.vb < x.vb && a.vb > x.vb - x.h && a.u0 >= x.u0 - x.h && a.u1 <= x.u1 + x.h * 3);
      if (host) { host.u0 = Math.min(host.u0, a.u0); host.u1 = Math.max(host.u1, a.u1); host.words.push(...a.words); out.splice(i, 1); }
    }
    out.forEach((l) => { l.words.sort((p, q) => p[0] - q[0]); l.vb = +l.vb.toFixed(5); });
    return out;
  }
  let lines = [];
  function setLines(l) { lines = l || []; }

  function set(list, asp) {
    cache.forEach((b) => { try { b.close && b.close(); } catch (e) { /* ignora */ } });
    cache.clear(); loading.clear();
    blobs = list; aspect = asp;
  }
  async function decode(blob) {
    if (window.createImageBitmap) { try { return await createImageBitmap(blob); } catch (e) { /* ripiego */ } }
    return await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(blob); });
  }
  function load(i) {
    if (i == null || i < 0 || i >= blobs.length) return Promise.resolve(null);
    if (cache.has(i)) { const b = cache.get(i); cache.delete(i); cache.set(i, b); return Promise.resolve(b); }
    if (loading.has(i)) return loading.get(i);
    const p = decode(blobs[i]).then((bm) => {
      loading.delete(i);
      cache.set(i, bm);
      while (cache.size > CACHE_MAX) {
        const k = cache.keys().next().value;
        const old = cache.get(k); cache.delete(k);
        try { old.close && old.close(); } catch (e) { /* ignora */ }
      }
      onReady && onReady(i);
      return bm;
    });
    loading.set(i, p);
    return p;
  }
  function get(i) { if (cache.has(i)) return cache.get(i); load(i); return null; }
  function ensure(list) { return Promise.all(list.filter((i) => i != null && i >= 0).map(load)); }

  window.FBPages = {
    MAX_PAGES, openPDF, set, get, load, ensure,
    get count() { return blobs.length; },
    get aspect() { return aspect; },
    get blobs() { return blobs; },
    get lines() { return lines; },
    setLines,
    linesOf(i) { return lines[i] || []; },
    set onReady(fn) { onReady = fn; },
  };
})();

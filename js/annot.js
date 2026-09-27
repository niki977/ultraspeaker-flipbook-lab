/* The Ultraspeaker Flipbook Lab – segni sulle pagine (evidenziatore, sottolineatura, penna, gomma).
   Coordinate normalizzate sulla pagina (u, v da 0 a 1) e tempi in millisecondi: così la registrazione
   può ridisegnare ogni segno esattamente come e quando è stato fatto.
   Evidenziatore e sottolineatura si agganciano al testo del PDF come una selezione: parola per parola,
   anche su più righe della stessa colonna. Fuori dal testo tornano a mano libera. */
(function () {
  "use strict";
  const HOLD = 2200, FADE = 700;          // i segni "che svaniscono": restano 2,2 s poi spariscono in 0,7 s
  const WIDTH = { hl: 0.034, ul: 0.0055, pen: 0.0042 };
  let strokes = [];
  let seq = 1;
  let linesOf = () => [];                 // righe di testo della pagina (da pages.js)

  /* ---------- Testo della pagina ---------- */
  // la riga "possiede" lo spazio dalla cima delle sue lettere fino alla cima della riga successiva:
  // così trascinando appena sotto il testo (dove va la sottolineatura) non si salta alla riga dopo
  function pickRow(rows, v) {
    let best = null;
    for (const l of rows) if (l.vb - l.h * 0.75 <= v) best = l;      // righe già in ordine dall'alto
    return best;
  }
  function lineAt(page, u, v) {
    const rows = linesOf(page).filter((l) => u >= l.u0 - 0.03 && u <= l.u1 + 0.03).sort((a, b) => a.vb - b.vb);
    let l = pickRow(rows, v);
    if (!l && rows.length && v >= rows[0].vb - rows[0].h * 1.4) l = rows[0];
    if (l && v > l.vb + l.h * 1.2) return null;                      // troppo sotto: fuori dal testo
    return l;
  }
  const overlap = (a, b) => Math.min(a.u1, b.u1) - Math.max(a.u0, b.u0);
  // righe della stessa colonna della riga di partenza, dall'alto in basso
  function column(page, l0) {
    return linesOf(page).filter((l) => overlap(l, l0) > Math.min(l.u1 - l.u0, l0.u1 - l0.u0) * 0.3 || l === l0).sort((a, b) => a.vb - b.vb);
  }
  function nearestWord(l, u) {
    let best = null, bd = Infinity;
    for (const w of l.words) {
      const d = u < w[0] ? w[0] - u : u > w[1] ? u - w[1] : 0;
      if (d < bd) { bd = d; best = w; }
    }
    return best || [l.u0, l.u1];
  }
  // come una selezione di testo: dalla parola di partenza alla parola d'arrivo
  function selection(s, u, v) {
    const a = s.anchor;
    const col = s.col;
    // riga d'arrivo nella stessa colonna
    const lb = pickRow(col, v) || col[0] || a.line;
    let A = { line: a.line, u: a.u }, B = { line: lb, u };
    if (B.line.vb < A.line.vb || (B.line === A.line && B.u < A.u)) { const x = A; A = B; B = x; }
    const segs = [];
    for (const l of col) {
      if (l.vb < A.line.vb - 1e-6 || l.vb > B.line.vb + 1e-6) continue;
      const s0 = l === A.line ? nearestWord(l, A.u)[0] : l.words.length ? l.words[0][0] : l.u0;
      const s1 = l === B.line ? nearestWord(l, B.u)[1] : l.words.length ? l.words[l.words.length - 1][1] : l.u1;
      if (s1 > s0) segs.push({ u0: s0, u1: s1, vb: l.vb, h: l.h });
    }
    return segs;
  }
  const sameSegs = (a, b) => a && b && a.length === b.length && a.every((x, i) => x.u0 === b[i].u0 && x.u1 === b[i].u1 && x.vb === b[i].vb);

  /* ---------- Creazione ---------- */
  function begin(page, tool, color, fade, u, v, t) {
    const s = { id: seq++, page, tool, color, fade: !!fade, pts: [{ u, v, t }], t0: t, t1: null, del: null };
    if (tool === "ul" || tool === "hl") {
      const l = lineAt(page, u, v);
      if (l) {
        s.anchor = { line: l, u };
        s.col = column(page, l);
        s.hist = [{ t, segs: selection(s, u, v) }];
      }
    }
    strokes.push(s);
    return s;
  }
  function add(s, u, v, t) {
    if (s.hist) {
      const segs = selection(s, u, v);
      if (!sameSegs(segs, s.hist[s.hist.length - 1].segs)) s.hist.push({ t, segs });
      return;
    }
    if (s.tool === "ul") {
      // PDF senza testo (per esempio una scansione): linea dritta, raddrizzata se quasi orizzontale
      const a = s.pts[0];
      const ang = Math.atan2(v - a.v, u - a.u);
      s.pts[1] = { u, v: Math.abs(Math.sin(ang)) < 0.14 ? a.v : v, t };
    } else {
      const l = s.pts[s.pts.length - 1];
      if (Math.hypot(u - l.u, v - l.v) < 0.0015) return;
      s.pts.push({ u, v, t });
    }
  }
  function end(s, t) {
    s.t1 = t;
    if (s.hist) {
      s.segs = s.hist[s.hist.length - 1].segs;     // un clic su una parola la segna tutta
      if (!s.segs.length) s.del = t;
    } else if (s.tool === "ul" && s.pts.length < 2) s.del = t;
    delete s.anchor; delete s.col;
  }

  /* ---------- Disegno ---------- */
  function alphaAt(s, T) {
    if (!s.fade) return 1;
    if (s.t1 == null || T < s.t1) return 1;
    const age = T - s.t1;
    if (age <= HOLD) return 1;
    return Math.max(0, 1 - (age - HOLD) / FADE);
  }
  function visible(s, T) {
    if (T === Infinity) return !s.fade && s.del == null;   // video automatico: solo i segni che restano
    return s.t0 <= T && (s.del == null || s.del > T) && alphaAt(s, T) > 0;
  }
  function segsAt(s, T) {
    if (!s.hist) return s.segs || null;
    if (T === Infinity || s.t1 != null && T >= s.t1) return s.segs || s.hist[s.hist.length - 1].segs;
    let cur = s.hist[0].segs;
    for (const h of s.hist) { if (h.t <= T) cur = h.segs; else break; }
    return cur;
  }
  // solo la frazione k della lunghezza (per i segni che si disegnano da soli)
  function partialSegs(segs, k) {
    if (k >= 1) return segs;
    const tot = segs.reduce((a, x) => a + (x.u1 - x.u0), 0);
    let left = tot * k;
    const out = [];
    for (const x of segs) {
      const w = x.u1 - x.u0;
      if (left <= 0) break;
      out.push(left >= w ? x : { ...x, u1: x.u0 + left });
      left -= w;
    }
    return out;
  }
  function partial(pts, k) {
    if (k >= 1 || pts.length < 2) return pts;
    let tot = 0;
    const seg = [];
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i].u - pts[i - 1].u, pts[i].v - pts[i - 1].v); seg.push(d); tot += d; }
    let left = tot * k;
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      if (left >= seg[i - 1]) { out.push(pts[i]); left -= seg[i - 1]; continue; }
      const f = seg[i - 1] ? left / seg[i - 1] : 0;
      out.push({ u: pts[i - 1].u + (pts[i].u - pts[i - 1].u) * f, v: pts[i - 1].v + (pts[i].v - pts[i - 1].v) * f, t: pts[i].t });
      break;
    }
    return out;
  }

  function drawSegs(ctx, s, segs, x, y, w, h, a) {
    ctx.save();
    ctx.fillStyle = s.color;
    ctx.beginPath();
    for (const g of segs) {
      if (s.tool === "hl") {
        // fascia che copre la riga: dalla cima delle lettere a poco sotto la linea di base
        const top = g.vb - g.h * 0.92, bot = g.vb + g.h * 0.24, ext = g.h * 0.12;
        ctx.rect(x + (g.u0 - ext * 0.3) * w, y + top * h, (g.u1 - g.u0 + ext * 0.6) * w, (bot - top) * h);
      } else {
        const th = Math.max(WIDTH.ul, g.h * 0.075), yy = g.vb + g.h * 0.2;
        ctx.rect(x + g.u0 * w, y + (yy - th / 2) * h, (g.u1 - g.u0) * w, th * h);
      }
    }
    if (s.tool === "hl") { ctx.globalAlpha = 0.42 * a; ctx.globalCompositeOperation = "multiply"; }
    else ctx.globalAlpha = a;
    ctx.fill("nonzero");
    ctx.restore();
  }

  function draw(ctx, page, x, y, w, h, T, reveal) {
    for (const s of strokes) {
      if (s.page !== page || !visible(s, T)) continue;
      const k = reveal ? reveal(s) : 1;
      if (k <= 0) continue;
      const a = T === Infinity ? 1 : alphaAt(s, T);
      const segs = segsAt(s, T);
      if (segs) { if (segs.length) drawSegs(ctx, s, partialSegs(segs, k), x, y, w, h, a); continue; }
      let pts = T === Infinity ? s.pts : s.pts.filter((p) => p.t <= T);
      pts = partial(pts, k);
      if (!pts.length) continue;
      ctx.save();
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.strokeStyle = s.color;
      ctx.lineWidth = WIDTH[s.tool] * h;
      if (s.tool === "hl") { ctx.globalAlpha = 0.4 * a; ctx.globalCompositeOperation = "multiply"; ctx.lineCap = "butt"; }
      else ctx.globalAlpha = a;
      if (s.tool === "ul") ctx.lineCap = "butt";
      ctx.beginPath();
      const X = (p) => x + p.u * w, Y = (p) => y + p.v * h;
      if (s.tool === "ul") {
        const b = pts[pts.length - 1];
        ctx.moveTo(X(pts[0]), Y(pts[0])); ctx.lineTo(X(b) + (pts.length < 2 ? 0.01 : 0), Y(b));
      } else if (pts.length < 3) {
        ctx.moveTo(X(pts[0]), Y(pts[0]));
        const b = pts[pts.length - 1]; ctx.lineTo(X(b) + 0.01, Y(b));
      } else {
        ctx.moveTo(X(pts[0]), Y(pts[0]));
        for (let i = 1; i < pts.length - 1; i++) {
          const mx = (X(pts[i]) + X(pts[i + 1])) / 2, my = (Y(pts[i]) + Y(pts[i + 1])) / 2;
          ctx.quadraticCurveTo(X(pts[i]), Y(pts[i]), mx, my);
        }
        const b = pts[pts.length - 1]; ctx.lineTo(X(b), Y(b));
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  /* ---------- Gomma e pulizia ---------- */
  function eraseAt(page, u, v, aspect, t) {
    let hit = false;
    const r = 0.018;
    for (const s of strokes) {
      if (s.page !== page || s.del != null || !visible(s, t)) continue;
      const segs = segsAt(s, t);
      if (segs) {
        if (segs.some((g) => u >= g.u0 - r && u <= g.u1 + r && v >= g.vb - g.h * 1.1 - r && v <= g.vb + g.h * 0.4 + r)) { s.del = t; hit = true; }
        continue;
      }
      const tol = r + WIDTH[s.tool] / 2;
      const pts = s.pts;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[i + 1] || a;
        const ax = a.u * aspect, ay = a.v, bx = b.u * aspect, by = b.v, px = u * aspect, py = v;
        const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
        const k = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
        if (Math.hypot(px - (ax + dx * k), py - (ay + dy * k)) < tol) { s.del = t; hit = true; break; }
      }
    }
    return hit;
  }
  function clearPage(page, t) { let n = 0; for (const s of strokes) if (s.page === page && s.del == null) { s.del = t; n++; } return n; }
  function hasFading(T) { return strokes.some((s) => s.fade && s.t1 != null && alphaAt(s, T) > 0 && s.del == null); }
  function prune(keepFrom) {
    strokes = strokes.filter((s) => {
      if (s.del != null && s.del < keepFrom) return false;
      if (s.fade && s.t1 != null && s.t1 + HOLD + FADE < keepFrom) return false;
      return true;
    });
  }
  const topOf = (s) => (s.segs && s.segs.length ? { v: s.segs[0].vb, u: s.segs[0].u0 } : { v: s.pts[0].v, u: s.pts[0].u });
  // i segni che restano, in ordine di lettura (pagina, poi colonna da sinistra, poi dall'alto in basso)
  function keepList(pages) {
    const set = pages ? new Set(pages) : null;
    return strokes.filter((s) => !s.fade && s.del == null && s.t1 != null && (!set || set.has(s.page)))
      .sort((p, q) => {
        if (p.page !== q.page) return p.page - q.page;
        const a = topOf(p), b = topOf(q);
        const colA = a.u < 0.5 ? 0 : 1, colB = b.u < 0.5 ? 0 : 1;
        return colA - colB || (Math.round(a.v * 60) - Math.round(b.v * 60)) || a.u - b.u;
      });
  }
  // lunghezza del segno (per decidere quanto dura il disegno nel video automatico)
  function length(s, aspect) {
    if (s.segs) return s.segs.reduce((a, g) => a + (g.u1 - g.u0) * aspect, 0);
    let L = 0;
    for (let i = 1; i < s.pts.length; i++) L += Math.hypot((s.pts[i].u - s.pts[i - 1].u) * aspect, s.pts[i].v - s.pts[i - 1].v);
    return L;
  }
  const r4 = (x) => +x.toFixed(4);
  function exportKeep() {
    return keepList().map((s) => ({
      page: s.page, tool: s.tool, color: s.color,
      pts: s.pts.map((p) => [r4(p.u), r4(p.v)]),
      segs: s.segs ? s.segs.map((g) => [r4(g.u0), r4(g.u1), r4(g.vb), r4(g.h)]) : undefined,
    }));
  }
  function importKeep(list) {
    strokes = (list || []).map((s) => ({
      id: seq++, page: s.page, tool: s.tool, color: s.color, fade: false,
      pts: s.pts.map((p) => ({ u: p[0], v: p[1], t: 0 })),
      segs: s.segs ? s.segs.map((g) => ({ u0: g[0], u1: g[1], vb: g[2], h: g[3] })) : undefined,
      t0: 0, t1: 0, del: null,
    }));
  }
  function reset() { strokes = []; }

  window.FBAnnot = {
    begin, add, end, draw, eraseAt, clearPage, hasFading, prune, keepList, length, exportKeep, importKeep, reset, HOLD, FADE,
    set lineSource(fn) { linesOf = fn; },
  };
})();

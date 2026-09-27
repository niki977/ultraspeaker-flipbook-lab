/* The Ultraspeaker Flipbook Lab – motore del libro disegnato su canvas.
   Tutto è in coordinate "palco" 1920×1080: lo stesso disegno serve per lo schermo e per il video. */
(function () {
  "use strict";
  const SW = 1920, SH = 1080;
  const PAPER = -2;                       // retro bianco del foglio (vista a pagina singola)

  /* ---------- Viste (coppie di pagine) ---------- */
  function buildViews(n, layout, cover) {
    const v = [];
    if (!n) return v;
    if (layout === "single") { for (let i = 0; i < n; i++) v.push([null, i]); return v; }
    let i = 0;
    if (cover) { v.push([null, 0]); i = 1; }
    for (; i < n; i += 2) v.push([i, i + 1 < n ? i + 1 : null]);
    return v;
  }

  /* ---------- Misure del libro sul palco ---------- */
  function geometry(aspect, layout, zoom) {
    const z = zoom || 1;
    const single = layout === "single";
    const maxH = SH * 0.84 * z, maxW = SW * (single ? 0.5 : 0.9) * z;
    let H = Math.min(maxH, maxW / (single ? aspect : aspect * 2));
    const W = H * aspect;
    return { W, H, S: SW / 2, y0: (SH - H) / 2, single };
  }
  // spostamento orizzontale perché la parte visibile resti centrata
  function offsetFor(view, g) {
    if (!view) return 0;
    if (g.single) return -g.W / 2;
    if (view[0] == null && view[1] != null) return -g.W / 2;
    if (view[1] == null && view[0] != null) return g.W / 2;
    return 0;
  }

  /* ---------- Geometria della piega ---------- */
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const len = (a) => Math.hypot(a.x, a.y);
  const dot = (a, b) => a.x * b.x + a.y * b.y;

  function corners(g, corner) {
    const bottom = corner !== "top";
    const C = { x: g.S + g.W, y: bottom ? g.y0 + g.H : g.y0 };
    const A = { x: g.S, y: bottom ? g.y0 + g.H : g.y0 };        // dorso, stesso lato
    const A2 = { x: g.S, y: bottom ? g.y0 : g.y0 + g.H };       // dorso, lato opposto
    return { C, A, A2, T: { x: g.S - g.W, y: C.y } };
  }
  // il foglio non può staccarsi dal dorso
  function constrain(P, g, corner) {
    const { A, A2 } = corners(g, corner);
    let d = sub(P, A), l = len(d);
    if (l > g.W) P = { x: A.x + d.x / l * g.W, y: A.y + d.y / l * g.W };
    const diag = Math.hypot(g.W, g.H);
    d = sub(P, A2); l = len(d);
    if (l > diag) P = { x: A2.x + d.x / l * diag, y: A2.y + d.y / l * diag };
    return P;
  }
  // taglia un poligono con il semipiano dot(q-M,n) <= 0 (keep=true) oppure > 0
  function clipPoly(poly, M, n, keep) {
    const out = [];
    const f = (q) => dot(sub(q, M), n) * (keep ? -1 : 1);
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const fa = f(a), fb = f(b);
      if (fa >= 0) out.push(a);
      if ((fa >= 0) !== (fb >= 0)) {
        const t = fa / (fa - fb);
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    return out;
  }
  function pathPoly(ctx, poly) {
    ctx.beginPath();
    poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
  }

  /* ---------- Disegno ---------- */
  /* opts: {pageCount, aspect, layout, cover, drawPage(ctx, idx, x, y, w, h), bg (null = trasparente), shadow} */
  function render(ctx, st, o) {
    const g = geometry(o.aspect, o.layout, o.zoom);
    const views = buildViews(o.pageCount, o.layout, o.cover);
    ctx.save();
    if (o.bg) { ctx.fillStyle = o.bg; ctx.fillRect(0, 0, SW, SH); } else ctx.clearRect(0, 0, SW, SH);
    if (o.bgImage) {
      // immagine di sfondo che riempie il palco (ritagliata, senza deformarla)
      const im = o.bgImage, iw = im.width || im.naturalWidth, ih = im.height || im.naturalHeight;
      const k = Math.max(SW / iw, SH / ih);
      ctx.drawImage(im, (SW - iw * k) / 2, (SH - ih * k) / 2, iw * k, ih * k);
    }
    if (!views.length) { ctx.restore(); return; }
    // zoom: la "telecamera" guarda il punto (x, y) con ingrandimento z
    const cam = o.cam;
    if (cam && (cam.z !== 1 || cam.x !== SW / 2 || cam.y !== SH / 2)) {
      ctx.translate(SW / 2, SH / 2); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y);
    }
    const vi = Math.max(0, Math.min(views.length - 1, st.view));
    const cur = views[vi];
    const f = st.flip;
    const target = f ? views[f.to != null ? f.to : vi + f.dir] : null;   // f.to: salto diretto (es. richiudere il libro)

    // spostamento del libro, interpolato durante il giro
    let prog = 0;
    if (f && target) {
      const { C } = corners(g, f.corner);
      // f.P è sempre espresso "in avanti" (per i giri all'indietro è già specchiato sul dorso)
      prog = Math.max(0, Math.min(1, (C.x - f.P.x) / (2 * g.W)));
    }
    const ox = offsetFor(cur, g) * (1 - prog) + (target ? offsetFor(target, g) : offsetFor(cur, g)) * prog;
    ctx.translate(ox, 0);

    const L = { x: g.S - g.W, y: g.y0, w: g.W, h: g.H };
    const R = { x: g.S, y: g.y0, w: g.W, h: g.H };
    const page = (idx, rect, mirror) => {
      if (idx == null) return;
      ctx.save();
      if (mirror) { ctx.translate(rect.x * 2 + rect.w, 0); ctx.scale(-1, 1); }
      if (idx === PAPER) { ctx.fillStyle = "#f4f4f2"; ctx.fillRect(rect.x, rect.y, rect.w, rect.h); }
      else o.drawPage(ctx, idx, rect.x, rect.y, rect.w, rect.h);
      ctx.restore();
    };
    const bookShadow = (rects) => {
      if (o.shadow === false) return;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = g.H * 0.035; ctx.shadowOffsetY = g.H * 0.012;
      ctx.fillStyle = "#ffffff";
      rects.forEach((r) => ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2));
      ctx.restore();
    };
    const gutter = (hasL, hasR) => {
      if (g.single || !(hasL || hasR)) return;
      const w = g.W * 0.07;
      if (hasL) {
        const gr = ctx.createLinearGradient(g.S - w, 0, g.S, 0);
        gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,.16)");
        ctx.fillStyle = gr; ctx.fillRect(g.S - w, g.y0, w, g.H);
      }
      if (hasR) {
        const gr = ctx.createLinearGradient(g.S, 0, g.S + w, 0);
        gr.addColorStop(0, "rgba(0,0,0,.14)"); gr.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gr; ctx.fillRect(g.S, g.y0, w, g.H);
      }
    };

    if (!f || !target) {
      const rs = [];
      if (cur[0] != null) rs.push(L);
      if (cur[1] != null) rs.push(R);
      bookShadow(rs);
      page(cur[0], L); page(cur[1], R);
      gutter(cur[0] != null, cur[1] != null);
      ctx.restore();
      return;
    }

    // pagine coinvolte, sempre ragionando "in avanti" (i giri all'indietro sono speculari)
    let staticL, under, front, back;
    if (f.dir > 0) {
      staticL = cur[0]; front = cur[1]; under = target[1];
      back = g.single ? PAPER : target[0];
    } else {
      staticL = cur[1]; front = g.single ? PAPER : cur[0]; under = target[0];
      back = target[1];
      if (g.single) under = null;       // a sinistra, fuori pagina, non c'è niente sotto
    }
    const mir = f.dir < 0;
    if (mir) { ctx.translate(2 * g.S, 0); ctx.scale(-1, 1); }

    const { C } = corners(g, f.corner);
    const P = constrain(f.P, g, f.corner);
    const d = sub(C, P), dl = len(d);
    const shadowRects = [];
    if (staticL != null) shadowRects.push(L);
    if (under != null) shadowRects.push(R);
    bookShadow(shadowRects);
    page(staticL, L, mir);
    page(under, R, mir);
    if (dl < 0.5) { page(front, R, mir); gutter(staticL != null, true); ctx.restore(); return; }

    const n = { x: d.x / dl, y: d.y / dl };
    const M = { x: (C.x + P.x) / 2, y: (C.y + P.y) / 2 };
    const rect = [{ x: R.x, y: R.y }, { x: R.x + R.w, y: R.y }, { x: R.x + R.w, y: R.y + R.h }, { x: R.x, y: R.y + R.h }];
    const kept = clipPoly(rect, M, n, true);
    const folded = clipPoly(rect, M, n, false);
    const refl = (q) => { const k = 2 * dot(sub(q, M), n); return { x: q.x - k * n.x, y: q.y - k * n.y }; };
    const foldedR = folded.map(refl);
    const sd = Math.min(g.W * 0.35, dl * 0.5);

    // ombra portata sulla pagina scoperta
    if (folded.length > 2) {
      ctx.save(); pathPoly(ctx, folded); ctx.clip();
      const gr = ctx.createLinearGradient(M.x, M.y, M.x + n.x * sd, M.y + n.y * sd);
      gr.addColorStop(0, "rgba(0,0,0,.38)"); gr.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gr; ctx.fillRect(R.x - 10, R.y - 10, R.w + 20, R.h + 20);
      ctx.restore();
    }
    gutter(staticL != null, false);
    // parte ancora piatta del foglio
    // vista singola: il retro bianco compare/sparisce dolcemente fuori pagina
    const paperA = !g.single ? 1 : f.dir > 0 ? Math.min(1, (1 - prog) / 0.3) : Math.min(1, prog / 0.3);
    if (kept.length > 2) {
      ctx.save(); pathPoly(ctx, kept); ctx.clip();
      if (front === PAPER) ctx.globalAlpha = paperA;
      page(front, R, mir);
      // leggera ombra vicino alla piega sul fronte
      const gr = ctx.createLinearGradient(M.x, M.y, M.x - n.x * sd * 0.5, M.y - n.y * sd * 0.5);
      gr.addColorStop(0, "rgba(0,0,0,.10)"); gr.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gr; ctx.fillRect(R.x, R.y, R.w, R.h);
      ctx.restore();
    }
    // retro del foglio, riflesso lungo la piega
    if (foldedR.length > 2) {
      ctx.save();
      if (back === PAPER) ctx.globalAlpha = paperA;
      if (o.shadow !== false) {
        ctx.shadowColor = "rgba(0,0,0,.30)"; ctx.shadowBlur = g.H * 0.03;
        ctx.fillStyle = "#ffffff"; pathPoly(ctx, foldedR); ctx.fill();
        ctx.shadowColor = "transparent";
      }
      pathPoly(ctx, foldedR); ctx.clip();
      ctx.save();
      // R ∘ (specchio sul dorso): una rotazione, quindi l'immagine resta dritta
      const T = (x, y) => refl({ x: 2 * g.S - x, y });
      const o0 = T(0, 0), ex = sub(T(1, 0), o0), ey = sub(T(0, 1), o0);
      ctx.transform(ex.x, ex.y, ey.x, ey.y, o0.x, o0.y);
      page(back, L, mir);
      ctx.restore();
      const gr = ctx.createLinearGradient(M.x, M.y, M.x - n.x * sd, M.y - n.y * sd);
      gr.addColorStop(0, "rgba(0,0,0,.20)"); gr.addColorStop(0.12, "rgba(255,255,255,.18)");
      gr.addColorStop(0.45, "rgba(0,0,0,.06)"); gr.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gr; ctx.fillRect(-SW, -SH, SW * 4, SH * 4);
      ctx.restore();
    }
    ctx.restore();
  }

  /* ---------- Traiettoria di un giro completo ---------- */
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function flipPath(g, corner, P0, t, complete) {
    const { C, T } = corners(g, corner);
    const e = ease(Math.max(0, Math.min(1, t)));
    const to = complete ? T : C;
    const lift = complete ? g.H * 0.16 * Math.sin(Math.PI * e) * (corner === "top" ? -1 : 1) : 0;
    return { x: P0.x + (to.x - P0.x) * e, y: P0.y + (to.y - P0.y) * e - lift };
  }

  /* posizione di un punto del palco su una pagina: {idx, u, v} (u,v in 0..1) */
  function hitPage(pt, st, o) {
    const g = geometry(o.aspect, o.layout, o.zoom);
    const views = buildViews(o.pageCount, o.layout, o.cover);
    const cur = views[st.view];
    if (!cur) return null;
    const x = pt.x - offsetFor(cur, g);
    if (pt.y < g.y0 || pt.y > g.y0 + g.H) return null;
    if (x >= g.S && x <= g.S + g.W && cur[1] != null) return { idx: cur[1], u: (x - g.S) / g.W, v: (pt.y - g.y0) / g.H, side: 1 };
    if (x >= g.S - g.W && x < g.S && cur[0] != null) return { idx: cur[0], u: (x - g.S + g.W) / g.W, v: (pt.y - g.y0) / g.H, side: 0 };
    return null;
  }

  /* spostamento orizzontale in questo istante (serve per leggere il puntatore) */
  function offsetNow(st, o) {
    const g = geometry(o.aspect, o.layout, o.zoom);
    const views = buildViews(o.pageCount, o.layout, o.cover);
    const cur = views[st.view];
    const f = st.flip, target = f ? views[f.to != null ? f.to : st.view + f.dir] : null;
    if (!f || !target) return offsetFor(cur, g);
    const { C } = corners(g, f.corner);
    const prog = Math.max(0, Math.min(1, (C.x - f.P.x) / (2 * g.W)));
    return offsetFor(cur, g) * (1 - prog) + offsetFor(target, g) * prog;
  }

  /* telecamera: dal punto sullo schermo (palco) al punto nel mondo del libro, e ritorno */
  function toWorld(p, cam) { if (!cam) return p; return { x: (p.x - SW / 2) / cam.z + cam.x, y: (p.y - SH / 2) / cam.z + cam.y }; }
  function clampCam(cam) {
    const z = Math.max(1, Math.min(5, cam.z));
    const hw = SW / 2 / z, hh = SH / 2 / z;
    return { z, x: Math.max(hw, Math.min(SW - hw, cam.x)), y: Math.max(hh, Math.min(SH - hh, cam.y)) };
  }

  window.FBEngine = { SW, SH, PAPER, buildViews, geometry, offsetFor, corners, constrain, render, flipPath, hitPage, ease, offsetNow, toWorld, clampCam };
})();

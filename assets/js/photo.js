/*
 * The Ultraspeaker Check Lab — photo.js
 * Testo su foto: legge nel browser la parte dell'immagine sotto il testo e misura il contrasto
 * nel punto peggiore (non la media), anche con una banda scura o chiara dietro il testo.
 * Disegna una piccola anteprima della slide con il riquadro del testo e il punto peggiore.
 * Le immagini che il browser non apre (HEIC, EMF, TIFF su alcuni sistemi) restano «da controllare a occhio».
 */
(function (g) {
  'use strict';
  var CL = g.CheckLab = g.CheckLab || {};
  var THUMBS = 12; // anteprime tenute per ogni controllo

  async function measure(zip, res, opts) {
    var C = CL.color;
    if (!res.texts || typeof g.createImageBitmap !== 'function' || !g.document) return;
    var amb = C.LIGHT[opts.light] || C.LIGHT.penombra, todo = res.texts.filter(function (t) { return t.color && t.behind && t.behind.kind === 'image' && t.behind.over; });
    var byPath = {}, thumbs = 0;
    todo.forEach(function (t) { (byPath[t.behind.over.path] = byPath[t.behind.over.path] || []).push(t); });
    var paths = Object.keys(byPath);
    for (var i = 0; i < paths.length; i++) {
      if (opts.token && opts.token.cancelled) throw new Error('cancelled');
      opts.onProgress('contrast', 0.5 + 0.5 * i / paths.length);
      var file = zip.file(paths[i]), bmp = null;
      try { if (file) bmp = await g.createImageBitmap(new Blob([await file.async('uint8array')])); } catch (e) { bmp = null; }
      byPath[paths[i]].forEach(function (t) {
        if (!bmp) { t.photo = { unmeasured: true }; return; }
        try { t.photo = sample(bmp, t, res, amb, thumbs < THUMBS); if (t.photo.thumb) thumbs++; } catch (e) { t.photo = { unmeasured: true }; }
      });
      if (bmp && bmp.close) bmp.close();
    }
  }

  function sample(bmp, t, res, amb, withThumb) {
    var C = CL.color, P = t.behind.over.rect, cr = t.behind.over.crop || {}, T = t.rect;
    var l = Math.max(0, cr.l || 0), tp = Math.max(0, cr.t || 0), vw = 1 - l - Math.max(0, cr.r || 0), vh = 1 - tp - Math.max(0, cr.b || 0);
    var x0 = Math.max(T.x, P.x), y0 = Math.max(T.y, P.y), x1 = Math.min(T.x + T.w, P.x + P.w), y1 = Math.min(T.y + T.h, P.y + P.h);
    if (x1 <= x0 || y1 <= y0 || vw <= 0 || vh <= 0) return { unmeasured: true };
    // L'intersezione, nei pixel dell'immagine
    var W = bmp.width, H = bmp.height;
    var sx = (l + (x0 - P.x) / P.w * vw) * W, sy = (tp + (y0 - P.y) / P.h * vh) * H, sw = (x1 - x0) / P.w * vw * W, sh = (y1 - y0) / P.h * vh * H;
    var cw = Math.max(8, Math.min(160, Math.round(sw))), ch = Math.max(4, Math.min(120, Math.round(cw * sh / sw)));
    var cv = g.document.createElement('canvas'); cv.width = cw; cv.height = ch;
    var cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(bmp, sx, sy, sw, sh, 0, 0, cw, ch);
    var px = cx.getImageData(0, 0, cw, ch).data, fg = C.lum(t.color), lightText = fg > 0.4;
    // Luminanze sotto il testo (e con una banda nera al 60%, o bianca per il testo scuro): il report calcola il contrasto
    // con la luce della sala scelta in quel momento, così cambiare la luce non richiede una nuova lettura
    var lums = [], band = [], worst = { r: Infinity, k: 0 };
    for (var i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) continue;                               // trasparente: si vede la slide
      var c = [px[i], px[i + 1], px[i + 2]], L = C.lumRgb(c), r = C.ratioL(fg, L, amb);
      lums.push(L);
      band.push(C.lumRgb(c.map(function (v) { return v * 0.4 + (lightText ? 0 : 255) * 0.6; })));
      if (r < worst.r) worst = { r: r, k: i / 4 };
    }
    if (!lums.length) return { unmeasured: true };
    var step = Math.max(1, Math.floor(lums.length / 400)), keep = function (a) { return a.filter(function (v, j) { return j % step === 0; }); };
    var out = { lums: keep(lums), band: keep(band), bandDark: lightText };
    var wx = x0 + ((worst.k % cw) + 0.5) / cw * (x1 - x0), wy = y0 + (Math.floor(worst.k / cw) + 0.5) / ch * (y1 - y0);
    if (withThumb) out.thumb = thumb(bmp, t, res, P, { l: l, t: tp, vw: vw, vh: vh }, wx, wy);
    return out;
  }

  /* La slide larga 320 px: l'immagine, il riquadro del testo (tratteggiato) e il punto peggiore (cerchio) */
  function thumb(bmp, t, res, P, cr, wx, wy) {
    var w = 320, s = w / res.slideW, h = Math.round(res.slideH * s);
    var cv = g.document.createElement('canvas'); cv.width = w; cv.height = h;
    var c = cv.getContext('2d');
    c.fillStyle = '#1B1B1B'; c.fillRect(0, 0, w, h);
    c.drawImage(bmp, cr.l * bmp.width, cr.t * bmp.height, cr.vw * bmp.width, cr.vh * bmp.height, P.x * s, P.y * s, P.w * s, P.h * s);
    c.setLineDash([5, 4]); c.lineWidth = 2; c.strokeStyle = '#FFD23F';
    c.strokeRect(t.rect.x * s, t.rect.y * s, t.rect.w * s, t.rect.h * s);
    c.setLineDash([]); c.strokeStyle = '#FF5A5A'; c.lineWidth = 2.5;
    c.beginPath(); c.arc(wx * s, wy * s, 7, 0, 2 * Math.PI); c.stroke();
    return cv.toDataURL('image/jpeg', 0.82);
  }

  CL.photo = { measure: measure };
})(window);

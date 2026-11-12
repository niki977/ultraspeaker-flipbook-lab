/*
 * The Ultraspeaker Check Lab — color.js
 * Calcoli di colore e leggibilità comuni a scheda Stile, report e modello:
 *  - rapporto di contrasto (WCAG 2) tra testo e sfondo, anche proiettato in una sala illuminata
 *  - il colore leggibile più vicino, i colori di testo migliori per uno sfondo
 *  - simulazione della deuteranopia (Viénot 1999), per anteprime e grafici
 *  - grandezza minima del testo per l'ultima fila (AVIXA DISCAS: altezza ≥ distanza / 200)
 */
(function (g) {
  'use strict';
  var CL = g.CheckLab = g.CheckLab || {};

  /* Luce in sala: quota del bianco del proiettore che la luce ambiente aggiunge a ogni punto dell'immagine (stima) */
  var LIGHT = { buio: 0.01, penombra: 0.05, accese: 0.12 };
  /* Ultima fila, in altezze dello schermo */
  var ROWS = { aula: 4, sala: 6, plenaria: 8 };

  function hex(v) {
    var m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(v || '').trim());
    if (!m) return null;
    var h = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
    return '#' + h.toUpperCase();
  }
  function rgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function toHex(c) { return '#' + c.map(function (v) { return ('0' + Math.round(Math.max(0, Math.min(255, v))).toString(16)).slice(-2); }).join('').toUpperCase(); }
  function lin(c) { c = c / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function enc(v) { v = Math.max(0, Math.min(1, v)); return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055); }
  function lumRgb(c) { return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]); }
  function lum(h) { return lumRgb(rgb(h)); }
  /* Contrasto tra due luminanze relative; amb = luce della sala aggiunta all'immagine proiettata */
  function ratioL(a, b, amb) {
    amb = amb || 0;
    var x = amb + (1 - amb) * a, y = amb + (1 - amb) * b;
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function ratio(fg, bg, amb) { return ratioL(lum(fg), lum(bg), amb); }

  function hsl(h) {
    var c = rgb(h).map(function (v) { return v / 255; }), mx = Math.max.apply(null, c), mn = Math.min.apply(null, c), l = (mx + mn) / 2, hue = 0, s = 0, d = mx - mn;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      hue = mx === c[0] ? ((c[1] - c[2]) / d) % 6 : (mx === c[1] ? (c[2] - c[0]) / d + 2 : (c[0] - c[1]) / d + 4);
      hue *= 60; if (hue < 0) hue += 360;
    }
    return [hue, s, l];
  }
  function fromHsl(hue, s, l) {
    hue = ((hue % 360) + 360) % 360;
    var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((hue / 60) % 2 - 1)), m = l - c / 2, k = Math.floor(hue / 60) % 6;
    var p = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][k];
    return toHex(p.map(function (v) { return (v + m) * 255; }));
  }

  /* Il colore della stessa tinta più vicino che raggiunge `need`, allontanandosi dallo sfondo; null se non c'è */
  function fix(fg, bg, need, amb) {
    var h = hsl(fg), darker = lum(bg) > 0.18;
    for (var i = 1; i <= 100; i++) {
      var c = fromHsl(h[0], h[1], darker ? h[2] * (1 - i / 100) : h[2] + (1 - h[2]) * i / 100);
      if (ratio(c, bg, amb) >= need * 1.05) return c;
    }
    return null;
  }

  /* I colori di testo migliori per uno sfondo: il neutro più forte, poi la stessa tinta, la complementare e una tinta vicina,
     ognuno il più colorato possibile restando leggibile; prima quelli che si leggono in sala, poi quelli che chiedono luci basse */
  function bestText(bg, amb, count) {
    var hb = hsl(bg), grey = hb[1] < 0.12;
    var light = ratio('#FFFFFF', bg, amb) >= ratio('#000000', bg, amb);
    function tone(hue, lt, a) {
      for (var i = 0; i <= 60; i++) {
        var c = fromHsl(hue, 0.7, lt ? 0.55 + i * 0.0075 : 0.45 - i * 0.0075);
        if (ratio(c, bg, a) >= 4.5 * 1.1) return c;
      }
      return null;
    }
    var hues = grey ? [[40, 'warm'], [205, 'cold'], [150, 'teal']] : [[hb[0], 'same'], [hb[0] + 180, 'complement'], [hb[0] + 35, 'near'], [hb[0] - 35, 'near']];
    function build(lt, a) {
      return [[lt ? '#FFFFFF' : '#000000', lt ? 'white' : 'black']]
        .concat(hues.map(function (x) { return [tone(x[0], lt, a), x[1]]; }), [[lt ? '#F5F1E6' : '#1F1F1F', lt ? 'ivory' : 'graphite']]);
    }
    function far(a, b) { var p = rgb(a), q = rgb(b); return Math.pow(p[0] - q[0], 2) + Math.pow(p[1] - q[1], 2) + Math.pow(p[2] - q[2], 2) > 1600; }
    var out = [];
    build(light, amb).concat(build(light, 0), build(!light, 0)).forEach(function (x) {
      if (!x[0] || out.length >= (count || 4)) return;
      var r = ratio(x[0], bg, 0);
      if (r >= 4.5 && out.every(function (o) { return far(o.color, x[0]); })) out.push({ color: x[0], kind: x[1], ratio: r, room: ratio(x[0], bg, amb) });
    });
    return out.sort(function (a, b) { return (b.room >= 4.5) - (a.room >= 4.5); });
  }

  /* Deuteranopia (Viénot 1999), in RGB lineare */
  function deutan(h) {
    var c = rgb(h).map(lin), r = 0.29275 * c[0] + 0.70725 * c[1];
    return toHex([enc(r), enc(r), enc(-0.02234 * c[0] + 0.02234 * c[1] + c[2])]);
  }
  /* Differenza di colore CIE76 (Lab, D65) */
  function lab(h) {
    var c = rgb(h).map(lin);
    var x = (0.4124 * c[0] + 0.3576 * c[1] + 0.1805 * c[2]) / 0.95047, y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], z = (0.0193 * c[0] + 0.1192 * c[1] + 0.9505 * c[2]) / 1.08883;
    function f(t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; }
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
  }
  function deltaE(a, b) { var p = lab(a), q = lab(b); return Math.sqrt(Math.pow(p[0] - q[0], 2) + Math.pow(p[1] - q[1], 2) + Math.pow(p[2] - q[2], 2)); }

  /* Grandezza minima (nelle unità della slide) del testo letto dall'ultima fila:
     altezza delle minuscole ≥ distanza / 200. rows = ultima fila in altezze dell'immagine; xh = altezza x / em;
     slideH = altezza della slide nelle unità del font (punti in PowerPoint, pixel in Keynote);
     la slide riempie l'altezza dello schermo solo se non è più larga dello schermo. */
  function minSize(rows, xh, slideH, slideRatio, roomRatio) {
    var fill = roomRatio && slideRatio ? Math.min(1, roomRatio / slideRatio) : 1;
    return rows * slideH / (200 * (xh || 0.5) * fill);
  }
  /* Ultima fila dalle impostazioni del talk: un tipo di sala, o altezza dello schermo e distanza dell'ultima fila (metri) */
  function rows(settings) {
    var h = parseFloat(String(settings.scrH).replace(',', '.')), d = parseFloat(String(settings.rowD).replace(',', '.'));
    if (settings.rows === 'misure') return h > 0 && d > 0 ? d / h : ROWS.sala;
    return ROWS[settings.rows] || ROWS.sala;
  }

  CL.color = { LIGHT: LIGHT, ROWS: ROWS, hex: hex, rgb: rgb, toHex: toHex, lum: lum, lumRgb: lumRgb, ratio: ratio, ratioL: ratioL, hsl: hsl, fromHsl: fromHsl,
    fix: fix, bestText: bestText, deutan: deutan, deltaE: deltaE, minSize: minSize, rows: rows };
})(window);

/*
 * The Ultraspeaker Check Lab — stile.js
 * Scheda Stile: sfondo, colore del testo e font da scegliere prima di creare le slide.
 * Versione semplice: il riquadro con contrasto e font e i colori di testo migliori per lo sfondo.
 * Versione completa, su richiesta: evidenziazione, luce in sala, anteprima per chi distingue male
 * rosso e verde, slide di prova, grandezza minima per l'ultima fila e modello PowerPoint.
 * Le scelte restano sul dispositivo. Il file di un font si può caricare per l'anteprima: resta nella pagina.
 */
(function (g) {
  'use strict';
  var CL = g.CheckLab;
  var FONTS = ['Aptos', 'Calibri', 'Arial', 'Verdana', 'Georgia', 'Trebuchet MS'];
  var FMT = { ppt169: [540, 16 / 9], ppt43: [540, 4 / 3], key169: [1080, 16 / 9], key43: [768, 4 / 3] };
  var ROOM = { '16:9': 16 / 9, '16:10': 1.6, '4:3': 4 / 3, '3:1': 3 };

  CL.Stile = function (ctx) {
    var C = CL.color, t = ctx.t, h = ctx.h, settings = ctx.settings;
    var ST = { pro: false, cb: false, fmt: 'ppt169', local: null, localState: '', filter: '', typed: '', checked: null, status: '', uploaded: null, upError: false };
    var canListFonts = typeof g.queryLocalFonts === 'function';
    function style() {
      if (!settings.style) settings.style = { bg: '#000000', fg: '#FFFFFF', accent: '#FFCF80', font: 'Aptos', custom: '', used: false };
      return settings.style;
    }
    function touch() { style().used = true; ctx.saveAll(); if (ctx.reevaluate) ctx.reevaluate(); }
    function fontName() { var s = style(); return s.font === 'altro' ? (s.custom || '') : s.font; }
    function stack(name) { return name ? "'" + name.replace(/['"]/g, '') + "', " + (name === 'Georgia' ? 'serif' : "'Segoe UI', Arial, sans-serif") : 'sans-serif'; }
    function fmt(r) { return r.toFixed(1).replace('.', ',') + ' : 1'; }

    /* Un font è installato? Si disegna un testo con lui e con un font di riserva: se la larghezza cambia, c'è */
    var hasCache = {}, xhCache = {};
    function hasFont(name) {
      if (name in hasCache) return hasCache[name];
      var c = g.document.createElement('canvas').getContext('2d'), s = 'mmmmmmmmmmlliWW 0123';
      return (hasCache[name] = ['monospace', 'serif', 'sans-serif'].some(function (b) {
        c.font = '72px ' + b; var w0 = c.measureText(s).width;
        c.font = '72px "' + name.replace(/"/g, '') + '", ' + b; return c.measureText(s).width !== w0;
      }));
    }
    /* Altezza delle minuscole del font: misurata se è installato, altrimenti il valore di riferimento */
    function xHeight(name) {
      if (name in xhCache) return xhCache[name];
      var v = 0, measured = false;
      if (name && hasFont(name)) {
        var c = g.document.createElement('canvas').getContext('2d');
        c.font = '200px "' + name.replace(/"/g, '') + '"';
        var m = c.measureText('x');
        if (m.actualBoundingBoxAscent) { v = m.actualBoundingBoxAscent / 200; measured = true; }
      }
      return (xhCache[name] = { xh: v || CL.fonts.xHeight(name) || 0.5, measured: measured });
    }
    function amb() { return C.LIGHT[settings.light] === undefined ? C.LIGHT.penombra : C.LIGHT[settings.light]; }

    /* ---------- versione semplice ---------- */
    function card() {
      var s = style(), r = C.ratio(s.fg, s.bg, 0), room = C.ratio(s.fg, s.bg, amb());
      var verdict = r >= 7 ? 'great' : (r >= 4.5 ? 'good' : (r >= 3 ? 'large' : 'poor'));
      var pills = [['st.p.text', r >= 4.5], ['st.p.titles', r >= 3], ['st.p.room', room >= 4.5]].map(function (p) {
        return '<span class="st-pill' + (p[1] ? '' : ' no') + '" style="border-color:' + s.fg + '">' + (p[1] ? '✓ ' : '✗ ') + h(t(p[0], { light: t('light.' + (settings.light || 'penombra')) })) + '</span>';
      }).join('');
      return '<div class="st-card" style="background:' + s.bg + ';color:' + s.fg + '">' +
        '<div class="st-cardrow"><div class="st-aa" style="border-color:' + s.fg + ';font-family:' + h(stack(fontName())) + '">Aa</div>' +
        '<div class="st-score"><button class="st-ratiobtn" data-st="info" aria-haspopup="dialog" aria-label="' + h(t('st.info.open')) + '"><strong class="st-ratio">' + r.toFixed(2).replace('.', ',') + '</strong><span class="st-one"> : 1</span><span class="st-i" aria-hidden="true">i</span></button>' +
        '<span class="st-verdict">' + h(t('st.v.' + verdict)) + '</span></div></div><div class="st-pills">' + pills + '</div></div>';
    }
    function colourField(key, label, codeLabel) {
      var s = style();
      return '<label class="cl-label st-field">' + h(t(label)) + '<span class="st-colour"><input type="color" data-st-col="' + key + '" value="' + s[key].toLowerCase() + '" aria-label="' + h(t(label)) + '">' +
        '<input class="st-hex" data-st-hex="' + key + '" id="st-hex-' + key + '" value="' + h(s[key]) + '" aria-label="' + h(t(codeLabel)) + '" spellcheck="false" autocomplete="off"></span></label>';
    }
    function fontSelect() {
      var s = style();
      return '<label class="cl-label st-field">' + h(t('st.font')) + '<select class="us-field cl-select" data-st-font>' + FONTS.concat(['altro']).map(function (f) {
        return '<option value="' + f + '"' + (s.font === f ? ' selected' : '') + '>' + h(f === 'altro' ? t('st.font.otherOpt') : f) + '</option>';
      }).join('') + '</select></label>';
    }
    function fontNote() {
      var s = style(), name = fontName(), cls = name ? CL.fonts.classify(name) : '';
      if (s.font !== 'altro') return '<p class="st-note ok">' + h(t('st.font.std', { font: s.font })) + '</p>';
      if (!name) return '<p class="st-note warn">' + h(t('st.font.pick')) + '</p>';
      return '<p class="st-note ' + (cls === 'office' ? 'ok' : 'warn') + '">' + h(t(cls === 'office' ? 'st.font.std' : 'st.font.other', { font: name })) + '</p>';
    }
    function otherFont() {
      if (style().font !== 'altro') return '';
      var out = '<div class="us-panel st-other"><span class="us-label">' + h(t('st.of.title')) + '</span>';
      if (canListFonts && ST.localState !== 'denied') {
        if (!ST.local) out += '<button class="us-btn us-btn--primary" data-st="listFonts">' + h(t('st.of.local')) + '</button><span class="cl-muted">' + h(t('st.of.localNote')) + '</span>';
        else {
          var q = ST.filter.toLowerCase(), shown = ST.local.filter(function (f) { return !q || f.toLowerCase().indexOf(q) >= 0; }).slice(0, 60);
          out += '<span class="cl-muted">' + h(t('st.of.found', { count: ST.local.length })) + '</span>' +
            '<input class="us-field" id="st-filter" data-st-filter value="' + h(ST.filter) + '" placeholder="' + h(t('st.of.search')) + '" aria-label="' + h(t('st.of.search')) + '">' +
            '<div class="st-fontlist" id="st-fontlist">' + fontList(shown) + '</div>';
        }
      } else {
        out += (ST.localState === 'denied' ? '<span class="st-note warn">' + h(t('st.of.denied')) + '</span>' : '') +
          '<label class="cl-label" for="st-typed">' + h(t('st.of.typeLabel')) + '</label><div class="cl-addrow"><input class="us-field" id="st-typed" data-st-typed value="' + h(ST.typed) + '" placeholder="Avenir Next">' +
          '<button class="us-btn us-btn--primary" data-st="verify">' + h(t('st.of.verify')) + '</button></div><span class="cl-muted">' + h(t('st.of.typeHint')) + '</span>' +
          (ST.checked === true ? '<span class="st-note ok">' + h(t('st.of.ok', { font: style().custom })) + '</span>' : '') +
          (ST.checked === false ? '<span class="st-note crit">' + h(t('st.of.no')) + '</span>' : '');
      }
      return out + upload() + '</div>';
    }
    /* Un font che non è su questo computer: il suo file, letto solo qui, per l'anteprima e l'altezza delle minuscole */
    function upload() {
      var name = style().custom || ST.typed.trim();
      return '<div class="st-upload"><span class="us-label">' + h(t('st.up.title')) + '</span>' +
        '<label class="us-btn" style="align-self:flex-start">' + h(t('st.up.btn')) + '<input type="file" class="us-sr" data-st-upload accept=".ttf,.otf,.woff,.woff2"></label>' +
        '<span class="cl-muted">' + h(t('st.up.hint')) + '</span>' +
        (ST.uploaded ? '<span class="st-note ok">' + h(t('st.up.ok', ST.uploaded)) + ' ' + h(t('st.up.session')) + '</span>' : '') +
        (ST.upError ? '<span class="st-note crit">' + h(t('st.up.err')) + '</span>' : '') +
        '<span class="st-note warn">' + h(t('st.up.license')) + '</span>' +
        '<span class="cl-muted">' + h(t('st.up.find')) + ' <button class="cl-link" data-st-find="dafont">Dafont</button> · <button class="cl-link" data-st-find="google">Google Fonts</button></span>' +
        '<span class="cl-muted">' + h(t(name ? 'st.up.findNote' : 'st.up.findNone')) + '</span></div>';
    }
    /* Nome della famiglia dalla tabella 'name' del font (TrueType/OpenType e WOFF); WOFF2 e file illeggibili: il nome del file */
    async function familyOf(buf, fileName) {
      var b = new DataView(buf), tag = function (o) { return String.fromCharCode(b.getUint8(o), b.getUint8(o + 1), b.getUint8(o + 2), b.getUint8(o + 3)); };
      var guess = fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
      async function nameTable() {
        var sig = tag(0);
        if (sig === 'wOFF') {
          for (var i = 0, n = b.getUint16(12); i < n; i++) {
            var e = 44 + i * 20;
            if (tag(e) !== 'name') continue;
            var off = b.getUint32(e + 4), comp = b.getUint32(e + 8), orig = b.getUint32(e + 12), raw = buf.slice(off, off + comp);
            if (comp === orig) return new DataView(raw);
            if (!g.DecompressionStream) return null;
            return new DataView(await new Response(new Blob([raw]).stream().pipeThrough(new g.DecompressionStream('deflate'))).arrayBuffer());
          }
          return null;
        }
        if (sig !== 'OTTO' && b.getUint32(0) !== 0x00010000 && sig !== 'true') return null;
        for (var j = 0, m = b.getUint16(4); j < m; j++) {
          var r = 12 + j * 16;
          if (tag(r) === 'name') return new DataView(buf, b.getUint32(r + 8), b.getUint32(r + 12));
        }
        return null;
      }
      try {
        var nt = await nameTable();
        if (!nt) return guess;
        var count = nt.getUint16(2), base = nt.getUint16(4), found = {};
        for (var k = 0; k < count; k++) {
          var o = 6 + k * 12, plat = nt.getUint16(o), id = nt.getUint16(o + 6), len = nt.getUint16(o + 8), at = base + nt.getUint16(o + 10), str = '';
          if ((id !== 1 && id !== 16) || found[id]) continue;
          if (plat === 3 || plat === 0) for (var c = 0; c + 1 < len; c += 2) str += String.fromCharCode(nt.getUint16(at + c));
          else if (plat === 1) for (var d = 0; d < len; d++) str += String.fromCharCode(nt.getUint8(at + d));
          if (str.trim()) found[id] = str.trim();
        }
        return found[1] || found[16] || guess;   // il nome 1 è quello che PowerPoint mostra nel menu dei font
      } catch (e) { return guess; }
    }
    async function loadFont(file) {
      ST.upError = false;
      try {
        var buf = await file.arrayBuffer(), family = await familyOf(buf, file.name);
        var face = new g.FontFace(family, buf);
        await face.load(); g.document.fonts.add(face);
        hasCache[family] = true; delete xhCache[family];
        var s = style(); s.font = 'altro'; s.custom = family; ST.typed = family; ST.checked = null;
        ST.uploaded = { font: family, file: file.name };
        touch();
      } catch (e) { ST.upError = true; }
      ctx.render();
    }
    /* Cosa vuol dire il rapporto di contrasto, con le soglie usate dal Lab */
    function info() {
      var s = style(), r = C.ratio(s.fg, s.bg, 0), room = C.ratio(s.fg, s.bg, amb()), old = g.document.getElementById('st-info');
      if (old) old.remove();
      var rows = [['1', '3', 'st.info.r1', 'crit'], ['3', '4,5', 'st.info.r2', 'warn'], ['4,5', '7', 'st.info.r3', 'ok'], ['7', '21', 'st.info.r4', 'ok']].map(function (x) {
        return '<tr><td><span class="cl-badge ' + x[3] + '">' + h(t('st.info.range', { a: x[0], b: x[1] })) + '</span></td><td>' + h(t(x[2])) + '</td></tr>';
      }).join('');
      var box = g.document.createElement('div');
      box.id = 'st-info'; box.className = 'cl-modal';
      box.innerHTML = '<div class="cl-modal-box" role="dialog" aria-modal="true" aria-labelledby="st-info-t"><h2 class="cl-h2" id="st-info-t">' + h(t('st.info.title')) + '</h2>' +
        '<p>' + h(t('st.info.what')) + '</p><table class="st-infotab">' + rows + '</table>' +
        '<p>' + h(t('st.info.now', { ratio: fmt(r), light: t('light.' + (settings.light || 'penombra')), room: fmt(room) })) + '</p>' +
        '<p class="cl-muted">' + h(t('st.info.room')) + '</p><p class="cl-muted">' + h(t('st.info.src')) + '</p>' +
        '<button class="us-btn us-btn--primary" data-close style="align-self:flex-end">' + h(t('st.info.close')) + '</button></div>';
      var back = g.document.activeElement;
      function close() { box.remove(); g.document.removeEventListener('keydown', key); if (back && back.focus) back.focus(); }
      function key(e) { if (e.key === 'Escape') close(); }
      box.addEventListener('click', function (e) { if (e.target === box || e.target.closest('[data-close]')) close(); });
      g.document.addEventListener('keydown', key);
      g.document.body.appendChild(box);
      box.querySelector('[data-close]').focus();
    }
    function fontList(names) {
      return names.map(function (f) {
        var cls = CL.fonts.classify(f), on = style().custom === f;
        return '<button class="st-fontrow' + (on ? ' on' : '') + '" data-st-pick="' + h(f) + '"><span style="font-family:' + h(stack(f)) + '">' + h(f) + '</span><span class="cl-muted">' + h(t('rep.font.' + cls)) + '</span></button>';
      }).join('');
    }
    function best() {
      var s = style(), list = C.bestText(s.bg, amb(), 4);
      if (!list.length) return '<p class="st-note crit">' + h(t('st.best.none')) + '</p>';
      return '<div class="st-best">' + list.map(function (x) {
        var on = x.color === C.hex(s.fg);
        return '<button class="st-bestbtn' + (on ? ' on' : '') + '" data-st-use="' + x.color + '" aria-label="' + h(t('st.best.useAria', { color: x.color })) + '">' +
          '<span class="st-chip" style="background:' + s.bg + ';color:' + x.color + ';font-family:' + h(stack(fontName())) + '">Aa</span>' +
          '<span class="st-bestinfo"><span class="cl-muted">' + h(t('st.k.' + x.kind)) + '</span><code>' + x.color + '</code><span class="cl-muted">' + fmt(x.ratio) + ' · ' + h(t(x.room >= 4.5 ? 'st.best.room' : 'st.best.low')) + '</span>' +
          '<strong>' + h(t(on ? 'st.best.inUse' : 'st.best.use')) + '</strong></span></button>';
      }).join('') + '</div>';
    }

    /* ---------- versione completa ---------- */
    function sizes() {
      var f = FMT[ST.fmt], name = fontName() || 'Aptos', xm = xHeight(name), roomR = ROOM[settings.room] || 0;
      var min = C.minSize(C.rows(settings), xm.xh, f[0], f[1], roomR), up = function (v) { return Math.ceil(v / 2) * 2; };
      return { caption: up(min), text: up(min * 1.25), title: up(min * 1.6), xh: xm.xh, measured: xm.measured, letterbox: roomR && roomR / f[1] < 0.999, name: name };
    }
    function sizeBlock() {
      var z = sizes(), k = C.rows(settings);
      var boxes = [['st.z.title', z.title, 'st.z.more'], ['st.z.text', z.text, 'st.z.margin'], ['st.z.caption', z.caption, 'st.z.never']].map(function (b) {
        return '<div class="st-size"><span class="cl-muted">' + h(t(b[0])) + '</span><strong>' + b[1] + ' pt</strong><span class="cl-muted">' + h(t(b[2])) + '</span></div>';
      }).join('');
      return '<div class="st-sizes">' + boxes + '</div><p class="cl-muted">' + h(t('st.size.why', { font: z.name, pct: Math.round(z.xh * 100), measured: z.measured ? t('st.size.measured') : '' })) + '</p>' +
        (/^key/.test(ST.fmt) ? '<p class="st-note warn">' + h(t('st.size.keynote', { h: FMT[ST.fmt][0] })) + '</p>' : '') +
        (z.letterbox ? '<p class="st-note warn">' + h(t('st.size.letterbox')) + '</p>' : '') +
        (settings.rows === 'misure' ? '<p class="cl-muted">' + h(k && parseFloat(settings.scrH) > 0 && parseFloat(settings.rowD) > 0 ? t('st.m.note', { k: k.toFixed(1).replace('.', ',') }) : t('st.m.missing')) + '</p>' : '');
    }
    function rows() {
      var s = style(), a = amb(), fgDone = false;
      return [['title', 'fg', 3], ['text', 'fg', 4.5], ['caption', 'fg', 4.5], ['accent', 'accent', 3]].map(function (d) {
        var c = s[d[1]], scr = C.ratio(c, s.bg, 0), room = C.ratio(c, s.bg, a);
        var sev = room >= d[2] * 1.15 ? 'ok' : (room >= d[2] ? 'warn' : 'crit');
        // titoli, testo e didascalie hanno lo stesso colore: la correzione si propone una volta, valida per tutti e tre
        var offer = sev !== 'ok' && !(d[1] === 'fg' && fgDone), fixed = offer ? C.fix(c, s.bg, d[1] === 'fg' ? 4.5 : d[2], a) : null;
        if (offer && d[1] === 'fg') fgDone = true;
        return '<div class="st-row"><span><strong>' + h(t('st.r.' + d[0])) + '</strong><br><span class="cl-muted">' + h(t('st.n.' + d[0])) + '</span></span>' +
          '<span>' + fmt(scr) + '</span><strong>' + fmt(room) + '</strong><span class="st-result"><span class="cl-badge ' + sev + '">' + h(t('st.res.' + sev)) + '</span>' +
          (fixed ? '<button class="us-btn us-btn--primary" data-st-fix="' + d[1] + ':' + fixed + '">' + h(t('st.fix', { color: fixed })) + '</button>' : '') +
          (offer && !fixed ? '<span class="st-note crit">' + h(t('st.nofix')) + '</span>' : '') + '</span></div>';
      }).join('');
    }
    function preview() {
      var s = style(), a = amb(), sim = function (c) { return ST.cb ? C.deutan(c) : c; };
      var bg = sim(s.bg), fg = sim(s.fg), ac = sim(s.accent), veil = 'linear-gradient(rgba(255,255,255,' + (a * 1.6).toFixed(3) + '),rgba(255,255,255,' + (a * 1.6).toFixed(3) + '))';
      return '<div class="st-slide" style="background-color:' + bg + ';background-image:' + veil + ';color:' + fg + ';font-family:' + h(stack(fontName())) + '">' +
        '<div class="st-s-title">' + h(t('st.s.title')) + '</div><div class="st-s-body"><div>• ' + h(t('st.s.b1')) + '</div><div>• ' + h(t('st.s.b2')) + '</div><div>• ' + h(t('st.s.b3')) + '</div></div>' +
        '<div class="st-s-photo"><span>' + h(t('st.s.photo')) + '</span><i style="border-top-color:' + ac + '"></i></div>' +
        '<div class="st-s-chart"><i style="height:45%;background:' + ac + '"></i><i style="height:70%;background:' + ac + '"></i><i style="height:85%;background:' + fg + ';opacity:.55"></i><i style="height:100%;background:' + ac + '"></i></div>' +
        '<div class="st-s-caption">' + h(t('st.s.caption')) + '</div></div>' +
        '<p class="cl-muted">' + h(t('st.preview.note')) + (ST.cb ? ' ' + h(t('st.cbNote')) : '') + '</p>';
    }
    function pro() {
      var lights = ['buio', 'penombra', 'accese'].map(function (k) {
        return '<button class="us-btn st-seg' + ((settings.light || 'penombra') === k ? ' on' : '') + '" data-st-light="' + k + '" aria-pressed="' + ((settings.light || 'penombra') === k) + '">' + h(t('light.' + k)) + '</button>';
      }).join('');
      var rowsBtns = ['aula', 'sala', 'plenaria', 'misure'].map(function (k) {
        var on = settings.rows === k;
        return '<button class="us-btn st-seg st-two' + (on ? ' on' : '') + '" data-st-rows="' + k + '" aria-pressed="' + on + '"><strong>' + h(t('st.rows.' + k)) + '</strong><span>' + h(t('st.rows.' + k + 'Sub')) + '</span></button>';
      }).join('');
      var opt = function (key, values, prefix, cur) { return '<select class="us-field cl-select" ' + key + '>' + values.map(function (v) { return '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + h(t(prefix + v)) + '</option>'; }).join('') + '</select>'; };
      return '<section class="cl-panel st-pro">' +
        '<div class="cl-panel" style="gap:10px">' + colourField('accent', 'st.accent', 'st.accentCode') + '<span class="cl-muted">' + h(t('st.accentHint')) + '</span></div>' +
        '<div class="cl-panel" style="gap:8px"><span class="us-label">' + h(t('st.light')) + '</span><div class="st-segs">' + lights + '</div><span class="cl-muted">' + h(t('st.lightNote')) + '</span></div>' +
        '<label class="us-panel st-check"><input type="checkbox" data-st-cb' + (ST.cb ? ' checked' : '') + '><span>' + h(t('st.cb')) + '</span></label>' +
        '<div id="st-preview">' + preview() + '</div>' +
        '<div class="us-panel st-table"><div class="st-row st-head"><span>' + h(t('st.t.el')) + '</span><span>' + h(t('st.t.screen')) + '</span><span>' + h(t('light.' + (settings.light || 'penombra'))) + '</span><span>' + h(t('st.t.result')) + '</span></div><div id="st-rows">' + rows() + '</div></div>' +
        '<div class="us-panel cl-panel" style="gap:14px"><div><span class="us-label">' + h(t('st.size.title')) + '</span><br><span class="cl-muted">' + h(t('st.size.lead')) + '</span></div>' +
        '<div class="cl-grid2" style="margin-top:0">' + ctx.field('st.size.format', opt('data-st-fmt', Object.keys(FMT), 'st.fmt.', ST.fmt)) + ctx.field('st.size.room', opt('data-st-room', ['16:9', '16:10', '4:3', '3:1', 'unknown'], 'room.', settings.room)) + '</div>' +
        '<div class="cl-panel" style="gap:6px"><span class="cl-muted">' + h(t('st.size.rows')) + '</span><div class="st-segs four">' + rowsBtns + '</div></div>' +
        (settings.rows === 'misure' ? '<div class="cl-grid2" style="margin-top:0">' + ctx.field('set.scrH', '<input class="us-field" type="number" min="0.5" step="0.1" id="st-scrH" data-st-m="scrH" value="' + h(settings.scrH) + '">') +
          ctx.field('set.rowD', '<input class="us-field" type="number" min="1" step="0.5" id="st-rowD" data-st-m="rowD" value="' + h(settings.rowD) + '">') + '</div>' : '') +
        '<div id="st-sizes">' + sizeBlock() + '</div></div>' +
        '<div class="cl-actions"><button class="us-btn us-btn--primary" data-st="template">' + h(t('st.make')) + '</button><button class="us-btn" data-st="codes">' + h(t('st.copy')) + '</button></div>' +
        (ST.status ? '<p class="st-note ok" role="status">' + h(ST.status) + '</p>' : '') +
        '<div class="us-panel cl-panel" style="gap:6px"><span class="cl-muted"><strong>PowerPoint:</strong> ' + h(t('st.ppt')) + '</span><span class="cl-muted"><strong>Keynote:</strong> ' + h(t('st.key')) + '</span><span class="cl-muted">' + h(t('st.ref')) + '</span></div>' +
        '</section>';
    }

    function render() {
      return '<section class="cl-panel" style="gap:6px"><h1 class="us-title">' + h(t('st.title')) + '</h1><p class="cl-muted" style="font-size:15px;margin:0">' + h(t('st.lead')) + '</p></section>' +
        '<section class="cl-panel st-quick" aria-label="' + h(t('st.quick')) + '"><div id="st-card">' + card() + '</div>' +
        '<div class="st-controls">' + colourField('bg', 'st.bg', 'st.bgCode') + '<button class="st-swap" data-st="swap" aria-label="' + h(t('st.swap')) + '">⇄</button>' + colourField('fg', 'st.fg', 'st.fgCode') + fontSelect() + '</div>' +
        otherFont() + '<div id="st-fontnote">' + fontNote() + '</div>' +
        '<div class="cl-panel" style="gap:8px"><span class="us-label">' + h(t('st.best.title')) + '</span><span class="cl-muted">' + h(t('st.best.hint')) + '</span><div id="st-best">' + best() + '</div></div>' +
        '<button class="us-btn st-toggle" data-st="pro" aria-expanded="' + ST.pro + '">' + h(t(ST.pro ? 'st.less' : 'st.more')) + ' <span aria-hidden="true">' + (ST.pro ? '▴' : '▾') + '</span></button></section>' +
        (ST.pro ? pro() : '');
    }

    /* Aggiorna ciò che mostra il risultato senza toccare i campi (il selettore di colore resta aperto mentre si trascina) */
    function refresh(skip) {
      var $ = function (id) { return g.document.getElementById(id); }, s = style();
      [['st-card', card], ['st-fontnote', fontNote], ['st-best', best], ['st-preview', preview], ['st-rows', rows], ['st-sizes', sizeBlock]].forEach(function (p) { if ($(p[0])) $(p[0]).innerHTML = p[1](); });
      ['bg', 'fg', 'accent'].forEach(function (k) {
        var hx = $('st-hex-' + k), col = g.document.querySelector('[data-st-col="' + k + '"]');
        if (hx && hx !== skip) hx.value = s[k];
        if (col && col !== skip) col.value = s[k].toLowerCase();
      });
    }
    function set(k, v) { var c = C.hex(v); if (!c) return false; style()[k] = c; touch(); return true; }

    async function listFonts() {
      try {
        var all = await g.queryLocalFonts(), seen = {};
        ST.local = all.map(function (f) { return f.family; }).filter(function (f) { return f && !seen[f] && (seen[f] = 1); }).sort();
        ST.localState = 'granted';
      } catch (e) { ST.localState = 'denied'; }
      ctx.render();
    }
    async function template() {
      var s = style(), z = sizes(), name = 'CheckLab_Modello_' + (fontName() || 'font').replace(/[^A-Za-z0-9]+/g, '-') + '.pptx';
      var bytes = await CL.kit.template({ template: await ctx.asset('template.pptx'), bg: s.bg, fg: s.fg, accent: s.accent, font: fontName() || 'Aptos',
        sizes: /^key/.test(ST.fmt) ? sizesFor('ppt' + ST.fmt.slice(3)) : z, wide: /169$/.test(ST.fmt), lang: ctx.I.locale,
        texts: { title: t('st.tpl.title'), sub: t('st.tpl.sub'), head: t('st.tpl.head'), body: t('st.tpl.body') } });
      var how = await ctx.P.openKit(bytes, name);
      ST.status = how === 'opened' ? t('st.opened') : (how === 'downloaded' ? t('st.made', { name: name }) : t('note.downloadMac'));
      ctx.render();
    }
    // le grandezze del modello sono sempre in punti di PowerPoint
    function sizesFor(f) { var keep = ST.fmt; ST.fmt = f; var z = sizes(); ST.fmt = keep; return z; }

    /* Eventi: delegati una volta sola alla radice dell'app, così sopravvivono a ogni ridisegno */
    function install(root) {
      root.addEventListener('input', function (e) {
        var el = e.target, d = el.dataset || {};
        if (d.stCol) { set(d.stCol, el.value); refresh(el); }
        else if (d.stHex) { if (set(d.stHex, el.value)) refresh(el); }
        else if (d.stFilter !== undefined) { ST.filter = el.value; var q = el.value.toLowerCase(); g.document.getElementById('st-fontlist').innerHTML = fontList(ST.local.filter(function (f) { return !q || f.toLowerCase().indexOf(q) >= 0; }).slice(0, 60)); }
        else if (d.stTyped !== undefined) { ST.typed = el.value; ST.checked = null; }
        else if (d.stM) { settings[d.stM] = el.value; ctx.saveAll(); if (ctx.reevaluate) ctx.reevaluate(); refresh(el); }
      });
      root.addEventListener('change', function (e) {
        var el = e.target, d = el.dataset || {};
        if (d.stUpload !== undefined && el.files && el.files[0]) { loadFont(el.files[0]); return; }
        if (d.stFont !== undefined) { style().font = el.value; ST.checked = null; touch(); ctx.render(); }
        else if (d.stCb !== undefined) { ST.cb = el.checked; refresh(); }
        else if (d.stFmt !== undefined) { ST.fmt = el.value; refresh(); }
        else if (d.stRoom !== undefined) { settings.room = el.value; ctx.saveAll(); if (ctx.reevaluate) ctx.reevaluate(); refresh(); }
        else if (d.stCol) ctx.render();
      });
      root.addEventListener('click', function (e) {
        var el = e.target.closest && e.target.closest('[data-st],[data-st-use],[data-st-pick],[data-st-fix],[data-st-light],[data-st-rows],[data-st-find]');
        if (!el || !root.contains(el)) return;
        var d = el.dataset, s = style();
        if (d.stUse) { set('fg', d.stUse); ctx.render(); }
        else if (d.stPick) { s.custom = d.stPick; touch(); ctx.render(); }
        else if (d.stFix) { var p = d.stFix.split(':'); set(p[0], p[1]); ctx.render(); }
        else if (d.stLight) { settings.light = d.stLight; ctx.saveAll(); if (ctx.reevaluate) ctx.reevaluate(); ctx.render(); }
        else if (d.stRows) { settings.rows = d.stRows; ctx.saveAll(); if (ctx.reevaluate) ctx.reevaluate(); ctx.render(); }
        else if (d.st === 'swap') { var b = s.bg; s.bg = s.fg; s.fg = b; touch(); ctx.render(); }
        else if (d.st === 'pro') { ST.pro = !ST.pro; ctx.render(); }
        else if (d.st === 'info') info();
        else if (d.stFind) {
          var q = encodeURIComponent(s.custom || ST.typed.trim());
          ctx.P.openUrl(d.stFind === 'dafont' ? 'https://www.dafont.com/search.php?q=' + q : 'https://fonts.google.com/?query=' + q);
        }
        else if (d.st === 'listFonts') listFonts();
        else if (d.st === 'verify') {
          var n = ST.typed.trim();
          if (n) { ST.checked = hasFont(n); if (ST.checked) { s.custom = n; touch(); } ctx.render(); }
        }
        else if (d.st === 'template') template().catch(function (err) { g.console.error(err); ST.status = t('err.read'); ctx.render(); });
        else if (d.st === 'codes') ctx.copy(t('st.codes', { bg: s.bg, fg: s.fg, accent: s.accent, font: fontName() || '–' }), el);
      });
    }
    function setFormat(f) { if (FMT[f]) ST.fmt = f; }

    return { render: render, install: install, setFormat: setFormat };
  };
})(window);

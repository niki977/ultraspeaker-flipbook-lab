/*
 * The Ultraspeaker Check Lab — analyze-key.js
 * Legge nel browser un file Apple Keynote .key (formato a file singolo: un archivio ZIP) e
 * raccoglie gli stessi dati di analyze-pptx.js, slide per slide.
 *  - Index/*.iwa   oggetti protobuf compressi con Snappy: ordine delle slide, slide saltate, note,
 *                  testo di ogni oggetto con il suo font, immagini e filmati con la loro misura sulla slide
 *  - Index/Metadata.iwa  quale file di Data/ appartiene a quale immagine o filmato
 *  - Data/         i veri file di immagini, video e audio
 * Apple non documenta il formato: se non si legge, si usa la stima di prima (res.limited).
 * I numeri dei campi seguono le definizioni dei messaggi di Keynote (KN, TSD, TSWP, TSS, TSP).
 */
(function (g) {
  'use strict';
  var CL = g.CheckLab = g.CheckLab || {};

  /* .iwa = blocchi [0x00, lunghezza su 3 byte, dati Snappy]; restituisce il flusso decompresso */
  function iwa(src) {
    var parts = [], o = 0, total = 0;
    while (o + 4 <= src.length && src[o] === 0) {
      var end = o + 4 + (src[o + 1] | (src[o + 2] << 8) | (src[o + 3] << 16)), p = o + 4;
      var len = 0, shift = 0, c;
      do { c = src[p++]; len += (c & 0x7F) * Math.pow(2, shift); shift += 7; } while (c & 0x80);
      var out = new Uint8Array(len), op = 0;
      while (p < end && op < len) {
        var tag = src[p++], type = tag & 3, l, off;
        if (type === 0) {
          l = tag >>> 2;
          if (l >= 60) { var nb = l - 59; l = 0; for (var i = 0; i < nb; i++) l += src[p++] * Math.pow(256, i); }
          out.set(src.subarray(p, p + l + 1), op); p += l + 1; op += l + 1;
          continue;
        }
        if (type === 1) { l = ((tag >>> 2) & 7) + 4; off = ((tag >>> 5) << 8) | src[p++]; }
        else if (type === 2) { l = (tag >>> 2) + 1; off = src[p] | (src[p + 1] << 8); p += 2; }
        else { l = (tag >>> 2) + 1; off = (src[p] | (src[p + 1] << 8) | (src[p + 2] << 16)) + src[p + 3] * 16777216; p += 4; }
        if (!off || off > op) throw new Error('snappy');
        for (var k = 0; k < l; k++, op++) out[op] = out[op - off];
      }
      parts.push(out); total += out.length; o = end;
    }
    var all = new Uint8Array(total), at = 0;
    parts.forEach(function (x) { all.set(x, at); at += x.length; });
    return all;
  }

  /* ---------- lettore protobuf minimo ---------- */
  var utf8 = new TextDecoder('utf-8');
  /* Un messaggio come { numero del campo: [valori] }: numeri per varint e float, {d, s, e} per i byte */
  function msg(d, s, e) {
    var f = {}, p = s, dv = null;
    while (p < e) {
      var key = 0, mul = 1, c;
      do { c = d[p++]; key += (c & 0x7F) * mul; mul *= 128; } while (c & 0x80 && p < e);
      var n = Math.floor(key / 8), w = key % 8, v;
      if (w === 0) { v = 0; mul = 1; do { c = d[p++]; v += (c & 0x7F) * mul; mul *= 128; } while (c & 0x80); }
      else if (w === 2) { var l = 0; mul = 1; do { c = d[p++]; l += (c & 0x7F) * mul; mul *= 128; } while (c & 0x80); v = { d: d, s: p, e: p + l }; p += l; }
      else if (w === 5) { dv = dv || new DataView(d.buffer, d.byteOffset); v = dv.getFloat32(p, true); p += 4; }
      else if (w === 1) { dv = dv || new DataView(d.buffer, d.byteOffset); v = dv.getFloat64(p, true); p += 8; }
      else throw new Error('protobuf');
      (f[n] = f[n] || []).push(v);
    }
    return f;
  }
  function sub(m, n) { var v = m && m[n] && m[n][0]; return v && v.d ? msg(v.d, v.s, v.e) : null; }
  function subs(m, n) { return ((m && m[n]) || []).filter(function (v) { return v.d; }).map(function (v) { return msg(v.d, v.s, v.e); }); }
  function num(m, n) { var v = m && m[n] && m[n][0]; return typeof v === 'number' ? v : undefined; }
  function str(m, n) { var v = m && m[n] && m[n][0]; return v && v.d ? utf8.decode(v.d.subarray(v.s, v.e)) : ''; }
  function strs(m, n) { return ((m && m[n]) || []).map(function (v) { return utf8.decode(v.d.subarray(v.s, v.e)); }); }
  function ref(m, n) { return num(sub(m, n), 1); }                 // TSP.Reference / DataReference: identificativo = 1
  function refs(m, n) { return subs(m, n).map(function (r) { return num(r, 1); }); }

  /* Ogni oggetto di un flusso .iwa: id -> { tipo, primo messaggio, file di Data/ che usa } */
  function objects(d, into) {
    var p = 0;
    while (p < d.length) {
      var l = 0, mul = 1, c;
      do { c = d[p++]; l += (c & 0x7F) * mul; mul *= 128; } while (c & 0x80);
      var info = msg(d, p, p + l), id = num(info, 1), first = null, data = [];
      p += l;
      subs(info, 2).forEach(function (mi) {                       // MessageInfo: tipo 1, lunghezza 3, riferimenti ai dati 6
        var len = num(mi, 3) || 0;
        if (!first) first = { type: num(mi, 1), d: d, s: p, e: p + len, data: data, m: null };
        data.push.apply(data, mi[6] || []);
        p += len;
      });
      if (id !== undefined && first) into[id] = first;
    }
  }

  /* Stringhe protobuf che sembrano nomi PostScript di font («HelveticaNeue-Bold»): la vecchia stima */
  var HINT = /(-|^)(Regular|Roman|Book|Light|Thin|Medium|SemiBold|Semibold|DemiBold|Bold|ExtraBold|Heavy|Black|Italic|Oblique|BoldItalic|LightItalic|Condensed|Std|Pro|LT)$|MT$/;
  var NOT_FONT = /^(Regular|Bold|Italic|Light|Medium|Black|Title|Body|Heading|Caption|Bullet|Subtitle|Quote|Attribution|Label|Default|None|Normal)$/i;
  function fontStrings(d, found) {
    for (var i = 1; i < d.length - 3; i++) {
      var L = d[i];
      if (L < 3 || L > 63 || (d[i - 1] & 7) !== 2 || i + 1 + L > d.length) continue;
      var s = String.fromCharCode.apply(null, d.subarray(i + 1, i + 1 + L));
      if (!/^[A-Za-z][A-Za-z0-9]*(-[A-Za-z0-9]+)?$/.test(s) || NOT_FONT.test(s)) continue;
      if (HINT.test(s) || CL.fonts.classify(s) !== 'custom') found[s.split('-')[0]] = 1;
    }
  }
  /* «HelveticaNeue-Bold» -> «Helvetica Neue»; i nomi nascosti dei font di sistema Apple -> «SF Pro» */
  function family(ps) {
    if (/^\./.test(ps) || /^SFNS|^SFPro/.test(ps)) return 'SF Pro';
    return ps.split('-')[0].replace(/([a-z])([A-Z])/g, '$1 $2').replace(/MT$/, ' MT').trim();
  }

  // Numeri dei tipi di messaggio (registro di Keynote)
  var T = { DOC: 1, PH: 7, PH2: 12, STORAGE: 2001, STORAGE2: 2005, SHAPEINFO: 2011, CHARSTYLE: 2021, PARASTYLE: 2022, LINK: 2032,
    IMAGE: 3005, MOVIE: 3007, GROUP: 3008, META: 11006 };

  function readStructure(objs, res) {
    function get(id) { var o = objs[id]; if (o && !o.m) o.m = msg(o.d, o.s, o.e); return o; }
    function find(type) { for (var id in objs) if (objs[id].type === type) return get(id); return null; }

    // File di Data/ per identificativo
    var meta = find(T.META), files = {};
    if (!meta) throw new Error('no metadata');
    subs(meta.m, 4).forEach(function (di) {
      var file = str(di, 4) || str(di, 3);
      if (file) files[num(di, 1)] = { path: 'Data/' + file, name: str(di, 3) || file };
    });

    // Misura e ordine delle slide: albero delle slide in profondità; saltata = nascosta
    var doc = find(T.DOC), show = doc && get(ref(doc.m, 2));
    if (!show) throw new Error('no show');
    var size = sub(show.m, 4), tree = sub(show.m, 3);
    res.slideW = num(size, 1) || 0; res.slideH = num(size, 2) || 0;
    var order = [], seen = {};
    (function walk(nodes) {                                       // SlideNode: slide 2, saltata 4, figlie rientrate 1
      nodes.forEach(function (id) {
        var node = get(id), slideId = node && ref(node.m, 2);
        if (!node || seen[id]) return;
        seen[id] = 1;
        if (slideId) order.push({ slide: slideId, hidden: num(node.m, 4) === 1 });
        walk(refs(node.m, 1));
      });
    })(tree[2] ? refs(tree, 2) : [ref(tree, 1)]);                // slide di primo livello, o il nodo radice dei file più vecchi
    if (!order.length) throw new Error('no slides');

    // Font di uno stile: il suo o quello del genitore più vicino (TSS.StyleArchive.parent)
    var fontCache = {};
    function styleFont(id) {
      if (id in fontCache) return fontCache[id];
      var f = null, seen = 0, cur = id;
      while (cur && seen++ < 30) {
        var st = get(cur);
        if (!st || (st.type !== T.CHARSTYLE && st.type !== T.PARASTYLE)) break;
        var name = str(sub(st.m, 11), 5);                       // char_properties.font_name
        if (name) { f = name; break; }
        cur = ref(sub(st.m, 1), 3);                             // super.parent
      }
      return (fontCache[id] = f);
    }
    // Una proprietà del carattere lungo la catena degli stili (TSWP.CharacterStylePropertiesArchive: grassetto 1, grandezza 3, font 5, colore 7)
    function styleProp(id, read) {
      for (var k = 0, cur = id; cur && k < 30; k++) {
        var st = get(cur);
        if (!st || (st.type !== T.CHARSTYLE && st.type !== T.PARASTYLE)) return undefined;
        var v = read(sub(st.m, 11));
        if (v !== undefined && v !== null && v !== '') return v;
        cur = ref(sub(st.m, 1), 3);
      }
      return undefined;
    }
    function tspColor(c) {                                          // TSP.Color: modello 1 rgb (3, 4, 5), 2 cmyk (7-10), 3 bianco (11)
      if (!c) return null;
      var model = num(c, 1) || 1, v = function (n) { return num(c, n) || 0; };
      if (model === 3) return CL.color.toHex([v(11) * 255, v(11) * 255, v(11) * 255]);
      if (model === 2) return CL.color.toHex([v(7), v(8), v(9)].map(function (x) { return 255 * (1 - x) * (1 - v(10)); }));
      return CL.color.toHex([v(3) * 255, v(4) * 255, v(5) * 255]);
    }
    // TSD.FillArchive: colore 1, sfumatura 2 (tappe 2, ognuna con colore 1), immagine 3 (dati 6 o 7)
    function fillOf(f) {
      if (!f) return null;
      var c = sub(f, 1), gr = sub(f, 2), im = sub(f, 3);
      if (c) return { kind: 'solid', color: tspColor(c) };
      if (gr) {
        var stops = subs(gr, 2).map(function (x) { return tspColor(sub(x, 1)); }).filter(Boolean);
        return stops.length && stops.every(function (x) { return CL.color.deltaE(x, stops[0]) < 6; }) ? { kind: 'solid', color: stops[0] } : { kind: 'gradient' };
      }
      if (im) { var file = files[ref(im, 6)] || files[ref(im, 7)]; return { kind: 'image', path: file && file.path }; }
      return { kind: 'none' };
    }
    // Riempimento dello stile di una forma (TSWP.ShapeStyleArchive 2025 contiene TSD.ShapeStyleArchive 3015: proprietà 11, riempimento 1) o di una slide (KN 9)
    function styleFill(id) {
      for (var k = 0, cur = id; cur && k < 30; k++) {
        var st = get(cur);
        if (!st) return null;
        var base = st.type === 2025 ? sub(st.m, 1) : (st.type === 3015 || st.type === 9 ? st.m : null);
        if (!base) return null;
        var props = sub(base, 11);
        if (props && props[1]) return fillOf(sub(props, 1));
        cur = ref(sub(base, 1), 3);
      }
      return null;
    }
    /* Testo di un blocco diviso per font, colore, grandezza e peso */
    function textGroups(storageId) {
      var st = get(storageId), out = {};
      if (!st || (st.type !== T.STORAGE && st.type !== T.STORAGE2)) return [];
      var text = strs(st.m, 3).join(''), paras = table(st.m, 5), chars = table(st.m, 8);
      var cuts = [0, text.length].concat(paras.map(function (x) { return x.at; }), chars.map(function (x) { return x.at; }))
        .filter(function (v, i, a) { return v <= text.length && a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
      function at(list, i) { var r = null; list.forEach(function (x) { if (x.at <= i) r = x; }); return r && r.id; }
      for (var i = 0; i < cuts.length - 1; i++) {
        var piece = text.slice(cuts[i], cuts[i + 1]), cs = at(chars, cuts[i]), ps = at(paras, cuts[i]);
        if (!clean(piece)) continue;
        var prop = function (read) { var v = cs ? styleProp(cs, read) : undefined; return v === undefined && ps ? styleProp(ps, read) : v; };
        var font = prop(function (cp) { return str(cp, 5); }), colour = prop(function (cp) { var c = sub(cp, 7); return c ? tspColor(c) : undefined; }) || '#000000';
        var size = prop(function (cp) { return num(cp, 3); }) || 0, bold = prop(function (cp) { var b = num(cp, 1); return b === undefined ? undefined : b === 1; }) || false;
        if (!font) continue;
        var key = [font, colour, size, bold].join('|');
        (out[key] = out[key] || { font: family(font), color: colour, size: Math.round(size * 10) / 10, bold: bold, text: '' }).text += piece;
      }
      return Object.keys(out).map(function (k) { return out[k]; });
    }
    function table(storage, n) {                                  // ObjectAttributeTable: [{at, id}]
      return subs(sub(storage, n), 1).map(function (e) { return { at: num(e, 1) || 0, id: ref(e, 2) }; }).sort(function (a, b) { return a.at - b.at; });
    }
    function clean(s) { return s.replace(/[\u0000-\u001F\u2028\u2029\uFFFC]/g, ' ').replace(/\s+/g, ' ').trim(); }
    /* Testo di un blocco diviso per font: { font: testo } */
    function textByFont(storageId) {
      var st = get(storageId), out = {};
      if (!st || (st.type !== T.STORAGE && st.type !== T.STORAGE2)) return out;
      var text = strs(st.m, 3).join(''), paras = table(st.m, 5), chars = table(st.m, 8);
      var cuts = [0, text.length].concat(paras.map(function (x) { return x.at; }), chars.map(function (x) { return x.at; }))
        .filter(function (v, i, a) { return v <= text.length && a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
      function at(list, i) { var r = null; list.forEach(function (x) { if (x.at <= i) r = x; }); return r && r.id; }
      for (var i = 0; i < cuts.length - 1; i++) {
        var piece = text.slice(cuts[i], cuts[i + 1]), cs = at(chars, cuts[i]), ps = at(paras, cuts[i]);
        var font = (cs && styleFont(cs)) || (ps && styleFont(ps));
        if (font && clean(piece)) out[font] = (out[font] || '') + piece;
      }
      return out;
    }
    function storageText(id) { var st = get(id); return st && (st.type === T.STORAGE || st.type === T.STORAGE2) ? clean(strs(st.m, 3).join('')) : ''; }
    function links(storageId, slide) {
      var st = get(storageId);
      if (st) table(st.m, 11).forEach(function (x) {
        var f = get(x.id), url = f && f.type === T.LINK ? str(f.m, 2) : '';
        if (/^(https?|file):/i.test(url)) res.links.push({ slide: slide, kind: /^https?:/i.test(url) ? 'web' : 'file', target: url });
      });
    }
    // DrawableArchive (la catena «super» cambia con il tipo): geometria e nome per il lettore di schermo
    function drawable(o) {
      var t = o.type, m = o.m;
      if (t === T.PH || t === T.PH2) m = sub(sub(sub(m, 1), 1), 1);        // Placeholder > ShapeInfo > Shape > Drawable
      else if (t === T.SHAPEINFO) m = sub(sub(m, 1), 1);                   // ShapeInfo > Shape > Drawable
      else m = sub(m, 1);                                                  // Forma, immagine, filmato, gruppo, maschera > Drawable
      var geo = sub(m, 1), sz = sub(geo, 2), pos = sub(geo, 1);
      return { w: num(sz, 1) || 0, h: num(sz, 2) || 0, x: num(pos, 1) || 0, y: num(pos, 2) || 0, label: str(m, 8), url: str(m, 4) };
    }

    var fonts = {}, mediaById = {}, imageUses = {};
    res.texts = []; res.fontUnit = 1;                                  // In Keynote le grandezze sono punti su una slide misurata in pixel
    function overlap(a, b) {
      var w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      return w > 0 && h > 0 ? w * h / Math.max(1, a.w * a.h) : 0;
    }
    function picture(file) { return (imageUses[file.path] = imageUses[file.path] || { path: file.path, name: file.name, uses: [] }).uses; }
    function addFont(ps, use) {
      var name = family(ps), k = name.toLowerCase();
      (fonts[k] = fonts[k] || { name: name, uses: [] }).uses.push(use);
    }

    /* Un oggetto mostrato su una slide: true se mette qualcosa sullo schermo */
    // Testi e immagini della slide in lettura, in ordine di sovrapposizione, per sapere cosa c'è dietro ogni testo
    var slideTexts = [], slidePics = [], z = 0;
    function visit(id, sn, kindHint, fromMaster, depth, off) {
      var o = get(id);
      if (!o || depth > 20) return false;
      off = off || { x: 0, y: 0 };
      var t = o.type, d, content = false;
      if (t === T.GROUP) {
        var gd = drawable(o), inner = { x: off.x + gd.x, y: off.y + gd.y };      // le figlie stanno nel riquadro del gruppo
        refs(o.m, 2).forEach(function (c) { if (visit(c, sn, null, fromMaster, depth + 1, inner)) content = true; });
        return content;
      }
      if (t === T.PH || t === T.PH2 || t === T.SHAPEINFO) {
        if (fromMaster && t !== T.SHAPEINFO) return false;               // la slide ha i propri segnaposto
        d = drawable(o);
        var info = t === T.SHAPEINFO ? o.m : sub(o.m, 1), storage = ref(info, 4);
        var kind = fromMaster ? 'master' : (kindHint || (num(info, 6) === 1 ? 'textbox' : 'shape'));
        var byFont = textByFont(storage);
        Object.keys(byFont).forEach(function (f) {
          var said = clean(byFont[f]);
          addFont(f, { slide: sn, kind: kind, shape: d.label, text: said.length > 80 ? said.slice(0, 79) + '…' : said });
        });
        // Colore, grandezza e sfondo del testo: un dettaglio illeggibile esclude solo quel testo
        try {
          var own = styleFill(ref(sub(info, 1), 2)), rect = { x: off.x + d.x, y: off.y + d.y, w: d.w, h: d.h };
          if (kind !== 'slideNumber') textGroups(storage).forEach(function (gr) {
            var said = clean(gr.text);
            slideTexts.push({ slide: sn, shape: d.label, kind: kind, title: kind === 'title', text: said.length > 80 ? said.slice(0, 79) + '…' : said,
              font: gr.font, color: gr.color, size: gr.size, bold: gr.bold, rect: rect, own: own, z: z++ });
          });
        } catch (e) { res.textsPartial = true; }
        links(storage, sn);
        if (d.url && /^https?:/i.test(d.url)) res.links.push({ slide: sn, kind: 'web', target: d.url });
        return t === T.SHAPEINFO || !!storageText(storage);              // un segnaposto vuoto non mostra niente
      }
      if (t === T.IMAGE) {
        d = drawable(o);
        var file = files[ref(o.m, 11)] || files[ref(o.m, 13)];
        if (!file) return true;
        var mask = get(ref(o.m, 5)), crop = { l: 0, t: 0, r: 0, b: 0 }, shown = d.w, vis = { x: off.x + d.x, y: off.y + d.y, w: d.w, h: d.h };
        if (mask && d.w && d.h) {                                       // la maschera è la finestra visibile, nel riquadro dell'immagine
          var mk = drawable(mask);
          if (mk.w && mk.h) {
            crop = { l: Math.max(0, mk.x / d.w), t: Math.max(0, mk.y / d.h), r: Math.max(0, 1 - (mk.x + mk.w) / d.w), b: Math.max(0, 1 - (mk.y + mk.h) / d.h) };
            shown = Math.min(d.w, mk.w);
            vis = { x: vis.x + Math.max(0, mk.x), y: vis.y + Math.max(0, mk.y), w: Math.min(d.w, mk.w), h: Math.min(d.h, mk.h) };
          }
        }
        slidePics.push({ z: fromMaster ? -100000 + z++ : z++, path: file.path, rect: vis, crop: crop });
        picture(file).push({ slide: sn, cx: shown, crop: crop, kind: fromMaster ? 'master' : 'image', shape: d.label });
        if (d.url && /^https?:/i.test(d.url)) res.links.push({ slide: sn, kind: 'web', target: d.url });
        return true;
      }
      if (t === T.MOVIE) {
        var mf = files[ref(o.m, 14)];
        if (!mf) return true;
        var m = mediaById[mf.path] = mediaById[mf.path] || { path: mf.path, name: mf.name, slides: [] };
        if (m.slides.indexOf(sn) < 0) m.slides.push(sn);
        return true;
      }
      return true;                                                       // forme, linee, tabelle, grafici
    }
    function background(styleId, sn) {                                  // immagini usate come sfondo della slide
      for (var k = 0, cur = styleId; cur && k < 6; k++) {
        var st = get(cur);
        if (!st) return;
        st.data.forEach(function (did) {
          var file = files[did];
          if (file) picture(file).push({ slide: sn, cx: res.slideW, crop: { l: 0, t: 0, r: 0, b: 0 }, kind: 'master' });
        });
        cur = ref(sub(st.m, 1), 3);
      }
    }

    // Oggetti mostrati su una slide, in ordine di sovrapposizione (campo 42). I file salvati prima che Keynote scrivesse l'elenco hanno solo gli oggetti propri.
    var zOrder = order.some(function (e) { var s = get(e.slide); return s && s.m[42]; });
    function shown(m) { return zOrder ? refs(m, 42) : refs(m, 7); }
    order.forEach(function (entry, i) {
      var sn = i + 1, sl = get(entry.slide), slide = { index: sn, hidden: entry.hidden, notes: false, empty: true };
      res.slides.push(slide);
      if (!sl) return;
      var m = sl.m, visible = shown(m);
      var kinds = {}; kinds[ref(m, 5)] = 'title'; kinds[ref(m, 6)] = 'body'; kinds[ref(m, 20)] = 'slideNumber';
      visible.forEach(function (id) { if (visit(id, sn, kinds[id], false, 0) && kinds[id] !== 'slideNumber') slide.empty = false; });
      var note = get(ref(m, 27));
      slide.notes = !!(note && storageText(ref(note.m, 1)));
      // Cosa mette la diapositiva master su ogni slide: i suoi oggetti (non i segnaposto) e lo sfondo
      var tpl = get(ref(m, 17));
      if (tpl) {
        shown(tpl.m).forEach(function (id) { visit(id, sn, null, true, 0); });
        background(ref(tpl.m, 1), sn);
      }
      background(ref(m, 1), sn);
      // Cosa c'è dietro ogni testo: il suo riempimento, altrimenti un'immagine sotto, altrimenti lo sfondo della slide
      var bg = null;
      try { bg = styleFill(ref(m, 1)) || (tpl && styleFill(ref(tpl.m, 1))); } catch (e) { res.textsPartial = true; }
      bg = bg || { kind: 'solid', color: '#FFFFFF' };
      if (bg.kind === 'none') bg = { kind: 'solid', color: '#FFFFFF' };
      if (bg.kind === 'image') bg = bg.path ? { kind: 'image', over: { path: bg.path, rect: { x: 0, y: 0, w: res.slideW, h: res.slideH }, crop: { l: 0, t: 0, r: 0, b: 0 } } } : { kind: 'unknown' };
      slideTexts.forEach(function (tx) {
        var behind = tx.own && tx.own.kind !== 'none' ? tx.own : null;
        if (behind && behind.kind === 'image') behind = behind.path ? { kind: 'image', over: { path: behind.path, rect: tx.rect, crop: { l: 0, t: 0, r: 0, b: 0 } } } : { kind: 'unknown' };
        if (!behind) {
          var under = slidePics.filter(function (p) { return p.z < tx.z && overlap(tx.rect, p.rect) > 0.3; }).sort(function (a, b) { return a.z - b.z; }).pop();
          behind = under ? { kind: 'image', over: under } : bg;
        }
        res.texts.push({ slide: tx.slide, shape: tx.shape, kind: tx.kind, title: tx.title, text: tx.text, font: tx.font, color: tx.color, size: tx.size, bold: tx.bold, rect: tx.rect, behind: behind });
      });
      slideTexts = []; slidePics = [];
    });

    function values(o) { return Object.keys(o).map(function (k) { return o[k]; }); }
    res.fonts = values(fonts);
    return { media: values(mediaById), images: values(imageUses) };
  }

  /* Se la struttura non si legge: la stima delle versioni precedenti (numero di slide, font citati negli stili, tutte le immagini di Data/) */
  async function estimate(zip, res, iwas, streams, data) {
    res.limited = true;
    res.slides = []; res.fonts = []; res.links = []; res.texts = null;
    iwas.forEach(function (n) { if (/\/Slide[-\d]*\.iwa$/.test(n)) res.slides.push({ index: res.slides.length + 1, hidden: null, empty: null, notes: null }); });
    var prev = zip.file('preview.jpg');
    if (prev) { var p = CL.probe.image(await prev.async('uint8array'), 'preview.jpg'); res.slideW = p.width; res.slideH = p.height; }
    var est = {};
    streams.forEach(function (s) { fontStrings(s, est); });
    res.fontsUnreadable = !streams.length;
    Object.keys(est).forEach(function (ps) { res.fonts.push({ name: family(ps), uses: [] }); });
    return { media: [], images: data.filter(isImage).map(function (n) { return { path: n, name: n.slice(5), uses: [] }; }) };
  }
  function isImage(n) { return CL.probe.kindOf(CL.probe.sniff([], n)) === 'image'; }

  /* ---------- l'analisi ---------- */
  async function analyze(zip, opts) {
    function check() { if (opts.token && opts.token.cancelled) throw new Error('cancelled'); }
    var res = { type: 'key', fileName: opts.fileName, fileBytes: opts.fileBytes, slideW: 0, slideH: 0, slides: [], fonts: [], embeddedFonts: [], media: [], images: [], links: [] };
    var names = Object.keys(zip.files), iwas = names.filter(function (n) { return /^Index\/.*\.iwa$/.test(n); });
    if (!iwas.length) throw new Error('notKey');
    // Le miniature di Keynote e le anteprime dei temi si saltano
    var data = names.filter(function (n) { return /^Data\/[^/]+$/.test(n) && !/(^|-)small(-|\.)|thumbnail|^Data\/(st|mt)-|preview/i.test(n); });

    // Legge tutti gli oggetti del documento
    var objs = {}, streams = [];
    for (var i = 0; i < iwas.length; i++) {
      check();
      opts.onProgress('fonts', 0.8 * i / iwas.length);
      try { var d = iwa(await zip.file(iwas[i]).async('uint8array')); streams.push(d); objects(d, objs); } catch (e) { /* saltata */ }
    }
    var found;
    try { found = readStructure(objs, res); } catch (e) { found = await estimate(zip, res, iwas, streams, data); }
    opts.onProgress('fonts', 1);

    // Video e audio: i filmati sulle slide più ogni altro file audio o video di Data/ (colonna sonora)
    var media = found.media.concat(data.filter(function (n) { return !isImage(n) && !found.media.some(function (m) { return m.path === n; }); })
      .map(function (n) { return { path: n, name: n.slice(5), slides: [] }; }));
    var mediaDone = CL.probe.byBytes(zip, media);
    for (var j = 0; j < media.length; j++) {
      check();
      opts.onProgress('media', mediaDone(j));
      var mm = media[j], mfile = zip.file(mm.path);
      if (!mfile) continue;
      var bytes = await mfile.async('uint8array'), kind = CL.probe.kindOf(CL.probe.sniff(bytes, mm.path));
      if (kind === 'image' || kind === 'other') continue;
      var info = CL.probe.media(bytes, mm.path);
      res.media.push({ path: mm.path, name: mm.name, slides: mm.slides.sort(function (a, b) { return a - b; }), bytes: bytes.length, info: info, kind: info.kind });
    }

    // Immagini: quelle sulle slide, con misura e ritaglio
    var imageDone = CL.probe.byBytes(zip, found.images);
    for (var q = 0; q < found.images.length; q++) {
      check();
      opts.onProgress('images', imageDone(q));
      var pic = found.images[q], f = zip.file(pic.path);
      if (!f) continue;
      var ib = await f.async('uint8array');
      if (CL.probe.kindOf(CL.probe.sniff(ib, pic.path)) !== 'image') continue;
      res.images.push({ path: pic.path, name: pic.name, info: CL.probe.image(ib, pic.path), uses: pic.uses });
    }
    return res;
  }

  CL.analyzeKey = analyze;
})(window);

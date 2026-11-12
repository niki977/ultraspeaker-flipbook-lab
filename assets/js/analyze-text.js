/*
 * The Ultraspeaker Check Lab — analyze-text.js
 * Secondo passaggio su un file PowerPoint, per la leggibilità: ogni testo di ogni slide con
 * colore, grandezza e peso (ereditati da layout, schema e tema se il testo non li dice),
 * la sua posizione, cosa c'è dietro (sfondo della slide, riempimento della forma, un'immagine)
 * e i colori delle serie dei grafici. Tabelle, SmartArt ed effetti WordArt non si leggono.
 * Risultato: res.texts, res.charts, res.fontUnit (EMU per punto).
 */
(function (g) {
  'use strict';
  var CL = g.CheckLab = g.CheckLab || {};

  var PRESET = { black: '#000000', white: '#FFFFFF', red: '#FF0000', green: '#008000', blue: '#0000FF', yellow: '#FFFF00', gray: '#808080', grey: '#808080' };

  async function textsPptx(zip, res, opts) {
    var X = CL.ooxml, C = CL.color, attr = X.attr, all = X.all, unxml = X.unxml;
    function check() { if (opts.token && opts.token.cancelled) throw new Error('cancelled'); }
    function first(re, s) { var m = re.exec(s || ''); return m ? m : null; }
    function block(tag, s) { var m = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>').exec(s || ''); return m ? m[1] : ''; }
    var cache = {};
    async function part(path) {
      if (!path) return null;
      if (!cache[path]) cache[path] = { xml: await X.read(zip, path), rels: await X.rels(zip, path) };
      return cache[path];
    }
    function relOf(p, type) { return X.list(p.rels).filter(function (r) { return r.type === type; })[0]; }

    /* ---------- tema ---------- */
    var themes = {};
    function theme(xml) {
      var scheme = {}, cs = block('a:clrScheme', xml);
      ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'].forEach(function (k) {
        var b = block('a:' + k, cs), m = first(/<a:srgbClr\s[^>]*val="([0-9A-Fa-f]{6})"/, b) || first(/<a:sysClr\s[^>]*lastClr="([0-9A-Fa-f]{6})"/, b);
        if (m) scheme[k] = '#' + m[1].toUpperCase();
      });
      var bgList = block('a:bgFillStyleLst', xml);
      var bgFills = all(/<a:(solidFill|gradFill|blipFill|pattFill|noFill)[\s>\/]/g, bgList).map(function (m) { return m[1]; });
      var fillList = block('a:fillStyleLst', xml);
      var fills = all(/<a:(solidFill|gradFill|blipFill|pattFill|noFill)[\s>\/]/g, fillList).map(function (m) { return m[1]; });
      var font = {};
      ['major', 'minor'].forEach(function (k) { var m = new RegExp('<a:' + k + 'Font>\\s*<a:latin\\s[^>]*typeface="([^"]+)"').exec(xml); if (m) font[k === 'major' ? '+mj-lt' : '+mn-lt'] = unxml(m[1]); });
      return { scheme: scheme, bgFills: bgFills, fills: fills, font: font };
    }

    /* ---------- colori ---------- */
    // Primo elemento colore di un frammento (srgbClr, schemeClr, sysClr, prstClr), con lumMod/lumOff/tint/shade
    function colour(s, ctx, ph) {
      var m = first(/<a:(srgbClr|schemeClr|sysClr|prstClr|scrgbClr)\s([^>]*?)(?:\/>|>([\s\S]*?)<\/a:\1>)/, s);
      if (!m) return null;
      var kind = m[1], a = ' ' + m[2], mods = m[3] || '', c = null;
      if (kind === 'srgbClr') c = C.hex(attr(a, 'val'));
      else if (kind === 'sysClr') c = C.hex(attr(a, 'lastClr')) || (attr(a, 'val') === 'window' ? '#FFFFFF' : '#000000');
      else if (kind === 'prstClr') c = PRESET[attr(a, 'val')] || null;
      else if (kind === 'scrgbClr') c = C.toHex(['r', 'g', 'b'].map(function (k) { return Math.pow(+attr(a, k) / 100000, 1 / 2.2) * 255; }));
      else {
        var v = attr(a, 'val');
        if (v === 'phClr') c = ph || null;
        else c = ctx.scheme[ctx.map[v] || v] || null;
      }
      if (!c) return null;
      var lm = first(/<a:lumMod\s[^>]*val="(\d+)"/, mods), lo = first(/<a:lumOff\s[^>]*val="(-?\d+)"/, mods);
      var tint = first(/<a:tint\s[^>]*val="(\d+)"/, mods), shade = first(/<a:shade\s[^>]*val="(\d+)"/, mods);
      if (lm || lo) {
        var h = C.hsl(c), l = h[2] * (lm ? +lm[1] / 100000 : 1) + (lo ? +lo[1] / 100000 : 0);
        c = C.fromHsl(h[0], h[1], Math.max(0, Math.min(1, l)));
      }
      if (tint) { var t = +tint[1] / 100000; c = C.toHex(C.rgb(c).map(function (v) { return v * t + 255 * (1 - t); })); }
      if (shade) { var sh = +shade[1] / 100000; c = C.toHex(C.rgb(c).map(function (v) { return v * sh; })); }
      return c;
    }
    // Un riempimento: {kind: solid|gradient|image|pattern|none, color?, embed?}
    function fill(s, ctx) {
      var m = first(/<a:(solidFill|gradFill|blipFill|pattFill|noFill)[\s>\/]/, s);
      if (!m) return null;
      if (m[1] === 'noFill') return { kind: 'none' };
      if (m[1] === 'solidFill') { var c = colour(block('a:solidFill', s), ctx); return c ? { kind: 'solid', color: c } : null; }
      if (m[1] === 'blipFill') { var e = first(/<a:blip\s[^>]*r:embed="([^"]+)"/, s); return { kind: 'image', embed: e && e[1] }; }
      if (m[1] === 'gradFill') {
        // una sfumatura di un solo colore (o quasi) vale come quel colore; altrimenti va controllata a occhio
        var stops = all(/<a:gs\s[^>]*>([\s\S]*?)<\/a:gs>/g, block('a:gradFill', s)).map(function (x) { return colour(x[1], ctx); }).filter(Boolean);
        if (stops.length && stops.every(function (x) { return C.deltaE(x, stops[0]) < 6; })) return { kind: 'solid', color: stops[0] };
        return { kind: 'gradient' };
      }
      return { kind: 'pattern' };
    }
    function bgOf(p, ctx) {
      var bg = block('p:bg', p.xml);
      if (!bg) return null;
      var pr = block('p:bgPr', bg);
      var f = pr ? fill(pr, ctx) : null;
      if (!pr) {
        var ref = first(/<p:bgRef\s[^>]*idx="(\d+)"[^>]*>([\s\S]*?)<\/p:bgRef>/, bg);
        if (ref) {
          var idx = +ref[1], kind = idx >= 1001 ? ctx.theme.bgFills[idx - 1001] : ctx.theme.fills[idx - 1], c = colour(ref[2], ctx);
          f = kind === 'solidFill' || !kind ? (c ? { kind: 'solid', color: c } : null) : { kind: kind === 'gradFill' ? 'gradient' : (kind === 'blipFill' ? 'image' : 'pattern') };
        }
      }
      if (f && f.kind === 'image' && f.embed && p.rels[f.embed]) f.path = p.rels[f.embed].path;
      return f && f.kind !== 'none' ? f : null;
    }
    function clrMap(s) {
      var m = first(/<(?:p:clrMap|a:overrideClrMapping)\s([^>]*)\/?>/, s), map = {};
      if (m) all(/(\w+)="(\w+)"/g, m[1]).forEach(function (x) { map[x[1]] = x[2]; });
      return map;
    }

    /* ---------- geometria ---------- */
    function xfrm(s) {
      var x = block('a:xfrm', s), o = first(/<a:off\s[^>]*x="(-?\d+)"[^>]*y="(-?\d+)"/, x), e = first(/<a:ext\s[^>]*cx="(\d+)"[^>]*cy="(\d+)"/, x);
      return o && e ? { x: +o[1], y: +o[2], w: +e[1], h: +e[2] } : null;
    }
    // Trasformazioni dei gruppi: [{from, to, map(rect)}]; i gruppi annidati si applicano dall'interno
    function groups(tree) {
      var out = [], stack = [];
      all(/<p:grpSp>|<\/p:grpSp>/g, tree).forEach(function (m) {
        if (m[0] === '<p:grpSp>') stack.push(m.index);
        else {
          var from = stack.pop(), body = tree.slice(from, m.index), x = block('a:xfrm', block('p:grpSpPr', body));
          var n = function (re) { var r = first(re, x); return r ? [+r[1], +r[2]] : null; };
          var off = n(/<a:off\s[^>]*x="(-?\d+)"[^>]*y="(-?\d+)"/), ext = n(/<a:ext\s[^>]*cx="(\d+)"[^>]*cy="(\d+)"/), co = n(/<a:chOff\s[^>]*x="(-?\d+)"[^>]*y="(-?\d+)"/), ce = n(/<a:chExt\s[^>]*cx="(\d+)"[^>]*cy="(\d+)"/);
          if (off && ext && co && ce) out.push({ from: from, to: m.index, depth: stack.length, sx: ce[0] ? ext[0] / ce[0] : 1, sy: ce[1] ? ext[1] / ce[1] : 1, off: off, co: co });
        }
      });
      return out;
    }
    function place(r, at, gs) {
      if (!r) return null;
      gs.filter(function (q) { return at > q.from && at < q.to; }).sort(function (a, b) { return b.depth - a.depth; }).forEach(function (q) {
        r = { x: q.off[0] + (r.x - q.co[0]) * q.sx, y: q.off[1] + (r.y - q.co[1]) * q.sy, w: r.w * q.sx, h: r.h * q.sy };
      });
      return r;
    }
    function overlap(a, b) {
      if (!a || !b) return 0;
      var w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      return w > 0 && h > 0 ? w * h / Math.max(1, a.w * a.h) : 0;
    }

    /* ---------- stili del testo ---------- */
    function phInfo(s) {
      var m = first(/<p:ph(\s[^>]*)?\/?>/, s);
      if (!m) return null;
      return { type: attr(m[0], 'type') || 'body', idx: attr(m[0], 'idx') };
    }
    function findPh(p, ph) {
      if (!p || !ph) return null;
      var shapes = all(/<p:sp[\s>][\s\S]*?<\/p:sp>/g, block('p:spTree', p.xml)).map(function (m) { return m[0]; });
      var same = function (s) { var q = phInfo(s); return q && q.type === ph.type; };
      return shapes.filter(function (s) { var q = phInfo(s); return q && ph.idx && q.idx === ph.idx; })[0] ||
        shapes.filter(same)[0] || (ph.type === 'ctrTitle' || ph.type === 'title' ? shapes.filter(function (s) { var q = phInfo(s); return q && /title/i.test(q.type); })[0] : null);
    }
    // Proprietà del livello n in uno stile di elenco: grandezza, grassetto, colore
    function level(style, n, ctx) {
      if (!style) return {};
      var b = first(new RegExp('<a:lvl' + n + 'pPr(?:\\s[^>]*)?>([\\s\\S]*?)</a:lvl' + n + 'pPr>'), style) || (n > 1 ? null : first(/<a:defPPr(?:\s[^>]*)?>([\s\S]*?)<\/a:defPPr>/, style));
      if (!b) return {};
      var d = first(/<a:defRPr((?:\s[^>]*?)?)(?:\/>|>([\s\S]*?)<\/a:defRPr>)/, b[1]);
      if (!d) return {};
      var out = {}, sz = attr(d[1], 'sz'), bo = attr(d[1], 'b'), f = d[2] ? fill(d[2], ctx) : null, lat = d[2] && first(/<a:latin\s[^>]*typeface="([^"]+)"/, d[2]);
      if (sz) out.size = +sz / 100;
      if (bo !== null) out.bold = bo === '1' || bo === 'true';
      if (f) out.fill = f;
      if (lat) out.font = unxml(lat[1]);
      return out;
    }
    function pick(sources, k) { for (var i = 0; i < sources.length; i++) if (sources[i] && sources[i][k] !== undefined) return sources[i][k]; return undefined; }

    /* ---------- le slide ---------- */
    var pres = await X.read(zip, 'ppt/presentation.xml'), presRels = await X.rels(zip, 'ppt/presentation.xml');
    var defaultStyle = block('p:defaultTextStyle', pres);
    var ids = all(/<p:sldId\s[^>]*r:id="([^"]+)"/g, pres).map(function (m) { return m[1]; });
    res.texts = []; res.charts = []; res.fontUnit = 12700;
    var slideRect = { x: 0, y: 0, w: res.slideW, h: res.slideH };

    for (var i = 0; i < ids.length; i++) {
      check();
      opts.onProgress('contrast', 0.5 * i / ids.length);
      var num = i + 1, rel = presRels[ids[i]], sp = rel && await part(rel.path);
      if (!sp) continue;
      var lr = relOf(sp, 'slideLayout'), lp = lr && await part(lr.path), mr = lp && relOf(lp, 'slideMaster'), mp = mr && await part(mr.path);
      var tr = mp && relOf(mp, 'theme'), tp = tr && await part(tr.path);
      if (tp && !themes[tr.path]) themes[tr.path] = theme(tp.xml);
      var th = tp ? themes[tr.path] : { scheme: {}, bgFills: [], fills: [], font: {} };
      var map = Object.assign({}, mp ? clrMap(mp.xml) : {}, lp ? clrMap(lp.xml) : {}, clrMap(sp.xml));
      if (!Object.keys(map).length) map = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' };
      var ctx = { scheme: th.scheme, map: map, theme: th };
      var bg = bgOf(sp, ctx) || (lp && bgOf(lp, ctx)) || (mp && bgOf(mp, ctx)) || { kind: 'solid', color: th.scheme[map.bg1 || 'lt1'] || '#FFFFFF' };
      if (bg.kind === 'image' && bg.path) bg = { kind: 'image', over: { path: bg.path, rect: slideRect, crop: { l: 0, t: 0, r: 0, b: 0 } } };
      var masterStyles = mp ? { title: block('p:titleStyle', mp.xml), body: block('p:bodyStyle', mp.xml), other: block('p:otherStyle', mp.xml) } : {};
      var tree = block('p:spTree', sp.xml), gs = groups(tree);

      // Immagini, in ordine di sovrapposizione, con riquadro e ritaglio
      var pics = all(/<p:pic[\s>][\s\S]*?<\/p:pic>/g, tree).map(function (m) {
        var s = m[0], e = first(/<a:blip\s[^>]*r:embed="([^"]+)"/, s), r = e && sp.rels[e[1]];
        if (!r || r.external || /<a:(videoFile|audioFile)\s/.test(s)) return null;
        var src = (first(/<a:srcRect\s[^>]*>/, s) || [''])[0], crop = {};
        ['l', 't', 'r', 'b'].forEach(function (k) { crop[k] = (+(attr(src, k) || 0)) / 100000; });
        return { at: m.index, path: r.path, rect: place(xfrm(s), m.index, gs), crop: crop };
      }).filter(Boolean);

      all(/<p:sp[\s>][\s\S]*?<\/p:sp>/g, tree).forEach(function (m) {
        var s = m[0], body = block('p:txBody', s);
        if (!body || !X.text(body).trim()) return;
        var ph = phInfo(s), lph = findPh(lp, ph), mph = findPh(mp, ph);
        var name = attr((first(/<p:cNvPr\s[^>]*>/, s) || [''])[0], 'name') || '';
        var rect = place(xfrm(s), m.index, gs) || xfrm(lph) || xfrm(mph);
        // Cosa c'è subito dietro il testo: il riempimento della forma, altrimenti un'immagine sotto, altrimenti lo sfondo della slide
        var spPr = block('p:spPr', s), own = fill(spPr.replace(/<a:ln[\s\S]*?<\/a:ln>/g, ''), ctx);
        if (!own) {
          var fr = first(/<a:fillRef\s[^>]*idx="(\d+)"[^>]*>([\s\S]*?)<\/a:fillRef>/, block('p:style', s));
          if (fr && +fr[1] > 0) { var fk = th.fills[+fr[1] - 1], fc = colour(fr[2], ctx); own = fk === 'solidFill' && fc ? { kind: 'solid', color: fc } : (fk ? { kind: fk === 'gradFill' ? 'gradient' : 'pattern' } : null); }
        }
        if (!own && lph) own = fill(block('p:spPr', lph).replace(/<a:ln[\s\S]*?<\/a:ln>/g, ''), ctx);
        var behind;
        if (own && own.kind === 'image') { var rr = own.embed && sp.rels[own.embed]; behind = rr ? { kind: 'image', over: { path: rr.path, rect: rect, crop: { l: 0, t: 0, r: 0, b: 0 } } } : { kind: 'unknown' }; }
        else if (own && own.kind !== 'none') behind = own;
        else {
          var under = pics.filter(function (p) { return p.at < m.index && overlap(rect, p.rect) > 0.3; }).pop();
          behind = under ? { kind: 'image', over: under } : bg;
        }
        var title = ph && /title/i.test(ph.type);
        var styleBase = ph ? (title ? masterStyles.title : (/^(body|subTitle|obj)$/.test(ph.type) ? masterStyles.body : masterStyles.other)) : defaultStyle;
        var fontRef = first(/<a:fontRef\s[^>]*>([\s\S]*?)<\/a:fontRef>/, block('p:style', s)), refColour = fontRef && colour(fontRef[1], ctx);
        var scale = first(/<a:normAutofit\s[^>]*fontScale="(\d+)"/, block('a:bodyPr', s) || body);
        var k = scale ? +scale[1] / 100000 : 1, groupsBy = {};
        all(/<a:p>[\s\S]*?<\/a:p>/g, body).forEach(function (pm) {
          var p = pm[0], lvl = +(attr((first(/<a:pPr\s[^>]*>/, p) || [''])[0], 'lvl') || 0) + 1;
          var sources = [level(block('a:lstStyle', s), lvl, ctx), level(block('a:lstStyle', lph), lvl, ctx), level(block('a:lstStyle', mph), lvl, ctx),
            refColour ? { fill: { kind: 'solid', color: refColour } } : null, level(styleBase, lvl, ctx), level(defaultStyle, lvl, ctx)];
          all(/<a:r>([\s\S]*?)<\/a:r>/g, p).forEach(function (rm) {
            var r = rm[1], t = first(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/, r);
            if (!t) return;
            var pr = first(/<a:rPr((?:\s[^>]*?)?)(?:\/>|>([\s\S]*?)<\/a:rPr>)/, r), a = pr ? pr[1] : '', inner = pr && pr[2] || '';
            var f = fill(inner.replace(/<a:ln[\s\S]*?<\/a:ln>|<a:highlight>[\s\S]*?<\/a:highlight>/g, ''), ctx) || pick(sources, 'fill') || { kind: 'solid', color: th.scheme[map.tx1 || 'dk1'] || '#000000' };
            var size = (attr(a, 'sz') ? +attr(a, 'sz') / 100 : pick(sources, 'size') || 18) * k;
            var bold = attr(a, 'b') !== null ? /^(1|true)$/.test(attr(a, 'b')) : !!pick(sources, 'bold');
            var lat = first(/<a:latin\s[^>]*typeface="([^"]+)"/, inner), font = lat ? unxml(lat[1]) : (pick(sources, 'font') || (title ? '+mj-lt' : '+mn-lt'));
            font = th.font[font] || font;
            var key = [font, f.kind === 'solid' ? f.color : f.kind, Math.round(size * 10), bold].join('|');
            var gr = groupsBy[key] = groupsBy[key] || { font: font, color: f.kind === 'solid' ? f.color : null, colorKind: f.kind, size: Math.round(size * 10) / 10, bold: bold, text: '' };
            gr.text += unxml(t[1]);
          });
          Object.keys(groupsBy).forEach(function (q) { groupsBy[q].text += ' '; });
        });
        Object.keys(groupsBy).forEach(function (q) {
          var gr = groupsBy[q], said = gr.text.replace(/\s+/g, ' ').trim();
          if (!said || gr.colorKind === 'none') return;
          res.texts.push({ slide: num, shape: name, title: !!title, text: said.length > 80 ? said.slice(0, 79) + '…' : said,
            font: gr.font, color: gr.color, size: gr.size, bold: gr.bold, rect: rect, behind: behind });
        });
      });

      // Colori delle serie dei grafici (solo riempimenti espliciti)
      var charts = X.list(sp.rels).filter(function (r) { return r.type === 'chart' && r.path; });
      for (var c = 0; c < charts.length; c++) {
        var cx = await X.read(zip, charts[c].path), colours = [];
        all(/<c:ser>([\s\S]*?)<\/c:ser>/g, cx).forEach(function (sm) {
          var serPr = block('c:spPr', sm[1].replace(/<c:dPt>[\s\S]*?<\/c:dPt>/g, '')), f = fill(serPr, ctx);
          if (f && f.kind === 'solid') colours.push(f.color);
          all(/<c:dPt>([\s\S]*?)<\/c:dPt>/g, sm[1]).forEach(function (dm) { var d = fill(block('c:spPr', dm[1]), ctx); if (d && d.kind === 'solid') colours.push(d.color); });
        });
        var frame = all(/<p:graphicFrame[\s>][\s\S]*?<\/p:graphicFrame>/g, tree).filter(function (fm) { return fm[0].indexOf('r:id="' + Object.keys(sp.rels).filter(function (id) { return sp.rels[id] === charts[c]; })[0] + '"') > 0; })[0];
        res.charts.push({ slide: num, name: frame ? attr((first(/<p:cNvPr\s[^>]*>/, frame[0]) || [''])[0], 'name') : charts[c].path.split('/').pop(), colors: colours });
      }
    }
    return res;
  }

  CL.textsPptx = textsPptx;
})(window);

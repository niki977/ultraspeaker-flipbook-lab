/*
 * The Ultraspeaker Check Lab — kit.js
 * Crea nel browser i kit «Test in sala» come presentazioni PowerPoint separate, da un modello
 * 16:9 vuoto (assets/kit/template.pptx): un file per slide, una slide d'introduzione e la tabella
 * dei risultati, il logo The Ultraspeaker in basso a destra. Video e audio partono da soli dopo la transizione.
 * Testo in Arial, così i kit si leggono uguali su qualsiasi computer della regia. La presentazione del relatore non si tocca.
 */
(function (g) {
  'use strict';
  var CL = g.CheckLab = g.CheckLab || {};

  var NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  var REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  var MIME = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff', svg: 'image/svg+xml',
    emf: 'image/x-emf', wmf: 'image/x-wmf', heic: 'image/heic', webp: 'image/webp', avif: 'image/avif', wdp: 'image/vnd.ms-photo', jfif: 'image/jpeg',
    mp4: 'video/mp4', m4v: 'video/x-m4v', mov: 'video/quicktime', wmv: 'video/x-ms-wmv', asf: 'video/x-ms-asf', avi: 'video/x-msvideo', mpg: 'video/mpeg', mpeg: 'video/mpeg', '3gp': 'video/3gpp',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', wma: 'audio/x-ms-wma', aac: 'audio/aac', aif: 'audio/x-aiff', aiff: 'audio/x-aiff'
  };
  var IN = 914400; // EMU per pollice

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function extOf(name) { return String(name).split('.').pop().toLowerCase(); }
  function xfrm(x, y, w, h) { return '<a:xfrm><a:off x="' + Math.round(x) + '" y="' + Math.round(y) + '"/><a:ext cx="' + Math.round(w) + '" cy="' + Math.round(h) + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'; }
  function para(text, size, color, bold, lang, align) {
    return '<a:p><a:pPr algn="' + (align || 'l') + '"><a:spcBef><a:spcPts val="' + (size > 14 ? 600 : 300) + '"/></a:spcBef></a:pPr><a:r><a:rPr lang="' + lang + '" sz="' + size * 100 + '"' + (bold ? ' b="1"' : '') + '>' +
      '<a:solidFill><a:srgbClr val="' + (color || 'FFFFFF') + '"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>' + esc(text) + '</a:t></a:r></a:p>';
  }
  function box(id, x, y, w, h, paras) {
    return '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="Text ' + id + '"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>' + xfrm(x, y, w, h) + '<a:noFill/></p:spPr>' +
      '<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0"><a:normAutofit/></a:bodyPr><a:lstStyle/>' + paras.join('') + '</p:txBody></p:sp>';
  }
  function slideXml(shapes, timing) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:sld ' + NS + '><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>' +
      '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>' + shapes.join('') + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>' + (timing || '') + '</p:sld>';
  }

  /* opts: kind ('video'|'image'), title, intro [righe], items, t, lang, template, poster e logo (byte PNG) */
  async function build(opts) {
    var t = opts.t, lang = opts.lang, zip = await new g.JSZip().loadAsync(opts.template);
    var types = {}, n = 0, slides = [];
    function addFile(bytes, ext) {
      var name = 'file' + (++n) + '.' + ext;
      zip.file('ppt/media/' + name, bytes, { compression: 'STORE' });
      types[ext] = MIME[ext] || 'application/octet-stream';
      return '../media/' + name;
    }
    function header(right) {
      var tag = 'THE ULTRASPEAKER · CHECK LAB' + (right ? ' · ' + t(opts.kind === 'video' ? 'kit.video.tag' : 'kit.image.tag') : '');
      return [box(2, 0.5 * IN, 0.35 * IN, 9 * IN, 0.4 * IN, [para(tag, 12, '8E8E8E', true, lang)])].concat(right ? [box(3, 10.3 * IN, 0.3 * IN, 2.53 * IN, 0.5 * IN, [para(right, 22, null, true, lang, 'r')])] : []);
    }
    var poster = addFile(opts.poster, 'png'), logo = addFile(opts.logo, 'png');
    var AW = 1.7 * IN, AH = AW * 324 / 1600; // ultraspeaker-logo.png è 1600×324
    var mark = '<p:pic><p:nvPicPr><p:cNvPr id="90" name="The Ultraspeaker" descr="The Ultraspeaker"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>' +
      '<p:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>' + xfrm(13.333 * IN - 0.5 * IN - AW, 7.5 * IN - 0.4 * IN - AH, AW, AH) + '</p:spPr></p:pic>';

    slides.push({ shapes: header().concat([
      box(4, 0.5 * IN, 1.1 * IN, 12.3 * IN, 1.2 * IN, [para(opts.title, 44, null, true, lang)]),
      box(5, 0.5 * IN, 2.5 * IN, 11.5 * IN, 3.8 * IN, opts.intro.map(function (l, k) { return para(l, 20, k ? 'D0D0D0' : null, false, lang); }))]), rels: [] });

    // Una slide per file: il file a sinistra (proporzioni mantenute), cos'è e cosa controllare a destra
    for (var i = 0; i < opts.items.length; i++) {
      var it = opts.items[i], target = addFile(await it.load(), it.ext), rels = [], timing = '';
      var W = 7.6 * IN, H = 4.9 * IN, r = it.width && it.height ? it.width / it.height : 16 / 9;
      var w = Math.min(W, H * r), h = w / r, x = 0.5 * IN + (W - w) / 2, y = 1.35 * IN + (H - h) / 2;
      var shapes = header((i + 1) + ' / ' + opts.items.length), pic;
      if (it.kind === 'image') {
        var svgExt = '';
        if (it.ext === 'svg') { // PowerPoint mostra l'SVG; le versioni senza SVG mostrano il PNG di riserva
          rels.push({ id: 'rId3', type: REL + 'image', target: target });
          target = addFile(it.fallback ? await it.fallback.load() : opts.poster, 'png');
          svgExt = '<a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="rId3"/></a:ext></a:extLst>';
        }
        rels.push({ id: 'rId2', type: REL + 'image', target: target });
        pic = '<p:pic><p:nvPicPr><p:cNvPr id="10" name="' + esc(it.title) + '"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>' +
          '<p:blipFill><a:blip r:embed="rId2">' + svgExt + '</a:blip><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>' + xfrm(x, y, w, h) + '</p:spPr></p:pic>';
      } else {
        var tag = it.kind === 'audio' ? 'audio' : 'video';
        rels.push({ id: 'rId2', type: 'http://schemas.microsoft.com/office/2007/relationships/media', target: target },
          { id: 'rId3', type: REL + tag, target: target }, { id: 'rId4', type: REL + 'image', target: poster });
        pic = '<p:pic><p:nvPicPr><p:cNvPr id="10" name="' + esc(it.title) + '"><a:hlinkClick r:id="" action="ppaction://media"/></p:cNvPr><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>' +
          '<p:nvPr><a:' + tag + 'File r:link="rId3"/><p:extLst><p:ext uri="{DAA4B4D4-6D71-4841-9C94-3DE7FCFB9230}"><p14:media xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" r:embed="rId2"/></p:ext></p:extLst></p:nvPr></p:nvPicPr>' +
          '<p:blipFill><a:blip r:embed="rId4"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>' + xfrm(x, y, w, h) + '</p:spPr></p:pic>';
        // Parte da solo dopo la transizione (PowerPoint: Riproduzione › Avvio › Automaticamente); un clic lo mette in pausa
        var ms = Math.max(1000, Math.round((it.duration || 6) * 1000));
        timing = '<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>' +
          '<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst><p:par><p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst><p:childTnLst>' +
          '<p:par><p:cTn id="4" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="5" presetID="1" presetClass="mediacall" presetSubtype="0" fill="hold" nodeType="afterEffect"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>' +
          '<p:cmd type="call" cmd="playFrom(0.0)"><p:cBhvr><p:cTn id="6" dur="' + ms + '" fill="hold"/><p:tgtEl><p:spTgt spid="10"/></p:tgtEl></p:cBhvr></p:cmd></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn>' +
          '<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>' +
          '<p:' + tag + '><p:cMediaNode vol="80000"><p:cTn id="7" fill="hold" display="0"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="10"/></p:tgtEl></p:cMediaNode></p:' + tag + '>' +
          '</p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>';
      }
      shapes.push(pic,
        box(11, 8.55 * IN, 1.35 * IN, 4.25 * IN, 3 * IN, [para(it.title, 26, null, true, lang)].concat(it.lines.map(function (l) { return para(l, 15, 'D0D0D0', false, lang); }))),
        box(13, 8.55 * IN, 4.65 * IN, 4.25 * IN, 1.6 * IN, [para(it.check, 16, null, false, lang)]));
      slides.push({ shapes: shapes, rels: rels, timing: timing });
    }

    // Tabella dei risultati da compilare durante la prova
    slides.push({ shapes: header().concat([
      box(4, 0.5 * IN, 0.9 * IN, 12.3 * IN, 0.8 * IN, [para(t('kit.final.title'), 32, null, true, lang)]),
      box(5, 0.5 * IN, 1.8 * IN, 12.3 * IN, 4.6 * IN, opts.items.map(function (it, k) {
        return para((k + 1) + '.  ' + it.title + '      [   ] ' + t('kit.final.ok') + '     [   ] ' + t('kit.final.ko'), opts.items.length > 12 ? 12 : 16, null, false, lang);
      })),
      box(6, 0.5 * IN, 6.6 * IN, 11.2 * IN, 0.6 * IN, [para(t('kit.final.help'), 13, '8E8E8E', false, lang)])]), rels: [] });

    // Registra le slide nel pacchetto
    var ids = '', presRels = '', overrides = '';
    slides.forEach(function (s, k) {
      var num = k + 1, rels = [{ id: 'rId1', type: REL + 'slideLayout', target: '../slideLayouts/slideLayout7.xml' }, { id: 'rIdLogo', type: REL + 'image', target: logo }].concat(s.rels); // layout 7 = vuoto
      zip.file('ppt/slides/slide' + num + '.xml', slideXml(s.shapes.concat(mark), s.timing));
      zip.file('ppt/slides/_rels/slide' + num + '.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        rels.map(function (r) { return '<Relationship Id="' + r.id + '" Type="' + r.type + '" Target="' + r.target + '"/>'; }).join('') + '</Relationships>');
      ids += '<p:sldId id="' + (256 + k) + '" r:id="rIdS' + num + '"/>';
      presRels += '<Relationship Id="rIdS' + num + '" Type="' + REL + 'slide" Target="slides/slide' + num + '.xml"/>';
      overrides += '<Override PartName="/ppt/slides/slide' + num + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>';
    });
    var pres = await zip.file('ppt/presentation.xml').async('string');
    zip.file('ppt/presentation.xml', pres.replace('</p:sldMasterIdLst>', '</p:sldMasterIdLst><p:sldIdLst>' + ids + '</p:sldIdLst>').replace(' type="screen4x3"', ''));
    var pr = await zip.file('ppt/_rels/presentation.xml.rels').async('string');
    zip.file('ppt/_rels/presentation.xml.rels', pr.replace('</Relationships>', presRels + '</Relationships>'));
    var ct = await zip.file('[Content_Types].xml').async('string');
    Object.keys(types).forEach(function (ext) { if (ct.indexOf('Extension="' + ext + '"') < 0) ct = ct.replace('<Default ', '<Default Extension="' + ext + '" ContentType="' + types[ext] + '"/><Default '); });
    zip.file('[Content_Types].xml', ct.replace('</Types>', overrides + '</Types>'));
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  }

  /* ---------- Il modello della scheda Stile ----------
     opts: template (byte), bg, fg, accent, font, sizes {title, text, caption} in punti, wide (16:9, altrimenti 4:3), lang, texts {title, sub, head, body}
     Tema: testo = dk1/dk2, sfondo = lt1/lt2, evidenziazione = accent1 e link; font nello schema dei caratteri; grandezze nello schema; due slide per iniziare. */
  async function template(o) {
    var zip = await new g.JSZip().loadAsync(o.template), k = o.wide ? 1 : 9144000 / 12192000;
    var clr = function (c) { return '<a:srgbClr val="' + c.slice(1) + '"/>'; };
    var th = await zip.file('ppt/theme/theme1.xml').async('string');
    [['dk1', o.fg], ['lt1', o.bg], ['dk2', o.fg], ['lt2', o.bg], ['accent1', o.accent], ['hlink', o.accent], ['folHlink', o.accent]].forEach(function (x) {
      th = th.replace(new RegExp('<a:' + x[0] + '>[\\s\\S]*?</a:' + x[0] + '>'), '<a:' + x[0] + '>' + clr(x[1]) + '</a:' + x[0] + '>');
    });
    th = th.replace(/<a:clrScheme name="[^"]*"/, '<a:clrScheme name="Check Lab"').replace(/<a:fontScheme name="[^"]*"/, '<a:fontScheme name="Check Lab"')
      .replace(/(<a:majorFont>\s*<a:latin typeface=")[^"]*"/, '$1' + esc(o.font) + '"').replace(/(<a:minorFont>\s*<a:latin typeface=")[^"]*"/, '$1' + esc(o.font) + '"');
    zip.file('ppt/theme/theme1.xml', th);
    // Grandezze: titolo, testo, poi livelli più piccoli, mai sotto il minimo delle didascalie
    var z = o.sizes, ms = await zip.file('ppt/slideMasters/slideMaster1.xml').async('string');
    function sizes(style, list) {
      return style.replace(/<a:lvl(\d)pPr([^>]*)>([\s\S]*?)<\/a:lvl\1pPr>/g, function (m, n, at, body) {
        return '<a:lvl' + n + 'pPr' + at + '>' + body.replace(/(<a:defRPr[^>]*\ssz=")\d+"/, '$1' + Math.round(list[Math.min(+n, list.length) - 1] * 100) + '"') + '</a:lvl' + n + 'pPr>';
      });
    }
    ms = ms.replace(/<p:titleStyle>[\s\S]*?<\/p:titleStyle>/, function (m) { return sizes(m, [z.title]); })
      .replace(/<p:bodyStyle>[\s\S]*?<\/p:bodyStyle>/, function (m) { return sizes(m, [z.text, Math.max(z.caption, Math.round(z.text * 0.875)), z.caption]); });
    var files = Object.keys(zip.files).filter(function (n) { return /^ppt\/(slideMasters|slideLayouts)\/[^/]+\.xml$/.test(n); });
    var pres = await zip.file('ppt/presentation.xml').async('string');
    pres = pres.replace(/<p:sldSz[^>]*\/>/, '<p:sldSz cx="' + (o.wide ? 12192000 : 9144000) + '" cy="6858000"/>');
    for (var i = 0; i < files.length; i++) {
      var x = files[i] === 'ppt/slideMasters/slideMaster1.xml' ? ms : await zip.file(files[i]).async('string');
      if (k !== 1) x = x.replace(/(<a:off x=")(-?\d+)/g, function (m, p, v) { return p + Math.round(v * k); }).replace(/(<a:ext cx=")(\d+)/g, function (m, p, v) { return p + Math.round(v * k); });
      zip.file(files[i], x);
    }
    // Due slide: titolo, e titolo con contenuto
    function ph(id, type, idx, paras) {
      return '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="' + (type || 'Content') + ' ' + id + '"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph' + (type ? ' type="' + type + '"' : '') + (idx ? ' idx="' + idx + '"' : '') + '/></p:nvPr></p:nvSpPr><p:spPr/>' +
        '<p:txBody><a:bodyPr/><a:lstStyle/>' + paras.map(function (p) { return '<a:p><a:r><a:rPr lang="' + o.lang + '"/><a:t>' + esc(p) + '</a:t></a:r></a:p>'; }).join('') + '</p:txBody></p:sp>';
    }
    var slides = [[1, [ph(2, 'ctrTitle', 0, [o.texts.title]), ph(3, 'subTitle', 1, [o.texts.sub])]], [2, [ph(2, 'title', 0, [o.texts.head]), ph(3, '', 1, o.texts.body.split('\n'))]]];
    var ids = '', presRels = '', overrides = '';
    slides.forEach(function (sl, j) {
      var num = j + 1;
      zip.file('ppt/slides/slide' + num + '.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:sld ' + NS + '><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>' +
        sl[1].join('') + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>');
      zip.file('ppt/slides/_rels/slide' + num + '.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + REL + 'slideLayout" Target="../slideLayouts/slideLayout' + sl[0] + '.xml"/></Relationships>');
      ids += '<p:sldId id="' + (256 + j) + '" r:id="rIdS' + num + '"/>';
      presRels += '<Relationship Id="rIdS' + num + '" Type="' + REL + 'slide" Target="slides/slide' + num + '.xml"/>';
      overrides += '<Override PartName="/ppt/slides/slide' + num + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>';
    });
    zip.file('ppt/presentation.xml', pres.replace('</p:sldMasterIdLst>', '</p:sldMasterIdLst><p:sldIdLst>' + ids + '</p:sldIdLst>'));
    var pr = await zip.file('ppt/_rels/presentation.xml.rels').async('string');
    zip.file('ppt/_rels/presentation.xml.rels', pr.replace('</Relationships>', presRels + '</Relationships>'));
    var ct = await zip.file('[Content_Types].xml').async('string');
    zip.file('[Content_Types].xml', ct.replace('</Types>', overrides + '</Types>'));
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  }

  /* ---------- Cosa va in ogni kit ---------- */
  function size(b) { return b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1048576).toFixed(1) + ' MB'; }
  function from(slides, t) { return slides.length ? [t('kit.from', { slides: slides.join(', ') })] : []; }
  function loader(zip, path) { return function () { return zip.file(path).async('uint8array'); }; }

  function myVideos(zip, res, t) {
    return res.media.filter(function (m) { return !m.external && !m.missing; }).map(function (m) {
      var i = m.info, s = Math.round(i.duration);
      var tech = [(i.video || i.audio).codec, i.format.toUpperCase(), i.width ? i.width + '×' + i.height : '', s ? Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2) : '', size(m.bytes)];
      return { title: m.name, kind: m.kind, ext: extOf(m.path), width: i.width, height: i.height, duration: i.duration, load: loader(zip, m.path),
        lines: from(m.slides, t).concat([tech.filter(Boolean).join(' · ')], i.audio ? [t('kit.audio', { codec: i.audio.codec })] : []),
        check: t(m.kind === 'audio' ? 'kit.check.audio' : 'kit.check.video') };
    });
  }

  /* Immagini citate in un avviso, formati a rischio e le tre foto a risoluzione più bassa */
  function myImages(zip, res, ev, t) {
    var named = {};
    ev.issues.forEach(function (iss) { if (iss.cat === 'images') iss.items.forEach(function (x) { named[x.name] = 1; }); });
    var images = res.images.filter(function (im) { return !im.poster && !/^(pdf|eps)$/.test(im.info.format); });
    var risky = images.filter(function (im) { return named[im.name] || im.info.cmyk || /svg|emf|wmf|heic|webp|avif|tiff|bmp/.test(im.info.format); });
    var photos = images.filter(function (im) { return !im.info.vector && im.info.width && risky.indexOf(im) < 0; }).sort(function (a, b) { return a.info.width - b.info.width; });
    return risky.concat(photos.slice(0, 3)).map(function (im) {
      var i = im.info, fb = im.uses.filter(function (u) { return u.fallback; })[0];
      var slides = im.uses.map(function (u) { return u.slide; }).filter(function (v, k, a) { return a.indexOf(v) === k; });
      return { title: im.name, kind: 'image', ext: extOf(im.path), width: i.width, height: i.height, load: loader(zip, im.path),
        lines: from(slides, t).concat([[i.format.toUpperCase() + (i.cmyk ? ' CMYK' : ''), i.width ? Math.round(i.width) + '×' + Math.round(i.height) + ' px' : t('kit.vector'), size(i.bytes)].join(' · ')]),
        check: t(i.format === 'svg' ? 'kit.check.svg' : 'kit.check.image'),
        fallback: fb && zip.file(fb.fallback) ? { load: loader(zip, fb.fallback) } : null };
    });
  }

  /* Kit generici: i file di esempio del Check Lab in assets/kit/ */
  var GENERIC = {
    video: 'v1:v1-h264.mp4:1920:1080 v2:v2-hevc.mp4:1920:1080 v3:v3-h264.mov:1920:1080 v4:v4-prores.mov:1920:1080 v5:v5-wmv.wmv:1280:720 v6:v6-4k.mp4:3840:2160 a1:a1-stereo.mp3:1920:1080',
    image: 'png:i01-png.png jpeg:i02-jpeg.jpg svg:i03-svg.svg emf:i04-emf.emf heic:i05-heic.heic webp:i06-webp.webp tiff:i07-tiff.tif cmyk:i08-cmyk.jpg gif:i09-gif.gif'
  };
  function genericItems(kind, fetchAsset, t) {
    return GENERIC[kind].split(' ').map(function (s) {
      var p = s.split(':'), key = p[0], file = p[1], audio = key === 'a1';
      return { title: t('kit.g.' + key + '.title'), lines: [t('kit.g.' + key + '.desc')], kind: kind === 'image' ? 'image' : (audio ? 'audio' : 'video'), ext: extOf(file),
        width: +p[2] || 1920, height: +p[3] || 1080, duration: 6, load: function () { return fetchAsset(file); },
        check: t(audio ? 'kit.check.stereo' : (key === 'svg' ? 'kit.check.svg' : (kind === 'video' ? 'kit.check.video' : 'kit.check.image'))),
        fallback: key === 'svg' ? { load: function () { return fetchAsset('i03-svg-fallback.png'); } } : null };
    });
  }

  CL.kit = { build: build, template: template, myVideos: myVideos, myImages: myImages, genericItems: genericItems };
})(window);

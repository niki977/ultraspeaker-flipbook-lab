/*
 * The Ultraspeaker Check Lab — evaluate.js
 * Trasforma i dati raccolti dai lettori nel report: Critico, Attenzione, OK.
 * Nessun punteggio: il relatore può cambiare la valutazione di ogni voce (ui.js). I testi stanno nelle traduzioni, per id.
 */
(function (g) {
  'use strict';
  var CL = g.CheckLab = g.CheckLab || {};

  var ROOMS = { '16:9': [1920, 1080], '16:10': [1920, 1200], '4:3': [1400, 1050], '3:1': [3840, 1280], unknown: [1920, 1080] };
  CL.DEFAULT_SETTINGS = { venueOS: 'unknown', hostOS: 'unknown', minutes: '', room: '16:9', warnMB: 500, critMB: 1000, minSec: 20, paceSec: 40,
    light: 'penombra', rows: '', scrH: '', rowD: '', style: null }; // rows: chiesta prima del primo controllo, '' = non scelta

  function aspectLabel(w, h) {
    if (!w || !h) return '?';
    var r = w / h, known = { '16:9': 16 / 9, '16:10': 1.6, '4:3': 4 / 3, '3:1': 3, '3:2': 1.5, '1:1': 1 };
    for (var k in known) if (Math.abs(r - known[k]) / known[k] < 0.02) return k;
    return r.toFixed(2) + ':1';
  }
  function mb(b) { return b / 1048576; }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }).sort(function (x, y) { return x - y; }); }
  function slidesOf(items) { return [].concat.apply([], items.map(function (x) { return x.slides || []; })); }
  function px(i) { return Math.round(i.width) + '×' + Math.round(i.height); }

  function evaluate(res, settings) {
    var st = Object.assign({}, CL.DEFAULT_SETTINGS);
    Object.keys(settings || {}).forEach(function (k) { if (settings[k] !== undefined && settings[k] !== null) st[k] = settings[k]; });
    var isKey = res.type === 'key';
    // Sistema che mostrerà il file; un Keynote si proietta sempre da un Mac, salvo regia Windows
    var os = st.venueOS === 'own' ? (isKey ? 'mac' : st.hostOS) : st.venueOS;
    if (os !== 'win' && os !== 'mac') os = 'unknown';
    var onMac = os === 'mac' || (isKey && st.venueOS !== 'win');
    var room = ROOMS[st.room] || ROOMS.unknown, roomRatio = st.room === 'unknown' ? 0 : room[0] / room[1];
    var visible = res.slides.filter(function (s) { return s.hidden !== true; }).length;
    var issues = [];
    function add(sev, cat, id, params, slides, items) {
      issues.push({ sev: sev, cat: cat, id: id, params: params || {}, slides: uniq(slides || []), items: items || [] });
    }
    function group(sev, cat, id, items, params) {
      if (items.length) add(sev, cat, id, Object.assign({ count: items.length }, params), slidesOf(items), items);
    }
    // Problema critico su una piattaforma, avviso se la piattaforma non è nota
    function platformRisk(badOn, cat, id, p, slides, items) {
      if (os === badOn || (isKey && badOn === 'mac')) add('crit', cat, id, p, slides, items);
      else if (os === 'unknown') add('warn', cat, id, p, slides, items);
    }

    /* Keynote sul computer della regia */
    if (isKey) add(st.venueOS === 'win' ? 'crit' : (st.venueOS === 'unknown' ? 'warn' : 'ok'), 'format', st.venueOS === 'win' ? 'key_windows' : (st.venueOS === 'unknown' ? 'key_unknown' : 'key_mac'));

    /* Font: i lettori elencano solo quelli del testo visibile (la stima Keynote, res.limited, elenca tutti i font degli stili) */
    var limited = !!res.limited;
    var fonts = res.fonts.map(function (f) {
      return { name: f.name, uses: f.uses, cls: CL.fonts.classify(f.name),
        embedded: res.embeddedFonts.some(function (e) { return CL.fonts.norm(e) === CL.fonts.norm(f.name); }) };
    });
    fonts.forEach(function (f) {
      var p = { name: f.name };
      // Dove si usa il font: slide, nome della forma come nel Riquadro di selezione, testo
      var uses = f.uses.map(function (u) { return { name: u.shape, kind: u.kind, slides: [u.slide], text: u.text }; });
      var slides = f.uses.map(function (u) { return u.slide; });
      if (isKey) { if (f.cls === 'custom' || f.cls === 'win') add(st.venueOS === 'own' ? 'ok' : 'crit', 'fonts', st.venueOS === 'own' ? 'key_font_own' : 'key_font_custom', p, slides, uses); }
      else if (f.embedded || f.cls === 'office') return;
      else if (st.venueOS === 'own') add('ok', 'fonts', 'font_own', p, slides, uses); // si presenta dal computer dove i font sono installati
      else if (f.cls === 'custom') add('crit', 'fonts', 'font_custom', p, slides, uses);
      else platformRisk(f.cls === 'mac' ? 'win' : 'mac', 'fonts', f.cls === 'mac' ? 'font_mac' : 'font_win', p, slides, uses);
    });
    if (!issues.some(function (i) { return i.cat === 'fonts'; })) add('ok', 'fonts', isKey ? 'key_fonts_ok' : 'fonts_ok', { count: fonts.length });
    if (res.fontsUnreadable) add('warn', 'fonts', 'key_fonts_unreadable');

    /* Video e audio */
    var videos = res.media.filter(function (m) { return m.kind === 'video'; }), embedded = videos.filter(function (m) { return !m.external; });
    var totalVideo = embedded.reduce(function (a, m) { return a + (m.bytes || 0); }, 0);
    res.media.forEach(function (m) {
      if (m.external) { add('crit', 'media', m.online ? 'media_online' : 'media_linked', { name: m.name }, m.slides); return; }
      var i = m.info, v = i.video || {}, p = { name: m.name, codec: v.codec || '', res: i.width ? px(i) : '' };
      if (m.kind === 'audio') { if (i.format === 'wma') platformRisk('mac', 'media', 'audio_wma', p, m.slides); return; }
      var h264 = /^avc[13]$/.test(v.fourcc) || v.codec === 'H.264';
      if (i.format === 'wmv') platformRisk('mac', 'media', 'video_wmv', p, m.slides);
      else if (/ProRes|DV|Motion JPEG|Uncompressed|Animation|HDV|Cinepak|Sorenson|PNG sequence/.test(v.codec)) add(onMac ? 'warn' : 'crit', 'media', 'video_pro', p, m.slides);
      else if (/^(hvc1|hev1)$/.test(v.fourcc)) { if (!onMac) add('warn', 'media', 'video_hevc', p, m.slides); }
      else if (h264 && i.format === 'mov') { if (!isKey) add('warn', 'media', 'video_mov', p, m.slides); }
      else if (!h264) add('warn', 'media', 'video_legacy', p, m.slides);
      if (i.width > 1920 || i.height > 1200) add('warn', 'media', 'video_4k', p, m.slides);
      if (i.incomplete) add('warn', 'media', 'video_incomplete', p, m.slides);
    });
    add('ok', 'media', 'media_summary', { videos: videos.length, embedded: embedded.length, audios: res.media.length - videos.length, mb: mb(totalVideo).toFixed(0) }, [],
      embedded.map(function (m) { return { name: m.name, mb: mb(m.bytes || 0).toFixed(1), codec: m.info.video ? m.info.video.codec : '?', slides: m.slides }; }));

    /* Immagini: risoluzione rispetto alla misura sullo schermo della sala, peso, ritagli, formati a rischio */
    var scale = res.slideW && !limited ? Math.min(room[0] / res.slideW, room[1] / res.slideH) : 0;
    var lowres = [], heavy = [], cropped = [], saving = 0, croppedBytes = 0;
    var fmt = { eps: [], emf: [], modern: [], tiff: [], cmyk: [], svg: [], pdf: [] };
    var images = res.images.filter(function (im) { return !im.poster; });
    images.forEach(function (im) {
      var i = im.info, f = i.format, uses = im.uses, slides = uniq(uses.map(function (u) { return u.slide; }));
      var item = { name: im.name, slides: slides };
      if (f === 'eps') fmt.eps.push(item);
      if ((f === 'emf' || f === 'wmf') && (os !== 'win' || isKey)) fmt.emf.push(item);
      if (/^(heic|avif|webp)$/.test(f) && !(isKey && st.venueOS !== 'win')) fmt.modern.push({ name: im.name, slides: slides, format: f.toUpperCase() });
      if ((f === 'tiff' || f === 'bmp') && i.bytes > 1048576) fmt.tiff.push({ name: im.name, slides: slides, format: f.toUpperCase(), mb: mb(i.bytes).toFixed(1) });
      if (i.cmyk) fmt.cmyk.push(item);
      if (f === 'pdf' && isKey) fmt.pdf.push(item);
      if (i.vector) {
        // SVG: le versioni meno recenti di PowerPoint mostrano il PNG di riserva salvato accanto
        uses.forEach(function (u) {
          var fb = u.svg && scale && res.images.filter(function (x) { return x.path === u.fallback; })[0];
          if (fb && u.cx && fb.info.width && fb.info.width / (u.cx * scale) < 0.66) fmt.svg.push({ name: im.name, slides: [u.slide], px: fb.info.width, need: Math.round(u.cx * scale) });
        });
        return;
      }
      if (!i.width) return;
      var need = 0; // la misura più grande, in pixel, a cui verrà mostrata l'immagine intera
      if (limited) {
        need = room[0];
        if (i.width < room[0] / 2 && i.bytes > 8192) lowres.push({ name: im.name, slides: [], px: px(i), need: room[0] });
      } else if (scale) uses.forEach(function (u) {
        if (!u.cx) return;
        var visW = 1 - u.crop.l - u.crop.r, visH = 1 - u.crop.t - u.crop.b, shown = u.cx * scale;
        if (visW > 0) need = Math.max(need, shown / visW);
        if (shown >= 240 && i.width * visW / shown < 0.66) lowres.push({ name: im.name, slides: [u.slide], px: px(i), need: Math.round(shown) });
        var hidden = 1 - Math.max(0, visW) * Math.max(0, visH);
        if (hidden > 0.3 && i.bytes > 307200) { cropped.push({ name: im.name, slides: [u.slide], pct: Math.round(hidden * 100) }); croppedBytes += i.bytes * hidden; }
      });
      if (need && i.bytes > 1048576 && i.width > need * 1.5) {
        var save = i.bytes * (1 - Math.pow(need * 1.2 / i.width, 2));
        saving += save;
        heavy.push({ name: im.name, slides: slides, mb: mb(i.bytes).toFixed(1), px: px(i), save: mb(save).toFixed(1) });
      }
    });
    group('warn', 'images', limited ? 'key_img_lowres' : 'img_lowres', lowres, { room: room[0] });
    if (mb(saving) >= 10) group('warn', 'images', 'img_heavy', heavy, { save: mb(saving).toFixed(0) });
    if (mb(croppedBytes) >= 2) group('warn', 'images', 'img_cropped', cropped, { mb: mb(croppedBytes).toFixed(0) });
    group('crit', 'images', 'img_eps', fmt.eps);
    group('warn', 'images', 'img_emf', fmt.emf);
    group('warn', 'images', 'img_modern', fmt.modern, { formats: uniq(fmt.modern.map(function (x) { return x.format; })).join(', ') });
    group('warn', 'images', 'img_tiff', fmt.tiff);
    group('warn', 'images', 'img_cmyk', fmt.cmyk);
    group('warn', 'images', 'img_svg', fmt.svg);
    group('warn', 'images', 'key_img_pdf', fmt.pdf);
    if (!issues.some(function (i) { return i.cat === 'images'; })) add('ok', 'images', 'images_ok', { count: images.length });

    /* Leggibilità: contrasto con ciò che sta dietro il testo, testo su foto, grandezza per l'ultima fila (se la sala è nota) */
    if (res.texts) {
      var C = CL.color, amb = C.LIGHT[st.light] === undefined ? C.LIGHT.penombra : C.LIGHT[st.light], rowsK = C.rows(st);
      var unitH = res.slideH / (res.fontUnit || 1), roomR = st.room === 'unknown' ? 0 : room[0] / room[1], slideR = res.slideW / res.slideH;
      var hiddenSlide = {}, unitName = res.fontUnit === 1 ? 'px' : 'pt';
      res.slides.forEach(function (sl) { if (sl.hidden) hiddenSlide[sl.index] = 1; });
      var low = [], photo = [], eye = [], small = [], fine = 0, minAll = 0, sizeOn = !!st.rows; // grandezza solo se la sala è nota
      var shownTexts = res.texts.filter(function (t) { return !hiddenSlide[t.slide]; });
      shownTexts.forEach(function (t) {
        var min = C.minSize(rowsK, CL.fonts.xHeight(t.font) || 0.5, unitH, slideR, roomR), need = t.title || t.size >= min * 1.6 ? 3 : 4.5;
        var base = { name: t.shape, kind: t.kind, slides: [t.slide], text: t.text, unit: res.fontUnit === 1 ? 'px' : 'pt' };
        minAll = Math.max(minAll, min);
        if (sizeOn && t.size && t.size < min) small.push(Object.assign({ size: Math.round(t.size), min: Math.ceil(min) }, base));
        var b = t.behind;
        if (!t.color || !b || b.kind === 'gradient' || b.kind === 'pattern' || b.kind === 'unknown') eye.push(base);
        else if (b.kind === 'solid') {
          var r = C.ratio(t.color, b.color, amb);
          if (r < need) low.push(Object.assign({ ratio: r, need: need, color: t.color, bg: b.color, fix: C.fix(t.color, b.color, need, amb), size: Math.round(t.size) }, base));
          else fine++;
        } else if (t.photo && t.photo.lums) {
          // punto peggiore = il 5% dell'area sotto il testo con meno contrasto; anche con una banda dietro il testo
          var Lt = C.lum(t.color), q = function (list, f) { var r = list.map(function (L) { return C.ratioL(Lt, L, amb); }).sort(function (x, y) { return x - y; }); return r[Math.floor(r.length * f)]; };
          var worst = q(t.photo.lums, 0.05);
          if (worst < need) photo.push(Object.assign({ ratio: worst, median: q(t.photo.lums, 0.5), band: q(t.photo.band, 0.05), bandDark: t.photo.bandDark, need: need, thumb: t.photo.thumb, color: t.color }, base));
          else fine++;
        } else eye.push(base);
      });
      low.sort(function (a, b) { return a.ratio - b.ratio; }); photo.sort(function (a, b) { return a.ratio - b.ratio; }); small.sort(function (a, b) { return a.size - b.size; });
      group('crit', 'contrast', 'contrast_low', low, { light: st.light });
      group('warn', 'contrast', 'text_on_photo', photo);
      group('warn', 'contrast', 'contrast_eye', eye);
      if (sizeOn) group('warn', 'size', 'text_small', small, { min: Math.ceil(minAll), rows: rowsK.toFixed(1).replace('.0', '').replace('.', ','), unit: unitName });
      if (!low.length && !photo.length && shownTexts.length) add('ok', 'contrast', 'contrast_ok', { count: fine, total: shownTexts.length });
      if (sizeOn && !small.length && shownTexts.length) add('ok', 'size', 'textsize_ok', { count: shownTexts.length, min: Math.ceil(minAll), unit: unitName });
      if (!sizeOn && shownTexts.length) add('ok', 'size', 'textsize_unset');
    }
    /* Grafici: serie che si distinguono solo per chi vede bene rosso e verde */
    if (res.charts && res.charts.length) {
      var CC = CL.color, blind = res.charts.filter(function (ch) {
        return ch.colors.some(function (a, i) { return ch.colors.some(function (b, j) { return j > i && CC.deltaE(a, b) > 20 && CC.deltaE(CC.deutan(a), CC.deutan(b)) < 12; }); });
      }).map(function (ch) { return { name: ch.name, slides: [ch.slide] }; });
      if (blind.length) group('warn', 'contrast', 'chart_colorblind', blind);
      else if (res.charts.some(function (ch) { return ch.colors.length > 1; })) add('ok', 'contrast', 'charts_ok');
    }

    /* Formato e struttura */
    var aspect = aspectLabel(res.slideW, res.slideH), ratio = res.slideW / res.slideH;
    if (!res.slideW) add('warn', 'format', 'format_unknown');
    else if (!roomRatio) add('ok', 'format', 'format_info', { aspect: aspect });
    else if (Math.abs(ratio - roomRatio) / roomRatio < 0.03) add('ok', 'format', 'format_match', { aspect: aspect, room: st.room });
    else add('warn', 'format', 'format_mismatch', { aspect: aspect, room: st.room, bars: ratio > roomRatio ? 'tb' : 'lr' });
    if (limited) add('ok', 'format', 'key_slides', { count: res.slides.length });
    else {
      var hidden = res.slides.filter(function (s) { return s.hidden; }).map(function (s) { return s.index; });
      var empty = res.slides.filter(function (s) { return s.empty && !s.hidden; }).map(function (s) { return s.index; });
      var notes = res.slides.filter(function (s) { return s.notes; }).length;
      if (empty.length) add('warn', 'format', 'slides_empty', { count: empty.length }, empty);
      else add('ok', 'format', 'slides_ok', { count: res.slides.length });
      if (hidden.length) add('ok', 'format', 'slides_hidden', { count: hidden.length, list: hidden.join(', ') }, hidden); // non proiettate: solo un'informazione
      add('ok', 'format', notes ? 'notes_some' : 'notes_none', { count: notes, total: res.slides.length });
    }
    var web = res.links.filter(function (l) { return l.kind === 'web'; }), files = res.links.filter(function (l) { return l.kind !== 'web'; });
    group('warn', 'format', 'links_files', files.map(function (l) { return { name: decodeURIComponent(String(l.target).split(/[\\/]/).pop()), slides: [l.slide] }; }));
    group('warn', 'format', 'links_web', web.map(function (l) { return { name: l.target, slides: [l.slide] }; }));
    if (!res.links.length && !limited) add('ok', 'format', 'links_ok');
    var fileMB = mb(res.fileBytes || 0), sizeText = fileMB < 10 ? fileMB.toFixed(1) : fileMB.toFixed(0);
    if (fileMB > st.critMB) add('crit', 'format', 'size_crit', { mb: sizeText, limit: st.critMB });
    else add(fileMB > st.warnMB ? 'warn' : 'ok', 'format', fileMB > st.warnMB ? 'size_warn' : 'size_ok', { mb: sizeText, limit: st.warnMB });

    /* Tempi */
    var minutes = parseFloat(st.minutes), est = Math.round(visible * st.paceSec / 60);
    if (!(minutes > 0)) add('ok', 'time', 'time_unset', { slides: visible, est: est });
    else {
      var sps = minutes * 60 / Math.max(1, visible), p = { slides: visible, minutes: minutes, sps: sps.toFixed(0), est: est, pace: st.paceSec, min: st.minSec };
      if (sps < st.minSec) add('warn', 'time', 'time_fast', Object.assign({ cut: Math.max(1, visible - Math.floor(minutes * 60 / st.minSec)) }, p));
      if (visible * st.paceSec > minutes * 66) add('warn', 'time', 'time_over', p);
      if (!issues.some(function (i) { return i.cat === 'time'; })) add('ok', 'time', 'time_ok', p);
    }

    function count(sev) { return issues.filter(function (i) { return i.sev === sev; }).length; }
    return {
      issues: issues, crit: count('crit'), warn: count('warn'), ok: count('ok'),
      summary: { fileName: res.fileName, fileMB: fileMB, slides: res.slides.length, visible: visible, aspect: aspect,
        videos: videos.length, audios: res.media.length - videos.length, videoMB: mb(totalVideo), fonts: fonts, limited: limited }
    };
  }

  CL.evaluate = evaluate;
})(window);

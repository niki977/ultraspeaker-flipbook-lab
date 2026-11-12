/*
 * The Ultraspeaker Check Lab — ui.js
 * Interfaccia comune al pannello di PowerPoint e alla versione web.
 * La pagina passa un oggetto «platform» (app-addin.js / app-web.js) che prende il file,
 * va a una slide, apre i link e consegna i file all'utente.
 */
(function (g) {
  'use strict';
  var CL = g.CheckLab, I = CL.i18n, t = I.t;
  var PROJECTOR_LAB = 'https://niki977.github.io/ultraspeaker-projector-lab/';
  var BASE = g.document.currentScript.src.replace(/assets\/js\/ui\.js.*$/, '');
  var STEPS = ['read', 'fonts', 'media', 'images', 'contrast', 'evaluate'];
  var WEIGHT = { read: 40, fonts: 15, media: 20, images: 15, contrast: 10, evaluate: 0 }; // quota della barra, secondo la durata tipica

  function h(s) { return String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function $(sel) { return g.document.querySelector(sel); }
  function on(sel, ev, fn) { Array.prototype.forEach.call(g.document.querySelectorAll(sel), function (el) { el.addEventListener(ev, function (e) { fn(el, e); }); }); }
  /* Memoria del browser: chiavi ultraspeaker.check.<cosa>; quelle della 1.x (ultraspeaker-checklab-<cosa>) si copiano una volta e si cancellano */
  function load(k, def) {
    try {
      var ls = g.localStorage, key = 'ultraspeaker.check.' + k, old = 'ultraspeaker-checklab-' + k;
      if (ls.getItem(key) === null && ls.getItem(old) !== null) { ls.setItem(key, ls.getItem(old)); ls.removeItem(old); }
      return JSON.parse(ls.getItem(key)) || def;
    } catch (e) { return def; }
  }
  function save(k, v) { try { g.localStorage.setItem('ultraspeaker.check.' + k, JSON.stringify(v)); } catch (e) { /* navigazione privata: non si ricorda */ } }
  function size(b) { return (b / 1048576).toFixed(b < 10485760 ? 1 : 0); }
  function fetchBytes(path) { return g.fetch(BASE + path).then(function (r) { return r.arrayBuffer(); }).then(function (b) { return new Uint8Array(b); }); }
  function base64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 32768) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
    return g.btoa(s);
  }

  var ICON = {
    lock: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="none" stroke="#7DDC8A" stroke-width="1.6" stroke-linecap="round"><rect x="3.5" y="8" width="11" height="8" rx="1.5"/><path d="M6 8V5.5a3 3 0 016 0V8"/></svg>',
    info: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="none" stroke="#8E8E8E" stroke-width="1.6" stroke-linecap="round"><circle cx="9" cy="9" r="7"/><path d="M9 8v4.5"/><path d="M9 5.5v.1"/></svg>',
    done: '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="#7DDC8A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="8"/><path d="M6.5 10.2l2.4 2.4 4.6-4.8"/></svg>',
    // Gira l'intera icona (non un tracciato dentro): il browser la anima fuori dal thread principale, fluida anche con un file grande
    run: '<svg class="cl-spin" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke-width="2" stroke-linecap="round"><circle cx="10" cy="10" r="8" stroke="#3A3A3A"/><path d="M10 2a8 8 0 018 8" stroke="#FFFFFF"/></svg>',
    todo: '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="#3A3A3A" stroke-width="2"><circle cx="10" cy="10" r="8"/></svg>',
    video: '<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" fill="none" stroke="#FFFFFF" stroke-width="1.7" stroke-linejoin="round"><rect x="2" y="5" width="13" height="12" rx="2"/><path d="M15 9.5l5-2.5v8l-5-2.5"/></svg>',
    image: '<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" fill="none" stroke="#FFFFFF" stroke-width="1.7" stroke-linejoin="round"><rect x="2.5" y="3.5" width="17" height="15" rx="2"/><circle cx="8" cy="9" r="1.8"/><path d="M3 16l5-5 4 4 3-3 4 4"/></svg>',
    projector: '<svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true" fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-linejoin="round"><rect x="4" y="11" width="20" height="14" rx="2"/><circle cx="14" cy="18" r="3.5"/><path d="M24 15l8-4v14l-8-4"/></svg>'
  };

  /* ---------- stato ---------- */
  var P;   // piattaforma
  var S = { tab: 'check', running: false, token: null, error: '', notice: '', read: 0, total: 0, steps: {}, frac: 0, pct: 0, zip: null, res: null, ev: null, kitBusy: false, kitStatus: {},
    ask: null, skipRows: false, open: {} };                      // ask: il file in attesa della domanda sulla sala; open: le parti del report aperte dal relatore
  var settings = Object.assign({}, CL.DEFAULT_SETTINGS, load('settings', {}));
  // 1.2: nessuna sala predefinita. «Sala congressi» era il vecchio valore predefinito, quindi si richiede una volta
  if ((settings.rev || 0) < 2) { if (settings.rows === 'sala') settings.rows = ''; settings.rev = 2; }
  var reviews = load('reviews', {});                              // valutazioni e note del relatore, per nome del file e voce
  var delivery = load('delivery', { date: '', time: '', room: '', surname: '', talk: '' });
  function defaultList() { return [0, 1, 2, 3, 4, 5, 6].map(function (i) { return { def: i, done: false }; }); }
  var checklist = load('checklist', null) || defaultList();
  function saveAll() { save('settings', settings); save('delivery', delivery); save('checklist', checklist); save('reviews', reviews); }
  function evaluate() { S.ev = CL.evaluate(S.res, Object.assign({}, settings, { hostOS: P.hostOS })); }
  var stileCtx = { t: t, h: h, I: I, settings: settings, saveAll: function () { saveAll(); }, render: function () { render(); }, field: function (l, c) { return field(l, c); },
    asset: function (n) { return asset(n); }, copy: function (text, btn) { copy(text, btn); }, reevaluate: function () { if (S.res) evaluate(); } };
  var stile = CL.Stile(stileCtx);

  /* ---------- pezzi ---------- */
  function note(icon, key) { return '<div class="cl-note">' + ICON[icon] + '<span>' + h(t(key)) + '</span></div>'; }
  function alerts() {
    return (S.error ? '<div class="us-note us-note--crit" role="alert">' + h(S.error) + '</div>' : '') +
      (S.notice ? '<div class="us-note" role="status">' + h(S.notice) + '</div>' : '');
  }
  function select(key, values, prefix) {
    return '<select class="us-field cl-select" data-set="' + key + '">' + values.map(function (v) {
      return '<option value="' + v + '"' + (v === settings[key] ? ' selected' : '') + '>' + h(t(prefix + v)) + '</option>';
    }).join('') + '</select>';
  }
  function number(key) { return '<input class="us-field" type="number" min="1" data-set="' + key + '" value="' + h(settings[key]) + '">'; }
  function field(label, control) { return '<label class="cl-label">' + h(t(label)) + control + '</label>'; }
  function slideLabel(slides) { return !slides.length ? '' : (slides.length > 4 ? t('rep.slides', { count: slides.length }) : t('rep.slide', { list: slides.join(', ') })); }
  /* PowerPoint: il nome nel Riquadro di selezione. Keynote non ne ha: il tipo di oggetto, o la descrizione per l'accessibilità */
  function objectLabel(x) { return x.kind ? t('rep.object', { name: x.name || t('obj.' + x.kind) }) : t('rep.shape', { name: x.name || '–' }); }
  function itemDetail(x) {
    return [x.px && x.need ? x.px + ' → ' + x.need + ' px' : (x.px ? x.px + ' px' : ''), x.codec, x.format, x.mb && x.mb + ' MB', x.save && '−' + x.save + ' MB',
      x.pct && x.pct + '%', x.device, x.date && x.date.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3'), x.gps && 'GPS', x.slides && slideLabel(x.slides)].filter(Boolean).join(' · ');
  }

  /* ---------- schede ---------- */
  function checkTab() {
    if (S.running) {
      return '<section class="cl-panel" aria-live="polite"><h2 class="cl-h2" style="font-size:26px">' + h(t('prog.title')) + '</h2><span class="cl-muted">' + h(t('prog.sub')) + '</span>' +
        '<div style="display:flex;align-items:baseline;gap:10px"><span class="cl-progress-num" id="cl-pct">' + S.pct + '%</span><span class="cl-muted">' + h(t('prog.total')) + '</span></div>' +
        '<div class="cl-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + S.pct + '"><div id="cl-barfill" style="transform:scaleX(' + S.pct / 100 + ')"></div></div>' +
        '<ol class="cl-steps">' + STEPS.map(function (k) {
          var s = S.steps[k] || 'todo';
          return '<li class="' + s + '" data-step="' + k + '">' + ICON[s] + '<span>' + h(t('step.' + k)) + '</span><span class="st">' + h(stepNote(k)) + '</span></li>';
        }).join('') + '</ol><button class="us-btn" id="cl-cancel"' + (S.token.cancelled ? ' disabled' : '') + '>' + h(t('btn.cancel')) + '</button></section>';
    }
    if (S.ask) return askRoom();
    var source = P.mode === 'web'
      ? '<h1 class="us-title">' + h(t('app.tagline')) + '</h1><p class="cl-muted" style="font-size:15px;margin:0">' + h(t('app.lead')) + '</p>' +
        '<label class="cl-drop us-spotlight" id="cl-drop"><span style="font-size:16px;font-weight:600">' + h(t('file.drop')) + '</span><span class="us-btn us-btn--primary">' + h(t('file.choose')) + '</span>' +
        '<input id="cl-file" type="file" accept=".pptx,.key" class="us-sr"><span class="cl-muted">' + h(t('file.formats')) + '</span></label>'
      : '<section class="us-panel"><span class="us-label">' + h(t('file.open')) + '</span><div style="font-size:15px;font-weight:600;overflow-wrap:anywhere">' +
        h(P.documentName() || t('file.current')) + '</div><span class="cl-muted">' + h(P.platformLabel) + '</span></section>';
    return source + alerts() +
      '<section class="cl-panel" style="gap:14px"><h2 class="cl-h2">' + h(t('talk.title')) + '</h2>' +
      field('set.venueOS', select('venueOS', ['win', 'mac', 'own', 'unknown'], 'os.')) +
      '<div class="cl-panel" style="gap:6px">' + field('set.minutes', number('minutes')) + '<span id="cl-pace">' + paceLine() + '</span></div>' +
      field('set.room', select('room', ['16:9', '16:10', '4:3', '3:1', 'unknown'], 'room.')) +
      '<div class="cl-grid2" style="margin-top:0">' + field('set.light', select('light', ['buio', 'penombra', 'accese'], 'light.')) + field('set.rows', select('rows', ['', 'aula', 'sala', 'plenaria', 'misure'], 'rows.')) + '</div>' +
      (settings.rows === 'misure' ? measures() : '') +
      '<details class="cl-adv"><summary>' + h(t('set.advanced')) + '</summary><div class="cl-grid2">' +
      field('set.warnMB', number('warnMB')) + field('set.critMB', number('critMB')) + field('set.minSec', number('minSec')) + field('set.paceSec', number('paceSec')) + '</div></details></section>' +
      '<section class="cl-panel" style="gap:8px"><span class="us-label">' + h(t('checks.title')) + '</span><div class="cl-chips">' +
      ['fonts', 'media', 'images', 'contrast', 'size', 'format', 'time'].map(function (c) { return '<span>' + h(t('cat.' + c)) + '</span>'; }).join('') + '</div></section>' +
      (P.mode === 'web' ? '' : '<button class="us-btn us-btn--primary us-btn--block" id="cl-start">▶ ' + h(t('btn.start')) + '</button>') + note('lock', 'privacy.local');
  }
  function measures() {
    return '<div class="cl-grid2" style="margin-top:0">' + field('set.scrH', '<input class="us-field" type="number" min="0.5" step="0.1" data-set="scrH" value="' + h(settings.scrH) + '">') +
      field('set.rowD', '<input class="us-field" type="number" min="1" step="0.5" data-set="rowD" value="' + h(settings.rowD) + '">') + '</div>';
  }
  /* Secondi per slide sotto i minuti, mentre si scrive: serve il numero di slide di un file controllato */
  function paceLine() {
    if (!S.res) return '<span class="cl-muted">' + h(t('talk.paceHint')) + '</span>';
    var slides = S.res.slides.filter(function (s) { return s.hidden !== true; }).length, minutes = parseFloat(settings.minutes);
    var est = Math.round(slides * (settings.paceSec || 40) / 60);
    if (!(minutes > 0)) return '<span class="cl-muted">' + h(t('talk.paceEst', { slides: slides, est: est })) + '</span>';
    var sps = minutes * 60 / Math.max(1, slides), tight = sps < (settings.minSec || 20) || slides * (settings.paceSec || 40) > minutes * 66;
    return '<span class="cl-pace' + (tight ? ' warn' : '') + '">' + h(t('talk.pace', { slides: slides, minutes: String(minutes).replace('.', ','), sps: Math.round(sps), est: est })) + '</span>';
  }
  /* Prima del primo controllo: quanto è grande la sala? Decide la grandezza minima del testo; si può saltare */
  function askRoom() {
    var cur = S.ask.rows || '';
    return '<section class="cl-panel" style="gap:14px"><h1 class="us-title" style="font-size:28px">' + h(t('ask.title')) + '</h1><p class="cl-muted" style="margin:0">' + h(t('ask.lead')) + '</p>' +
      '<div class="st-segs four cl-askrows">' + ['aula', 'sala', 'plenaria', 'misure'].map(function (k) {
        return '<button class="us-btn st-seg st-two' + (cur === k ? ' on' : '') + '" data-ask="' + k + '" aria-pressed="' + (cur === k) + '"><strong>' + h(t('st.rows.' + k)) + '</strong><span>' + h(t('st.rows.' + k + 'Sub')) + '</span></button>';
      }).join('') + '</div>' +
      (cur === 'misure' ? measures() + '<button class="us-btn us-btn--primary" id="cl-askgo">' + h(t('ask.go')) + '</button>' : '') +
      '<button class="cl-link" id="cl-askskip" style="align-self:flex-start">' + h(t('ask.skip')) + '</button><span class="cl-muted">' + h(t('ask.note')) + '</span></section>';
  }

  /* Le voci del report con valutazione e nota del relatore (salvate sul dispositivo, per nome del file) */
  function keyOf(iss) { return iss.id + '|' + (iss.params.name || ''); }
  function myReviews() { var f = S.ev.summary.fileName; return reviews[f] || (reviews[f] = {}); }
  function rated() {
    var r = myReviews();
    return S.ev.issues.map(function (i) {
      var k = keyOf(i), mine = r[k] || {};
      return Object.assign({}, i, { key: k, orig: i.sev, sev: mine.sev || i.sev, note: mine.note || '' });
    });
  }
  function counts(list) { var c = { crit: 0, warn: 0, ok: 0 }; list.forEach(function (i) { c[i.sev]++; }); return c; }
  function safeId(k) { return 'n-' + k.replace(/[^A-Za-z0-9]+/g, '-').slice(0, 60) + '-' + k.length; }
  function opened(k, html, summary, cls) {
    return '<details' + (cls ? ' class="' + cls + '"' : '') + ' data-open="' + h(k) + '"' + (S.open[k] ? ' open' : '') + '><summary>' + summary + '</summary>' + html + '</details>';
  }
  /* Critico / Attenzione / OK scelto dal relatore, la valutazione del Lab, la nota */
  function judge(iss) {
    var k = h(iss.key), changed = iss.sev !== iss.orig, noteOpen = iss.note || S.open['note:' + iss.key];
    return '<div class="cl-judge"><span class="cl-muted">' + h(t('rev.label')) + '</span><span class="cl-seg" role="group" aria-label="' + h(t('rev.label')) + '">' + ['crit', 'warn', 'ok'].map(function (sev) {
        return '<button class="' + sev + (iss.sev === sev ? ' on' : '') + '" data-rate="' + k + '" data-sev="' + sev + '" aria-pressed="' + (iss.sev === sev) + '">' + h(t(sev === 'ok' ? 'rep.ok' : 'rep.sec.' + sev)) + '</button>';
      }).join('') + '</span>' + (noteOpen ? '' : '<button class="cl-link" data-noteopen="' + k + '">' + h(t('rev.addNote')) + '</button>') + '</div>' +
      (changed ? '<div class="cl-mod"><span>' + h(t('rev.changed', { sev: t(iss.orig === 'ok' ? 'rep.ok' : 'rep.sec.' + iss.orig) })) + '</span><button class="cl-link" data-unrate="' + k + '">' + h(t('rev.restore')) + '</button></div>' : '') +
      (noteOpen ? '<textarea class="us-field cl-notein" id="' + safeId(iss.key) + '" data-note="' + k + '" rows="2" aria-label="' + h(t('rev.note')) + '" placeholder="' + h(t('rev.notePh')) + '">' + h(iss.note) + '</textarea>' : '');
  }
  function issueCard(iss) {
    var risk = I.issue(iss.id, 'r', iss.params), fix = I.issue(iss.id, 'f', iss.params);
    var goto = function (n) { return P.canGoto ? ' <button class="cl-link" data-goto="' + n + '">' + h(t('btn.goto', { n: n })) + ' →</button>' : ''; };
    var items = iss.items.filter(itemDetail), uses = items.filter(function (x) { return x.text; });
    return '<article class="cl-issue ' + iss.sev + '"><div class="head"><span class="title">' + h(I.issue(iss.id, 't', iss.params)) + '</span>' +
      '<span class="cl-muted">' + h(t('cat.' + iss.cat)) + (iss.slides.length ? ' · ' + h(slideLabel(iss.slides)) : '') + '</span></div>' +
      (risk ? '<p>' + h(risk) + '</p>' : '') +
      (uses.length ? opened('list:' + iss.key, '<ul class="cl-items">' + uses.slice(0, 40).map(function (x) { return useRow(x, iss.id); }).join('') +
        (uses.length > 40 ? '<li class="cl-muted">' + h(t('rep.more', { count: uses.length - 40 })) + '</li>' : '') + '</ul>', h(t('btn.showList', { count: uses.length }))) : '') +
      (items.length && !uses.length ? opened('list:' + iss.key, '<ul class="cl-items">' + items.map(function (x) {
        return '<li><span>' + h(x.name) + '</span><span>' + h(itemDetail(x)) + (x.slides && x.slides.length ? goto(x.slides[0]) : '') + '</span></li>';
      }).join('') + '</ul>', h(t('btn.showList', { count: items.length }))) : '') +
      (!iss.slides.length || uses.length ? '' : (P.canGoto || iss.slides.length > 4 ? slideLinks(iss.slides, 'btn.gotoList') : '')) +
      (fix ? opened('fix:' + iss.key, '<p class="fix">' + h(fix) + '</p>', h(t('rep.fixShow')), 'cl-fixd') : '') + judge(iss) + '</article>';
  }
  /* Dove un font compone il testo: slide (cliccabile in PowerPoint), oggetto, testo */
  function useRow(x, id) {
    var where = P.canGoto ? '<button class="cl-link" data-goto="' + x.slides[0] + '">' + h(slideLabel(x.slides)) + '</button>' : h(slideLabel(x.slides));
    var extra = itemExtra(x, id), target = h([x.slides[0], x.name || ''].join('|'));
    var swatch = x.bg ? '<span class="cl-swatch" style="background:' + x.bg + ';color:' + x.color + '" aria-hidden="true">Aa</span>' : '';
    var act = '';
    if (id === 'contrast_low' && x.fix) act = '<span class="cl-fixrow"><span class="cl-fixcol"><i style="background:' + x.fix + '"></i><code>' + x.fix + '</code></span>' +
      (P.canApply && x.name ? '<button class="us-btn us-btn--primary" data-apply="' + target + '|' + x.fix + '">' + h(t('btn.apply', { color: x.fix })) + '</button>' : '') + '</span>';
    if (id === 'text_on_photo') act = (x.thumb ? '<img class="cl-thumb" src="' + x.thumb + '" alt="' + h(t('rep.photo.preview')) + '">' : '') +
      (P.canBand && x.name ? '<button class="us-btn" data-band="' + target + '|' + (x.bandDark ? 'dark' : 'light') + '">' + h(t(x.bandDark ? 'btn.bandDark' : 'btn.bandLight')) + '</button>' : '');
    return '<li class="use"><span>' + (swatch ? '<span class="cl-userow">' + swatch + '<span>' : '') + '<strong>' + where + '</strong> · ' + h(objectLabel(x)) + '<br>«' + h(x.text) + '»' +
      (extra ? '<br><span class="cl-extra">' + h(extra) + '</span>' : '') + (swatch ? '</span></span>' : '') + act + '</span></li>';
  }
  /* La misura dietro una voce di leggibilità, a parole */
  function itemExtra(x, id) {
    var r = function (v) { return v.toFixed(1).replace('.', ',') + ' : 1'; }, n = function (v) { return String(v).replace('.', ','); };
    if (id === 'contrast_low') return t('rep.contrast.item', { ratio: r(x.ratio), need: n(x.need) }) + (x.size ? ' · ' + x.size + ' ' + x.unit : '') + (x.fix ? ' · ' + t('rep.contrast.fix', { color: x.fix }) : ' · ' + t('rep.contrast.nofix'));
    if (id === 'text_on_photo') return t('rep.photo.item', { ratio: r(x.ratio), median: r(x.median), need: n(x.need) }) + ' · ' + t(x.bandDark ? 'rep.photo.bandDark' : 'rep.photo.bandLight', { ratio: r(x.band) });
    if (id === 'text_small') return t('rep.size.item', { size: x.size, min: x.min, unit: x.unit });
    return '';
  }
  /* Tutte le slide coinvolte: numeri cliccabili in PowerPoint, un elenco nella versione web */
  function slideLinks(slides, label) {
    return P.canGoto
      ? '<div class="cl-gotos"><span class="cl-muted">' + h(t(label)) + '</span>' + slides.map(function (n) {
          return '<button class="cl-link" data-goto="' + n + '" aria-label="' + h(t('btn.goto', { n: n })) + '">' + n + '</button>';
        }).join('') + '</div>'
      : '<p class="cl-muted" style="margin:0">' + h(t(label === 'btn.gotoList' ? 'rep.slideList' : 'rep.font.whereList', { list: slides.join(', ') })) + '</p>';
  }

  function reportTab() {
    if (!S.ev) return alerts() + '<p class="cl-empty">' + h(t('rep.empty')) + '</p>';
    var ev = S.ev, sm = ev.summary, all = rated(), n = counts(all), own = settings.venueOS === 'own';
    var mine = Object.keys(myReviews()).length;
    function list(sev) { return all.filter(function (i) { return i.sev === sev; }); }
    var ok = list('ok');
    return alerts() + '<section class="cl-panel" style="gap:4px"><span class="us-label">' + h(t('rep.file')) + '</span><span style="font-size:16px;font-weight:700;overflow-wrap:anywhere">' + h(sm.fileName) + '</span></section>' +
      '<div class="cl-counts">' + ['crit', 'warn', 'ok'].map(function (k) { return '<div class="cl-count ' + k + '"><b>' + n[k] + '</b>' + h(t('rep.' + k)) + '</div>'; }).join('') + '</div>' +
      '<p class="cl-muted" style="margin:0">' + h(t('rev.hint')) + (mine ? ' <button class="cl-link" id="cl-unrateall">' + h(t('rev.resetAll')) + '</button>' : '') + '</p>' +
      ['crit', 'warn'].map(function (sev) { var l = list(sev); return l.length ? '<h3 class="cl-h3 ' + sev + '">' + h(t('rep.sec.' + sev)) + '</h3>' + l.map(issueCard).join('') : ''; }).join('') +
      '<h3 class="cl-h3 ok">' + h(t('rep.sec.ok', { count: ok.length })) + '</h3>' +
      // le voci OK valutate o annotate dal relatore restano schede intere; le altre una riga, con «Valuta» per aprire la scelta
      ok.filter(function (i) { return i.orig !== 'ok' || i.note; }).map(issueCard).join('') +
      '<ul class="cl-oklist">' + ok.filter(function (i) { return i.orig === 'ok' && !i.note; }).map(function (i) {
        var open = S.open['rate:' + i.key];
        return '<li><div class="cl-okrow"><span>' + h(I.issue(i.id, 't', i.params)) + i.items.map(function (x) { return '<br><span class="cl-muted">' + h(x.name + ' · ' + itemDetail(x)) + '</span>'; }).join('') + '</span>' +
          '<span class="cl-okside"><button class="cl-link" data-rateopen="' + h(i.key) + '" aria-expanded="' + !!open + '">' + h(t('rev.rate')) + '</button><span class="tick" aria-hidden="true">✓</span></span></div>' + (open ? judge(i) : '') + '</li>';
      }).join('') + '</ul>' +
      '<section class="us-panel cl-muted" style="line-height:1.6"><strong style="color:#fff">' + h(t('rep.summary')) + '</strong><br>' +
      h(t('rep.sum.format', { aspect: sm.aspect, mb: sm.fileMB < 10 ? sm.fileMB.toFixed(1) : sm.fileMB.toFixed(0) })) + '<br>' +
      h(t('rep.sum.slides', { total: sm.slides, visible: sm.visible })) + '<br>' + h(t('rep.sum.media', { videos: sm.videos, audios: sm.audios, mb: sm.videoMB.toFixed(0) })) +
      '<br><strong style="color:#fff">' + h(t('rep.sum.fonts', { count: sm.fonts.length })) + '</strong>' + (sm.fonts.length ? '<ul class="cl-fonts">' + sm.fonts.map(function (f) {
        // presentando dal proprio computer i font installati lì vanno bene
        var cls = f.embedded || f.cls === 'office' || own ? 'ok' : (f.cls === 'custom' ? 'crit' : 'warn');
        var head = '<span>' + h(f.name) + '</span><span class="cl-badge ' + cls + '">' + h(t(f.embedded ? 'rep.font.embedded' : 'rep.font.' + f.cls)) + '</span>';
        var slides = f.uses.map(function (u) { return u.slide; }).filter(function (n, i, a) { return a.indexOf(n) === i; }).sort(function (a, b) { return a - b; });
        if (!slides.length) return '<li><div class="cl-fonthead">' + head + '</div></li>';
        // Clic sul font: le slide dove si vede, poi ogni testo che lo usa
        return '<li><details><summary class="cl-fonthead">' + head + '</summary><div class="cl-fontwhere">' + slideLinks(slides, 'rep.font.where') +
          '<ul class="cl-items">' + f.uses.map(function (u) { return useRow({ name: u.shape, kind: u.kind, slides: [u.slide], text: u.text }); }).join('') + '</ul></div></details></li>';
      }).join('') + '</ul>' : '') + '</section>' +
      note('info', 'note.fontsRef') + (sm.limited ? note('info', 'note.keyLimits') : '') +
      (P.canGoto ? '' : note('info', P.mode === 'web' ? 'note.gotoWeb' : 'note.gotoUnavailable')) + (P.downloadNote ? note('info', P.downloadNote) : '') +
      '<div class="cl-actions"><button class="us-btn us-btn--primary" id="cl-pdf">' + h(t('btn.pdf')) + '</button><button class="us-btn" id="cl-copy">' + h(t('btn.copy')) + '</button></div>' +
      '<button class="us-btn" id="cl-again">' + h(t(P.mode === 'web' ? 'btn.newFile' : 'btn.recheck')) + '</button>';
  }

  function deliveryName() {
    function slug(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
    return [delivery.date, slug(delivery.room).replace(/-/g, ''), (delivery.time || '').replace(':', ''), slug(delivery.surname), slug(delivery.talk)]
      .filter(Boolean).join('_') + (S.res && S.res.type === 'key' ? '.key' : '.pptx');
  }
  function venueTab() {
    function input(k, type) { return field('del.' + k, '<input class="us-field" type="' + type + '" data-del="' + k + '" value="' + h(delivery[k]) + '">'); }
    var videos = S.res ? S.res.media.filter(function (m) { return !m.external && !m.missing; }) : [];
    var images = S.res ? CL.kit.myImages(S.zip, S.res, S.ev, t).length : 0;
    function kit(kind) {
      var mine = kind === 'video' ? videos.length : images;
      var info = !S.res ? 'del.tests.needCheck' : (!mine ? (kind === 'video' ? 'del.tests.noVideo' : 'del.tests.noImage') : (kind === 'video' ? 'del.tests.videoInfo' : 'del.tests.imageInfo'));
      return '<div class="us-panel cl-panel" style="gap:10px"><strong>' + ICON[kind] + ' ' + h(t('del.tests.' + kind)) + '</strong>' +
        '<span class="cl-muted">' + h(t(info, { count: mine, mb: (videos.reduce(function (a, m) { return a + m.bytes; }, 0) / 1048576).toFixed(0) })) + '</span><div class="cl-grid2">' +
        '<button class="us-btn us-btn--primary" data-kit="' + kind + ':mine"' + (!mine || S.kitBusy ? ' disabled' : '') + '>' + h(t('del.tests.mine.' + kind)) + '</button>' +
        '<button class="us-btn" data-kit="' + kind + ':generic"' + (S.kitBusy ? ' disabled' : '') + '>' + h(t('del.tests.generic')) + '</button></div>' +
        '<span class="cl-muted" role="status">' + h(S.kitStatus[kind] || '') + '</span></div>';
    }
    var done = checklist.filter(function (c) { return c.done; }).length;
    return '<section class="cl-panel" style="gap:12px"><h2 class="cl-h2">' + h(t('del.name.title')) + '</h2>' +
      '<div class="cl-grid2">' + input('date', 'date') + input('time', 'time') + input('room', 'text') + input('surname', 'text') + '</div>' + input('talk', 'text') +
      '<div class="us-panel cl-panel" style="gap:10px"><code class="cl-filename" id="cl-fname">' + h(deliveryName()) + '</code>' +
      '<button class="us-btn" id="cl-copyname" style="align-self:flex-start">' + h(t('del.copy')) + '</button></div><span class="cl-muted">' + h(t('del.hint')) + '</span></section>' +
      '<section class="cl-panel" style="gap:10px"><h2 class="cl-h2">' + h(t('del.check.title')) + ' <span class="cl-muted">' + h(t('del.check.count', { done: done, total: checklist.length })) + '</span></h2>' +
      '<ul class="cl-check">' + checklist.map(function (c, i) {
        var text = c.def !== undefined && c.def !== null ? t('del.items')[c.def] : c.text;
        return '<li class="' + (c.done ? 'done' : '') + '"><label><input type="checkbox" data-check="' + i + '"' + (c.done ? ' checked' : '') + '><span>' + h(text) + '</span></label>' +
          '<button class="cl-x" data-remove="' + i + '" aria-label="' + h(t('del.remove') + ': ' + text) + '">×</button></li>';
      }).join('') + '</ul>' +
      '<form class="cl-addrow" id="cl-addform"><input id="cl-newitem" class="us-field" aria-label="' + h(t('del.addPrompt')) + '" placeholder="' + h(t('del.addPrompt')) + '"><button class="us-btn">' + h(t('del.add')) + '</button></form>' +
      '<button class="us-btn" id="cl-resetlist" style="align-self:flex-start">' + h(t('del.reset')) + '</button></section>' +
      '<button class="cl-linkcard" id="cl-projector">' + ICON.projector + '<span style="flex:1"><strong class="t">PROJECTOR LAB</strong><br><span class="cl-muted">' + h(t('del.projector')) + '</span></span>›</button>' +
      '<section class="cl-panel" style="gap:12px"><h2 class="cl-h2">' + h(t('del.tests.title')) + '</h2><span class="cl-muted">' + h(t('del.tests.intro')) + '</span>' +
      kit('video') + kit('image') + '<span class="cl-muted">' + h(t('del.tests.key')) + '</span></section>';
  }

  function render() {
    var main = S.tab === 'report' ? reportTab() : (S.tab === 'venue' ? venueTab() : (S.tab === 'style' ? stile.render() : checkTab()));
    var a = g.document.activeElement, keep = a && a.id ? { id: a.id, at: a.selectionStart, to: a.selectionEnd } : null;
    $('#app').innerHTML =
      '<nav class="us-tabs" role="tablist" aria-label="' + h(t('nav.sections')) + '">' + ['style', 'check', 'report', 'venue'].map(function (k) {
        return '<button class="us-tab" role="tab" data-tab="' + k + '" aria-selected="' + (S.tab === k) + '">' + h(t('nav.' + k)) + '</button>';
      }).join('') + '</nav><main class="cl-main">' + main + '</main>';
    bind();
    var back = keep && g.document.getElementById(keep.id);                // il testo che si sta scrivendo sopravvive al ridisegno
    if (back) { back.focus(); try { if (keep.at !== null && keep.at !== undefined) back.setSelectionRange(keep.at, keep.to); } catch (e) { /* non è un campo di testo */ } }
  }
  function go(tab) { S.tab = tab; S.error = ''; render(); g.scrollTo(0, 0); }
  /* Salva valutazione o nota di una voce; scrivere una nota non ridisegna il report */
  function review(key, change, quiet) {
    var r = myReviews(), cur = Object.assign({}, r[key], change);
    var orig = S.ev.issues.filter(function (i) { return keyOf(i) === key; })[0];
    if (!cur.sev || (orig && cur.sev === orig.sev)) delete cur.sev;
    if (!cur.note) delete cur.note;
    if (Object.keys(cur).length) r[key] = cur; else delete r[key];
    if (!Object.keys(r).length) delete reviews[S.ev.summary.fileName];
    saveAll();
    if (!quiet) render();
  }

  /* ---------- eventi ---------- */
  function bind() {
    on('[data-tab]', 'click', function (el) { go(el.dataset.tab); });
    on('[data-set]', 'change', function (el) {
      settings[el.dataset.set] = el.type === 'number' && el.value !== '' ? Number(el.value) : el.value;
      saveAll();
      if (S.res) evaluate();
      if (el.dataset.set === 'rows') render();                      // mostra o nasconde le misure
    });
    on('[data-set="minutes"]', 'input', function (el) { settings.minutes = el.value === '' ? '' : Number(el.value); $('#cl-pace').innerHTML = paceLine(); });
    on('[data-ask]', 'click', function (el) {
      var k = el.dataset.ask; S.ask.rows = k;
      if (k === 'misure') { render(); return; }
      settings.rows = k; saveAll(); var f = S.ask.file; S.ask = null; run(f);
    });
    on('#cl-askgo', 'click', function () { settings.rows = 'misure'; saveAll(); var f = S.ask.file; S.ask = null; run(f); });
    on('#cl-askskip', 'click', function () { S.skipRows = true; var f = S.ask.file; S.ask = null; run(f); });
    on('details[data-open]', 'toggle', function (el) { S.open[el.dataset.open] = el.open; });
    on('[data-rate]', 'click', function (el) { review(el.dataset.rate, { sev: el.dataset.sev }); });
    on('[data-unrate]', 'click', function (el) { review(el.dataset.unrate, { sev: null }); });
    on('[data-rateopen]', 'click', function (el) { var k = 'rate:' + el.dataset.rateopen; S.open[k] = !S.open[k]; render(); });
    on('[data-noteopen]', 'click', function (el) { S.open['note:' + el.dataset.noteopen] = true; render(); var a = g.document.querySelector('[data-note="' + el.dataset.noteopen.replace(/"/g, '\\"') + '"]'); if (a) a.focus(); });
    on('[data-note]', 'input', function (el) { review(el.dataset.note, { note: el.value }, true); });
    on('#cl-unrateall', 'click', function () { delete reviews[S.ev.summary.fileName]; saveAll(); render(); });
    on('#cl-start', 'click', function () { run(); });
    on('#cl-cancel', 'click', function (el) { S.token.cancelled = true; el.disabled = true; });
    on('#cl-file', 'change', function (el) { if (el.files[0]) run(el.files[0]); });
    on('#cl-drop', 'dragover', function (el, e) { e.preventDefault(); el.classList.add('over'); });
    on('#cl-drop', 'dragleave', function (el) { el.classList.remove('over'); });
    on('#cl-drop', 'drop', function (el, e) {
      e.preventDefault();
      var item = e.dataTransfer.items && e.dataTransfer.items[0], entry = item && item.webkitGetAsEntry && item.webkitGetAsEntry();
      if (entry && entry.isDirectory) { S.error = t(/\.key$/i.test(entry.name) ? 'err.package' : 'err.type'); render(); }
      else if (e.dataTransfer.files[0]) run(e.dataTransfer.files[0]);
    });
    on('[data-goto]', 'click', function (el) { P.goto(Number(el.dataset.goto)); });
    on('[data-apply]', 'click', function (el) {
      var p = el.dataset.apply.split('|'); el.disabled = true;
      P.applyColor(+p[0], p[1], p[2]).then(function () { CL.UI.notice(t('note.applied')); }, function () { CL.UI.notice(t('note.applyFailed')); });
    });
    on('[data-band]', 'click', function (el) {
      var p = el.dataset.band.split('|'); el.disabled = true;
      P.addBand(+p[0], p[1], p[2] === 'dark').then(function () { CL.UI.notice(t('note.bandAdded')); }, function () { CL.UI.notice(t('note.applyFailed')); });
    });
    on('#cl-pdf', 'click', exportPdf);
    on('#cl-copy', 'click', function (el) { copy(reportText(), el); });
    on('#cl-again', 'click', function () { if (P.mode === 'web') { S.res = S.ev = S.zip = null; go('check'); } else run(); });
    on('[data-del]', 'input', function (el) { delivery[el.dataset.del] = el.value; saveAll(); $('#cl-fname').textContent = deliveryName(); });
    on('#cl-copyname', 'click', function (el) { copy(deliveryName(), el); });
    on('[data-check]', 'change', function (el) { checklist[el.dataset.check].done = el.checked; saveAll(); render(); });
    on('[data-remove]', 'click', function (el) { checklist.splice(el.dataset.remove, 1); saveAll(); render(); });
    on('#cl-addform', 'submit', function (el, e) {
      e.preventDefault();
      var v = $('#cl-newitem').value.trim();
      if (v) { checklist.push({ text: v, done: false }); saveAll(); render(); $('#cl-newitem').focus(); }
    });
    on('#cl-resetlist', 'click', function () { checklist = defaultList(); saveAll(); render(); });
    on('#cl-projector', 'click', function () { P.openUrl(PROJECTOR_LAB); });
    on('[data-kit]', 'click', function (el) { var p = el.dataset.kit.split(':'); makeKit(p[0], p[1] === 'mine'); });
  }

  /* ---------- il controllo ---------- */
  /* Il passo k è alla frazione frac: i passi prima sono fatti, la barra è la somma pesata */
  function progress(k, frac) {
    var i = STEPS.indexOf(k), changed = S.steps[k] !== 'run';
    STEPS.forEach(function (p, j) { S.steps[p] = j < i ? 'done' : (j === i ? 'run' : 'todo'); });
    S.frac = Math.min(1, frac || 0);
    var pct = Math.round(STEPS.reduce(function (a, p, j) { return a + WEIGHT[p] * (j < i ? 1 : (j === i ? S.frac : 0)); }, 0));
    if (!changed && pct === S.pct && k !== 'read') return;
    S.pct = pct;
    if ($('#cl-pct')) paint(); else render();
  }
  /* Cosa dice la riga del passo: i megabyte durante la lettura, poi la sua percentuale */
  function stepNote(k) {
    var s = S.steps[k];
    if (s === 'done') return t('prog.done');
    if (s !== 'run') return '';
    if (k === 'read') return S.total ? Math.round(100 * S.read / S.total) + '% · ' + t('prog.bytes', { a: size(S.read), b: size(S.total) }) : (P.mode === 'addin' ? t('prog.prepare') : '');
    return k === 'evaluate' ? t('prog.running') : Math.round(100 * S.frac) + '%';
  }
  /* Aggiorna l'avanzamento sul posto: ridisegnare farebbe ripartire la rotella */
  function paint() {
    $('#cl-pct').textContent = S.pct + '%';
    $('#cl-barfill').style.transform = 'scaleX(' + S.pct / 100 + ')';
    $('.cl-bar').setAttribute('aria-valuenow', S.pct);
    Array.prototype.forEach.call(g.document.querySelectorAll('.cl-steps li'), function (li) {
      var k = li.dataset.step, s = S.steps[k] || 'todo';
      if (li.className !== s) { li.className = s; li.querySelector('svg').outerHTML = ICON[s]; }
      li.querySelector('.st').textContent = stepNote(k);
    });
  }
  async function run(webFile) {
    if (S.running) return;
    if (!settings.rows && !S.skipRows) { S.ask = { file: webFile, rows: '' }; S.tab = 'check'; S.error = ''; render(); return; }
    var token = S.token = { cancelled: false };
    Object.assign(S, { running: true, tab: 'check', error: '', notice: '', read: 0, total: 0, steps: {}, frac: 0, pct: 0 });
    progress('read', 0);
    try {
      var file = await P.getFile(webFile, function (read, total) { S.read = read; S.total = total; progress('read', read / total); }, token);
      progress('fonts', 0);
      var zip;
      try { zip = await g.JSZip.loadAsync(file.bytes); } catch (e) { throw new Error(/\.key$/i.test(file.name) ? 'notKey' : 'notPptx'); }
      file.bytes = null;
      var opts = { fileName: file.name, fileBytes: file.size, token: token, onProgress: progress };
      var res = /\.key$/i.test(file.name) ? await CL.analyzeKey(zip, opts) : await CL.analyzePptx(zip, opts);
      progress('contrast', 0);
      try {
        if (res.type === 'pptx') await CL.textsPptx(zip, res, opts);
        await CL.photo.measure(zip, res, Object.assign({ light: settings.light }, opts));
      } catch (e) {
        if (e.message === 'cancelled') throw e;
        g.console.warn(e); res.texts = null;                              // gli altri controlli restano validi
      }
      S.zip = zip; S.res = res; S.kitStatus = {};
      stile.setFormat(res.type === 'key' ? (res.slideW / res.slideH < 1.5 ? 'key43' : 'key169') : (res.slideW / res.slideH < 1.5 ? 'ppt43' : 'ppt169'));
      progress('evaluate', 0);
      evaluate();
      STEPS.forEach(function (p) { S.steps[p] = 'done'; });
      S.running = false;
      go('report');
    } catch (e) {
      var code = e instanceof RangeError ? 'memory' : e.message;
      var known = ['cancelled', 'notPptx', 'notKey', 'type', 'getFile', 'memory'];
      if (known.indexOf(code) < 0) g.console.error(e);
      Object.assign(S, { running: false, tab: 'check', error: t('err.' + (known.indexOf(code) >= 0 ? code : 'read')) });
      render();
    }
  }

  /* ---------- report come testo e PDF ---------- */
  function fontsLine() { var f = S.ev.summary.fonts; return t('rep.sum.fonts', { count: f.length }) + (f.length ? ': ' + f.map(function (x) { return x.name; }).join(', ') : ''); }
  function settingsLine() {
    return t('pdf.settings', { os: t('os.' + settings.venueOS), room: settings.room === 'unknown' ? '?' : settings.room, minutes: settings.minutes || '-' }) + ' · ' +
      (settings.rows ? t('pdf.settings2', { light: t('light.' + settings.light), rows: CL.color.rows(settings).toFixed(1).replace('.0', '').replace('.', ',') }) : t('pdf.settings3', { light: t('light.' + settings.light) }));
  }
  function reportLines() {
    var all = rated(), out = [];
    ['crit', 'warn', 'ok'].forEach(function (sev) {
      var l = all.filter(function (i) { return i.sev === sev; });
      if (!l.length) return;
      out.push({ sev: sev, head: sev === 'ok' ? t('rep.sec.ok', { count: l.length }) : t('rep.sec.' + sev) });
      l.forEach(function (i) {
        out.push({ sev: sev, title: I.issue(i.id, 't', i.params) + (i.slides.length ? ' (' + t('rep.slide', { list: i.slides.join(', ') }) + ')' : '') });
        // il rischio sì, il consiglio no: resta nel report a schermo
        if (i.orig !== 'ok') { var r = I.issue(i.id, 'r', i.params); if (r) out.push({ text: r }); }
        if (i.sev !== i.orig) out.push({ mine: t('rev.changed', { sev: t(i.orig === 'ok' ? 'rep.ok' : 'rep.sec.' + i.orig) }) });
        if (i.note) out.push({ mine: t('rev.notePdf', { note: i.note }) });
        i.items.slice(0, 25).forEach(function (x) {
          var extra = itemExtra(x, i.id);
          out.push({ item: x.text ? '- ' + slideLabel(x.slides) + ' · ' + objectLabel(x) + ' · «' + x.text + '»' + (extra ? ' · ' + extra : '') : '- ' + x.name + (itemDetail(x) ? ': ' + itemDetail(x) : '') });
        });
      });
    });
    return out;
  }
  function countLine() { var n = counts(rated()); return t('rep.crit') + ' ' + n.crit + ' · ' + t('rep.warn') + ' ' + n.warn + ' · ' + t('rep.ok') + ' ' + n.ok; }
  function reportText() {
    var ev = S.ev;
    return ['THE ULTRASPEAKER · CHECK LAB', t('pdf.title') + ' — ' + ev.summary.fileName, t('rep.date', { date: new Date().toLocaleString(I.locale) }),
      countLine(), settingsLine(), fontsLine(), ''].concat(reportLines().map(function (l) {
      return l.head ? '\n== ' + l.head.toUpperCase() + ' ==' : (l.title ? '- ' + l.title : '  ' + (l.text || l.mine || l.item));
    }), ['', t('note.fontsRef')]).join('\n');
  }
  async function exportPdf() {
    var ev = S.ev, doc = new g.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
    var logo = base64(await fetchBytes('assets/img/check-lab-logo-white.png')), arena = base64(await fetchBytes('assets/img/arena-black.png'));
    // Carattere del brand incorporato nel PDF (sottoinsieme latino e latino esteso)
    doc.addFileToVFS('cl-regular.ttf', base64(await fetchBytes('assets/fonts/champagne-limousines-regular.ttf'))); doc.addFont('cl-regular.ttf', 'CL', 'normal');
    doc.addFileToVFS('cl-bold.ttf', base64(await fetchBytes('assets/fonts/champagne-limousines-bold.ttf'))); doc.addFont('cl-bold.ttf', 'CL', 'bold');
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 48, y = 124;
    var COLOR = { crit: [208, 40, 40], warn: [190, 140, 0], ok: [30, 150, 80] }; // rosso, giallo, verde (eccezione concordata al Brand Book)
    function write(s, size, bold, color, indent) {
      doc.setFont('CL', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor.apply(doc, color || [20, 20, 20]);
      var safe = String(s).replace(/[^\x20-\u017F\u2013-\u2026\u2030\u2039\u203A\u20AC\u2122\u2190-\u2193\u2212]/g, '?'); // caratteri fuori dal sottoinsieme incorporato
      doc.splitTextToSize(safe, W - 2 * M - (indent || 0)).forEach(function (line) {
        if (y > H - M) { doc.addPage(); y = M; }
        doc.text(line, M + (indent || 0), y); y += size * 1.35;
      });
    }
    doc.setFillColor(0, 0, 0); doc.rect(0, 0, W, 92, 'F');
    doc.addImage(logo, 'PNG', M - 4, 16, 60 * 900 / 313, 60, 'logo', 'FAST'); // logo master con il descrittore Check Lab
    write(ev.summary.fileName, 13, true);
    write(t('rep.date', { date: new Date().toLocaleString(I.locale) }) + ' · ' + settingsLine(), 9, false, [110, 110, 110]);
    write(fontsLine(), 9, false, [110, 110, 110]);
    y += 10;
    var n = counts(rated());
    write(countLine(), 16, true, COLOR[n.crit ? 'crit' : (n.warn ? 'warn' : 'ok')]);
    reportLines().forEach(function (l) {
      if (l.head) { y += 10; write(l.head.toUpperCase(), 11, true, COLOR[l.sev]); }
      else if (l.title) { y += 4; write(l.title, 10.5, l.sev !== 'ok', null, 10); }
      else if (l.text) write(l.text, 9.5, false, [60, 60, 60], 10);
      else if (l.mine) write(l.mine, 9.5, true, [30, 30, 30], 10);
      else write(l.item, 8.5, false, [90, 90, 90], 20);
    });
    y += 10; write(t('note.fontsRef'), 8.5, false, [110, 110, 110]);
    if (y > H - M - 60) { doc.addPage(); y = M; }
    doc.addImage(arena, 'PNG', (W - 44) / 2, y + 24, 44, 44 * 209 / 300, 'arena', 'FAST'); // l'Arena chiude il documento
    for (var p = 1, n = doc.getNumberOfPages(); p <= n; p++) {
      doc.setPage(p); doc.setFont('CL', 'normal'); doc.setFontSize(8); doc.setTextColor(142, 142, 142);
      doc.text('The Ultraspeaker Check Lab · niki977.github.io/ultraspeaker-check-lab', M, H - 24); doc.text(p + ' / ' + n, W - M, H - 24, { align: 'right' });
    }
    P.saveFile(new Uint8Array(doc.output('arraybuffer')), 'CheckLab_' + ev.summary.fileName.replace(/\.(pptx|key)$/i, '').replace(/[^A-Za-z0-9]+/g, '-') + '.pdf', 'application/pdf');
  }
  function copy(text, btn) {
    var label = btn.textContent;
    function done() { btn.textContent = t('del.copied'); setTimeout(function () { btn.textContent = label; }, 1500); }
    function fallback() { // i pannelli di Office possono bloccare gli appunti
      var ta = g.document.createElement('textarea'); ta.value = text; g.document.body.appendChild(ta); ta.select();
      try { g.document.execCommand('copy'); done(); } catch (e) { /* non c'è altro da provare */ }
      ta.remove();
    }
    if (g.navigator.clipboard) g.navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  }

  /* ---------- kit di prova ---------- */
  function asset(name) { return fetchBytes('assets/kit/' + name); }
  async function makeKit(kind, mine) {
    S.kitBusy = true; S.kitStatus[kind] = t('del.tests.building'); render();
    try {
      var items = !mine ? CL.kit.genericItems(kind, asset, t) : (kind === 'video' ? CL.kit.myVideos(S.zip, S.res, t) : CL.kit.myImages(S.zip, S.res, S.ev, t));
      var bytes = await CL.kit.build({ kind: kind, items: items, t: t, lang: I.locale, template: await asset('template.pptx'), poster: await asset('poster-video.png'), logo: await asset('ultraspeaker-logo.png'),
        title: t('kit.title.' + (mine ? 'my' : 'gen') + (kind === 'video' ? 'Video' : 'Image')), intro: t(kind === 'video' ? 'kit.intro.video' : 'kit.intro.image') });
      var name = 'CheckLab_' + (mine ? 'MyTest' : 'RoomTest') + '_' + (kind === 'video' ? 'Video' : 'Images') + '.pptx';
      var how = await P.openKit(bytes, name);
      S.kitStatus[kind] = how === 'opened' ? t('del.tests.opened') : (how === 'downloaded' ? t('del.tests.ready', { name: name }) : t('note.downloadMac'));
    } catch (e) {
      g.console.error(e);
      S.kitStatus[kind] = t('err.read');
    }
    S.kitBusy = false; render();
  }

  /* Intestazione e chiusura stanno nella pagina (kit comune): qui si traducono e i link ricevono ?lang= */
  function chrome() {
    var L = g.UltraspeakerLang, up = P.mode === 'addin' ? '../' : '';
    Array.prototype.forEach.call(g.document.querySelectorAll('[data-i18n]'), function (el) { el.textContent = t(el.dataset.i18n); });
    Array.prototype.forEach.call(g.document.querySelectorAll('.us-links a'), function (a) { a.href = L.linkWithLang(a.getAttribute('href'), I.lang); });
    var guide = $('#usGuide');
    guide.href = up + L.guideHref('check', I.lang); guide.setAttribute('aria-label', t('us.guide.title'));
    $('#usCta').href = 'mailto:info@theultraspeaker.com?subject=' + encodeURIComponent(t('us.cta') + ' – Check Lab');
  }
  CL.UI = {
    init: function (platform) {
      P = stileCtx.P = platform; I.set(I.detect(P.langHint));
      if (P.mode === 'addin') g.document.body.classList.add('us-addin');
      g.UltraspeakerLang.bindSelect($('#usLang'), I.lang, function (code) { I.set(code); chrome(); render(); });
      // nel pannello i link aprono il browser (Office non apre sempre le nuove schede)
      if (P.mode === 'addin') Array.prototype.forEach.call(g.document.querySelectorAll('.us-links a, #usGuide'), function (a) {
        a.addEventListener('click', function (e) { e.preventDefault(); P.openUrl(a.href); });
      });
      chrome(); stile.install($('#app')); render();
    },
    notice: function (msg) { S.notice = msg; render(); },
    base64: base64,
    download: function (bytes, name, type) {
      var a = g.document.createElement('a');
      a.href = URL.createObjectURL(new Blob([bytes], { type: type })); a.download = name;
      g.document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    }
  };
})(window);

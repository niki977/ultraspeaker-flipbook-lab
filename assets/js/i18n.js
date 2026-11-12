/*
 * The Ultraspeaker Check Lab — i18n.js
 * Testi in IT, EN, ES, FR, DE. La lingua la sceglie e la ricorda shared/ultraspeaker-lang.js,
 * condivisa con gli altri Lab (chiave ultraspeaker.lang).
 */
(function (g) {
  'use strict';
  var CL = g.CheckLab = g.CheckLab || {}, LANGS = ['it', 'en', 'es', 'fr', 'de'], current = 'en';

  function fill(s, p) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return p && p[k] !== undefined ? p[k] : m; }); }
  function dict() { return CL.I18N[current]; }

  CL.i18n = {
    LANGS: LANGS,
    get lang() { return current; },
    get locale() { return dict()._lang; },
    /* ?lang=, lingua già scelta, vecchia chiave del Check Lab, lingua di Office nel pannello, sistema, inglese */
    detect: function (hint) { return g.UltraspeakerLang.get('ultraspeaker-checklab-lang', hint); },
    set: function (l) { current = g.UltraspeakerLang.set(l); },
    t: function (key, params) { var v = dict()[key]; return Array.isArray(v) ? v.slice() : fill(v === undefined ? key : v, params); },
    /* part: 't' titolo, 'r' rischio, 'f' come risolvere */
    issue: function (id, part, params) {
      var p = Object.assign({}, params);
      if (p.bars) p.bars = dict()['bars.' + p.bars];
      return fill(dict().issues[id][part] || '', p);
    }
  };
})(window);

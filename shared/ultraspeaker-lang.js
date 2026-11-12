/* ==========================================================================
   The Ultraspeaker Lab — lingua comune  ·  versione 1.3 (novembre 2026)
   File IDENTICO in tutti i Lab: shared/ultraspeaker-lang.js
   Tutti i Lab stanno su niki977.github.io e condividono la memoria del browser:
   la lingua scelta in un Lab vale per tutti.
   ========================================================================== */
(function (g) {
  "use strict";
  var KEY = "ultraspeaker.lang";
  var CODES = ["it", "en", "es", "fr", "de"];
  var NAMES = { it: "Italiano", en: "English", es: "Español", fr: "Français", de: "Deutsch" };
  var FALLBACK = "en";

  function norm(v) {
    if (!v) return null;
    try { v = JSON.parse(v); } catch (e) { /* valore semplice, non JSON */ }
    v = String(v).slice(0, 2).toLowerCase();
    return CODES.indexOf(v) >= 0 ? v : null;
  }
  function read(k) { try { return g.localStorage.getItem(k); } catch (e) { return null; } }
  function write(k, v) { try { g.localStorage.setItem(k, v); } catch (e) { /* memoria non disponibile */ } }

  /* Ordine: ?lang= nell'indirizzo, lingua salvata, vecchia chiave del Lab,
     lingua di Office (hostLang, solo nel pannello), lingua del sistema, inglese */
  function get(legacyKey, hostLang) {
    var fromUrl = norm(new URLSearchParams(g.location.search).get("lang"));
    if (fromUrl) { write(KEY, fromUrl); return fromUrl; }
    var saved = norm(read(KEY));
    if (saved) return saved;
    var legacy = legacyKey ? norm(read(legacyKey)) : null;
    if (legacy) { write(KEY, legacy); return legacy; }
    var host = norm(hostLang);
    if (host) return host;
    var list = (g.navigator.languages && g.navigator.languages.length) ? g.navigator.languages : [g.navigator.language];
    for (var i = 0; i < list.length; i++) { var c = norm(list[i]); if (c) return c; }
    return FALLBACK;
  }

  function set(code) {
    code = norm(code) || FALLBACK;
    write(KEY, code);
    g.document.documentElement.lang = code;
    return code;
  }

  /* Riempie un <select> con i cinque nomi e chiama onChange(code) a ogni scelta */
  function bindSelect(select, current, onChange) {
    select.innerHTML = CODES.map(function (c) {
      return '<option value="' + c + '"' + (c === current ? " selected" : "") + ">" + NAMES[c] + "</option>";
    }).join("");
    select.addEventListener("change", function () { onChange(set(select.value)); });
  }

  /* Aggiunge ?lang= ai link verso Supporto, Privacy, Condizioni d'uso e Guida */
  function linkWithLang(href, code) {
    return href.split("?")[0] + "?lang=" + code;
  }

  /* Indirizzo della guida PDF nella lingua corrente: guide/<slug>-lab-guide-<lingua>.pdf */
  function guideHref(slug, code) {
    return "guide/" + slug + "-lab-guide-" + (norm(code) || FALLBACK) + ".pdf";
  }

  g.UltraspeakerLang = { KEY: KEY, CODES: CODES, NAMES: NAMES, get: get, set: set, bindSelect: bindSelect, linkWithLang: linkWithLang, guideHref: guideHref };
})(window);

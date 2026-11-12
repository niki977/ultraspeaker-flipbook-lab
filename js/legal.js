/* The Ultraspeaker Flipbook Lab – pagine di servizio (Supporto, Privacy, Condizioni d'uso, Installazione).
   La lingua la gestisce shared/ultraspeaker-lang.js; qui restano i testi del menu e i link che portano ?lang=. */
(function () {
  "use strict";
  const L = window.UltraspeakerLang;
  const T = {
    it: { support: "Supporto", privacy: "Privacy", terms: "Condizioni d'uso", install: "Installazione", guide: "Guida", guideTitle: "Guida d'utilizzo", cta: "Richiedi un consiglio", language: "Lingua" },
    en: { support: "Support", privacy: "Privacy", terms: "Terms of use", install: "Installation", guide: "Guide", guideTitle: "User guide", cta: "Ask for advice", language: "Language" },
    es: { support: "Soporte", privacy: "Privacidad", terms: "Condiciones de uso", install: "Instalación", guide: "Guía", guideTitle: "Guía de uso", cta: "Pide un consejo", language: "Idioma" },
    fr: { support: "Assistance", privacy: "Confidentialité", terms: "Conditions d'utilisation", install: "Installation", guide: "Guide", guideTitle: "Guide d'utilisation", cta: "Demander un conseil", language: "Langue" },
    de: { support: "Support", privacy: "Datenschutz", terms: "Nutzungsbedingungen", install: "Installation", guide: "Anleitung", guideTitle: "Bedienungsanleitung", cta: "Rat einholen", language: "Sprache" },
  };
  function apply(lang) {
    const t = T[lang];
    document.querySelectorAll("[data-nav]").forEach((a) => { a.textContent = t[a.dataset.nav]; a.href = L.linkWithLang(a.getAttribute("href"), lang); });
    document.querySelectorAll("[data-t]").forEach((e) => { e.textContent = t[e.dataset.t]; });
    // link interni nel testo (altre pagine del Lab): portano la lingua scelta
    document.querySelectorAll("main a[href$='.html']:not([href*=':'])").forEach((a) => { a.href = L.linkWithLang(a.getAttribute("href"), lang); });
    const g = document.getElementById("usGuide");
    g.href = L.guideHref("flipbook", lang); g.setAttribute("aria-label", t.guideTitle);
    document.getElementById("usCta").href = "mailto:info@theultraspeaker.com?subject=" + encodeURIComponent(t.cta + " – Flipbook Lab");
    document.title = t[document.body.dataset.page] + " · The Ultraspeaker Flipbook Lab";
    const u = new URL(location.href); u.searchParams.set("lang", lang); history.replaceState(null, "", u);
  }
  const lang = document.documentElement.lang;
  L.bindSelect(document.getElementById("lang"), lang, apply);
  apply(lang);
})();

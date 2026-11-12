/* The Ultraspeaker Flipbook Lab – pannello di PowerPoint: apre l'app nel browser.
   Anche «Guida» e i link di servizio si aprono nel browser, perché il pannello non mostra PDF né pagine esterne. */
(function () {
  "use strict";
  const APP = "https://niki977.github.io/ultraspeaker-flipbook-lab/";
  const I18N = window.FB_I18N, UL = window.UltraspeakerLang;
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  let lang = "en";
  const t = (k) => (I18N[lang] && I18N[lang][k]) || I18N.en[k] || k;

  function apply(code) {
    lang = code;
    $$("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $$("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });   // testi nostri con <b>
    $$("[data-i18n-aria]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
    $$(".us-links a").forEach((a) => { a.href = UL.linkWithLang(a.getAttribute("href"), lang); });
    $$(".us-cta").forEach((a) => { a.href = "mailto:info@theultraspeaker.com?subject=" + encodeURIComponent(t("us.cta")); });
    document.getElementById("usGuide").href = UL.guideHref("flipbook", lang);
  }
  // nel pannello le pagine si aprono nel browser predefinito; fuori da PowerPoint in una nuova scheda
  function openOut(url) {
    try {
      if (window.Office && Office.context && Office.context.ui && Office.context.ui.openBrowserWindow) { Office.context.ui.openBrowserWindow(url); return; }
    } catch (e) { /* si prova sotto */ }
    window.open(url, "_blank", "noopener");
  }
  function start(hostLang) {
    const code = UL.set(UL.get("flipbooklab.lang", hostLang));
    UL.bindSelect(document.getElementById("lang"), code, apply);
    apply(code);
  }
  document.getElementById("open").addEventListener("click", () => openOut(APP + "?lang=" + lang));
  $$("#usGuide, .us-links a").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); openOut(new URL(a.getAttribute("href"), location.href).href); }));
  if (window.Office && Office.onReady) Office.onReady((info) => start(info && info.host ? Office.context.displayLanguage : null));
  else start(null);
})();

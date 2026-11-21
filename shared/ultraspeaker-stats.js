/* ==========================================================================
   The Ultraspeaker Lab — statistiche d'uso anonime  ·  versione 1.5 (novembre 2026)
   File IDENTICO in tutti i Lab: shared/ultraspeaker-stats.js
   Invia a theultraspeaker.com quante volte si apre il Lab e quali azioni si usano.
   Niente cookie, niente memoria nel browser (salvo la scelta «non contarmi»), nessun
   dato personale: solo nome del Lab, azione, lingua, fuso orario e lingua del browser.
   I testi, i file, le immagini e i nomi inseriti nel Lab non si inviano MAI.

   Uso (una riga per Lab, dopo questo script):
     UltraspeakerStats.init("qr");            // invia «qr:open» una volta per caricamento
     UltraspeakerStats.track("download");     // invia «qr:download»
     UltraspeakerStats.track("export:start"); // flussi che si possono abbandonare:
     UltraspeakerStats.track("export:done");  //   coppia «:start» / «:done»
   Nomi delle azioni: minuscole, cifre e trattini, separati da «:» (max 40 caratteri).
   Per non contare le proprie prove: aprire il Lab una volta con ?nostats=1
   (si annulla con ?nostats=0). Su localhost e file:// non parte nulla.
   ========================================================================== */
(function (g) {
  "use strict";
  var URL = "https://www.theultraspeaker.com/nk77/area/st.php";
  var KEY = "ultraspeaker.stats.off";
  var lab = "", sent = {};

  function off() {
    try {
      var q = /[?&]nostats=([01])/.exec(g.location.search);
      if (q) { if (q[1] === "1") g.localStorage.setItem(KEY, "1"); else g.localStorage.removeItem(KEY); }
      if (g.localStorage.getItem(KEY) === "1") return true;
    } catch (e) {}
    var h = g.location.hostname;
    return g.location.protocol === "file:" || h === "localhost" || h === "127.0.0.1" || h === "" || /\.local$/.test(h);
  }
  var OFF = off();

  function send(action) {
    if (OFF || !lab) return;
    action = String(action || "").toLowerCase().replace(/[^a-z0-9:\-]/g, "").slice(0, 40);
    if (!action) return;
    var d = { k: "labin", n: lab + ":" + action, p: g.location.pathname, l: (g.document.documentElement.lang || "").slice(0, 5),
              r: "", bl: g.navigator.language || "", tz: "" };
    try { d.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
    var body = JSON.stringify(d);
    try {
      if (g.navigator.sendBeacon && g.navigator.sendBeacon(URL, new Blob([body], { type: "text/plain" }))) return;
    } catch (e) {}
    try { g.fetch(URL, { method: "POST", body: body, mode: "no-cors", keepalive: true, credentials: "omit" }); } catch (e) {}
  }

  g.UltraspeakerStats = {
    version: "1.5",
    /* nome del Lab: qr, image, flipbook, check, projector */
    init: function (name) {
      lab = String(name || "").toLowerCase().replace(/[^a-z0-9\-]/g, "").slice(0, 16);
      if (!sent.open) { sent.open = 1; send("open"); }
    },
    /* un'azione dell'utente; once=true la conta una sola volta per caricamento */
    track: function (action, once) {
      if (once) { if (sent[action]) return; sent[action] = 1; }
      send(action);
    },
    enabled: function () { return !OFF; }
  };
})(window);

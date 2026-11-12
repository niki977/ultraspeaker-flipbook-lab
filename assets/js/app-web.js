/*
 * The Ultraspeaker Check Lab — app-web.js
 * Versione web: il .pptx o .key si legge a blocchi da 8 MB con le API dei file del browser
 * e non lascia mai il computer.
 */
(function (g) {
  'use strict';
  var CL = g.CheckLab, CHUNK = 8388608, ua = g.navigator.userAgent;

  CL.UI.init({
    mode: 'web', canGoto: false, canApply: false, canBand: false,
    hostOS: /Mac/.test(ua) ? 'mac' : (/Windows/.test(ua) ? 'win' : 'unknown'),
    getFile: async function (file, onProgress, token) {
      if (!/\.(pptx|key)$/i.test(file.name)) throw new Error(/\.ppt$/i.test(file.name) ? 'notPptx' : 'type');
      var out;
      try { out = new Uint8Array(file.size); } catch (e) { throw new Error('memory'); }
      for (var off = 0; off < file.size; off += CHUNK) {
        if (token.cancelled) throw new Error('cancelled');
        out.set(new Uint8Array(await file.slice(off, off + CHUNK).arrayBuffer()), off);
        onProgress(Math.min(file.size, off + CHUNK), file.size);
      }
      return { bytes: out, name: file.name, size: file.size };
    },
    openUrl: function (url) { g.open(url, '_blank', 'noopener'); },
    saveFile: CL.UI.download,
    openKit: function (bytes, name) { CL.UI.download(bytes, name, 'application/vnd.openxmlformats-officedocument.presentationml.presentation'); return 'downloaded'; }
  });
})(window);

/*
 * The Ultraspeaker Check Lab — app-addin.js
 * Add-in di PowerPoint: legge la presentazione aperta con Office.context.document.getFileAsync
 * (formato compresso, blocchi da 4 MB). Quello che una piattaforma non permette lo dice il pannello.
 */
(function (g) {
  'use strict';
  var CL = g.CheckLab, t = CL.i18n.t;

  function call(fn) {
    return new Promise(function (ok, ko) { fn(function (r) { if (r.status === Office.AsyncResultStatus.Succeeded) ok(r.value); else ko(new Error('getFile')); }); });
  }

  Office.onReady(function () {
    var ctx = Office.context, doc = ctx.document, plat = ctx.platform, isMac = plat === Office.PlatformType.Mac;
    var canCreate = g.PowerPoint && PowerPoint.createPresentation && ctx.requirements.isSetSupported('PowerPointApi', '1.1');
    var api = function (v) { return !!(g.PowerPoint && PowerPoint.run && ctx.requirements.isSetSupported('PowerPointApi', v)); };
    /* L'unica forma con questo nome del Riquadro di selezione sulla slide n (da 1) */
    function withShape(n, name, fn) {
      return PowerPoint.run(async function (pc) {
        var shapes = pc.presentation.slides.getItemAt(n - 1).shapes;
        shapes.load('items/name,items/left,items/top,items/width,items/height');
        await pc.sync();
        var hit = shapes.items.filter(function (x) { return x.name === name; });
        if (hit.length !== 1) throw new Error('shape');
        fn(hit[0], shapes);
        await pc.sync();
      });
    }
    CL.UI.init({
      mode: 'addin', langHint: ctx.displayLanguage,
      hostOS: isMac ? 'mac' : (plat === Office.PlatformType.PC ? 'win' : (/Mac/.test(g.navigator.userAgent) ? 'mac' : 'win')),
      platformLabel: 'PowerPoint · ' + (isMac ? 'Mac' : (plat === Office.PlatformType.PC ? 'Windows' : 'web')),
      downloadNote: isMac ? 'note.downloadMac' : null,
      canGoto: typeof doc.goToByIdAsync === 'function',
      documentName: function () { return decodeURIComponent(String(doc.url || '').split(/[\\/]/).pop()); },
      getFile: async function (_, onProgress, token) {
        var file = await call(function (cb) { doc.getFileAsync(Office.FileType.Compressed, { sliceSize: 4194304 }, cb); });
        try {
          var out = new Uint8Array(file.size), off = 0;
          for (var i = 0; i < file.sliceCount; i++) {
            if (token.cancelled) throw new Error('cancelled');
            var data = (await call(function (cb) { file.getSliceAsync(i, cb); })).data;
            out.set(data, off); off += data.length;
            onProgress(off, file.size);
          }
          return { bytes: out, name: (this.documentName() || 'presentation').replace(/(\.pptx)?$/i, '.pptx'), size: file.size };
        } finally { file.closeAsync(); }
      },
      // Correzioni di leggibilità dal report, dove questo PowerPoint le permette (forme e testo: PowerPointApi 1.4, ordine di sovrapposizione: 1.8)
      canApply: api('1.4'), canBand: api('1.8'),
      applyColor: function (n, name, color) { return withShape(n, name, function (sh) { sh.textFrame.textRange.font.color = color; }); },
      addBand: function (n, name, dark) {
        return withShape(n, name, function (sh, shapes) {
          var pad = 6, band = shapes.addGeometricShape(PowerPoint.GeometricShapeType.rectangle, { left: sh.left - pad, top: sh.top - pad, width: sh.width + 2 * pad, height: sh.height + 2 * pad });
          band.name = 'Check Lab · ' + (dark ? 'fascia scura' : 'fascia chiara');
          band.fill.setSolidColor(dark ? '#000000' : '#FFFFFF'); band.fill.transparency = 0.4; band.lineFormat.visible = false;
          sh.setZOrder(PowerPoint.ShapeZOrder.bringToFront);             // il testo sopra la banda, la banda sopra la foto
        });
      },
      goto: function (n) {
        doc.goToByIdAsync(n, Office.GoToType.Index, function (r) { if (r.status !== Office.AsyncResultStatus.Succeeded) CL.UI.notice(t('note.gotoUnavailable')); });
      },
      openUrl: function (url) {
        if (ctx.ui.openBrowserWindow) ctx.ui.openBrowserWindow(url); else g.open(url, '_blank');
      },
      saveFile: function (bytes, name, type) {
        if (isMac) CL.UI.notice(t('note.downloadMac')); else CL.UI.download(bytes, name, type);
      },
      openKit: async function (bytes, name) {
        if (canCreate) {
          try { await PowerPoint.createPresentation(CL.UI.base64(bytes)); return 'opened'; } catch (e) { /* si ripiega sul download */ }
        }
        if (isMac) return 'failed';
        CL.UI.download(bytes, name, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
        return 'downloaded';
      }
    });
  });
})(window);

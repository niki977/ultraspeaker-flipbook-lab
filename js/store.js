/* The Ultraspeaker Flipbook Lab – ricorda l'ultimo flipbook in questo browser (IndexedDB) e le preferenze.
   Resta solo su questo computer; se il browser non lo permette, l'app funziona lo stesso.
   Safari: un Blob riletto da IndexedDB resta legato a un file che Safari cancella quando il record viene
   riscritto (pagine bianche). Per questo si salvano i byte e, rileggendo, si ricostruiscono Blob in memoria. */
(function () {
  "use strict";
  const DB = "flipbook-lab", ST = "books";
  // apre il database, esegue fn nello stesso giro, restituisce il risultato della richiesta (null se qualcosa non va)
  function run(mode, fn) {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(ST);
      r.onerror = () => rej(r.error);
      r.onsuccess = () => {
        const db = r.result, tx = db.transaction(ST, mode), req = fn(tx.objectStore(ST));
        tx.oncomplete = () => { res(req && req.result); db.close(); };
        tx.onerror = tx.onabort = () => { rej(tx.error); db.close(); };
      };
    }).catch(() => null);
  }
  const toBytes = async (b) => ({ type: b.type, buf: await b.arrayBuffer() });
  const toBlob = (x) => new Blob([x.buf || x.__bytes], { type: x.type });

  window.FBStore = {
    // le pagine si salvano una volta, quando si apre il PDF; "last" era il formato precedente, ora inutile
    async savePages(b) {
      const pages = await Promise.all(b.blobs.map(toBytes));
      return run("readwrite", (s) => { s.put({ name: b.name, sample: b.sample, aspect: b.aspect, lines: b.lines, pages }, "pages"); s.delete("last"); });
    },
    // pagina corrente e segni: si salvano a ogni modifica
    saveState(state) { return run("readwrite", (s) => s.put(state, "state")); },
    async loadBook() {
      const p = await run("readonly", (s) => s.get("pages"));
      if (!p || !p.pages || !p.pages.length) return null;
      return { ...p, blobs: p.pages.map(toBlob), state: (await run("readonly", (s) => s.get("state"))) || {} };
    },
    async putImage(k, blob) { const x = await toBytes(blob); return run("readwrite", (s) => s.put(x, k)); },
    async getImage(k) { const x = await run("readonly", (s) => s.get(k)); return x && (x.buf || x.__bytes) ? toBlob(x) : null; },
    pref(k, d) { try { const v = localStorage.getItem("flipbooklab." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    setPref(k, v) { try { localStorage.setItem("flipbooklab." + k, JSON.stringify(v)); } catch (e) { /* ignora */ } },
  };
})();

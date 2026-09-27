/* The Ultraspeaker Flipbook Lab – ricorda l'ultimo flipbook in questo browser (IndexedDB).
   Resta solo su questo computer; se il browser non lo permette, l'app funziona lo stesso. */
(function () {
  "use strict";
  const DB = "flipbook-lab", ST = "books", KEY = "last";
  function open() {
    return new Promise((res, rej) => {
      try {
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(ST);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    });
  }
  async function run(mode, fn) {
    const db = await open();
    return new Promise((res, rej) => {
      const tx = db.transaction(ST, mode);
      const req = fn(tx.objectStore(ST));
      tx.oncomplete = () => { res(req && req.result); db.close(); };
      tx.onerror = tx.onabort = () => { rej(tx.error); db.close(); };
    });
  }
  window.FBStore = {
    save(book) { return run("readwrite", (s) => s.put(book, KEY)).catch(() => {}); },
    load() { return run("readonly", (s) => s.get(KEY)).catch(() => null); },
    put(k, v) { return run("readwrite", (s) => s.put(v, k)).catch(() => {}); },
    get(k) { return run("readonly", (s) => s.get(k)).catch(() => null); },
    clear() { return run("readwrite", (s) => s.delete(KEY)).catch(() => {}); },
    pref(k, d) { try { const v = localStorage.getItem("flipbooklab." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    setPref(k, v) { try { localStorage.setItem("flipbooklab." + k, JSON.stringify(v)); } catch (e) { /* ignora */ } },
  };
})();

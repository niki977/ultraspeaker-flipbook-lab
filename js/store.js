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
  /* Safari: un Blob salvato in IndexedDB e poi riletto resta legato a un file che Safari cancella quando il record
     viene riscritto; da quel momento il Blob non si legge più (pagine bianche). Per questo si salvano i byte
     (ArrayBuffer) e, rileggendo, si ricostruiscono Blob tenuti in memoria. */
  const isBlob = (v) => typeof Blob !== "undefined" && v instanceof Blob;
  const bytesOf = new WeakMap();                     // stessi Blob a ogni salvataggio: i byte si leggono una volta sola
  async function pack(v) {
    if (isBlob(v)) {
      let b = bytesOf.get(v);
      if (!b) { b = await v.arrayBuffer(); bytesOf.set(v, b); }
      return { __bytes: b, type: v.type };
    }
    if (Array.isArray(v)) return Promise.all(v.map(pack));
    if (v && typeof v === "object" && !(v instanceof ArrayBuffer)) {
      const o = {}; for (const k of Object.keys(v)) o[k] = await pack(v[k]); return o;
    }
    return v;
  }
  async function unpack(v) {
    if (isBlob(v)) return new Blob([await v.arrayBuffer()], { type: v.type });   // dati vecchi: copia in memoria
    if (v && v.__bytes instanceof ArrayBuffer) { const bl = new Blob([v.__bytes], { type: v.type || "" }); bytesOf.set(bl, v.__bytes); return bl; }
    if (Array.isArray(v)) return Promise.all(v.map(unpack));
    if (v && typeof v === "object" && !(v instanceof ArrayBuffer)) {
      const o = {}; for (const k of Object.keys(v)) o[k] = await unpack(v[k]); return o;
    }
    return v;
  }
  const safeGet = async (k) => {
    const raw = await run("readonly", (s) => s.get(k)).catch(() => null);
    if (raw == null) return null;
    try { return await unpack(raw); }
    catch (e) { run("readwrite", (s) => s.delete(k)).catch(() => {}); return null; }   // illeggibile: si scarta
  };
  window.FBStore = {
    async save(book) { try { const v = await pack(book); await run("readwrite", (s) => s.put(v, KEY)); } catch (e) { /* ignora */ } },
    load() { return safeGet(KEY); },
    async put(k, v) { try { const x = await pack(v); await run("readwrite", (s) => s.put(x, k)); } catch (e) { /* ignora */ } },
    get(k) { return safeGet(k); },
    clear() { return run("readwrite", (s) => s.delete(KEY)).catch(() => {}); },
    pref(k, d) { try { const v = localStorage.getItem("flipbooklab." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    setPref(k, v) { try { localStorage.setItem("flipbooklab." + k, JSON.stringify(v)); } catch (e) { /* ignora */ } },
  };
})();

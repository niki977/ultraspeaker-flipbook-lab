/* The Ultraspeaker Flipbook Lab – esporta il video.
   - MOV ProRes 4444 con canale alfa (sfondo trasparente) per Keynote: codifica con ffmpeg nel browser,
     a blocchi di pochi fotogrammi, e file MOV composto qui in JavaScript (così anche video lunghi non esauriscono la memoria).
   - MP4 H.264 con sfondo a colore per PowerPoint: WebCodecs quando il browser lo offre, altrimenti ffmpeg. */
(function () {
  "use strict";
  const BLOCK = 12;                        // fotogrammi per blocco ProRes
  let ff = null, ffLoading = null;

  function base() { return (window.FB_BASE || location.href.replace(/[^/]*([?#].*)?$/, "")); }
  async function ffmpeg(onLoad) {
    if (ff) return ff;
    if (!ffLoading) {
      ffLoading = (async () => {
        const { FFmpeg } = window.FFmpegWASM;
        const inst = new FFmpeg();
        const b = base() + "vendor/ffmpeg/";
        onLoad && onLoad();
        // il motore video (31 MB) sta nel sito; se manca (il caricamento web di GitHub accetta file fino a 25 MB)
        // lo scarica una volta dal CDN pubblico jsDelivr, stessa versione
        let coreURL = b + "ffmpeg-core.js", wasmURL = b + "ffmpeg-core.wasm";
        let local = false;
        try { const r = await fetch(wasmURL, { method: "HEAD", cache: "no-store" }); local = r.ok; } catch (e) { /* non c'è */ }
        if (!local) {
          // indirizzi diretti (niente blob:, che Safari non sempre lascia leggere al worker)
          const cdn = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/";
          coreURL = cdn + "ffmpeg-core.js"; wasmURL = cdn + "ffmpeg-core.wasm";
        }
        try { await inst.load({ coreURL, wasmURL }); }
        catch (e) {
          if (!local) throw e;
          // il file nel sito non parte (per esempio in Safari): riprova con la copia del CDN
          try { inst.terminate(); } catch (x) { /* ignora */ }
          const cdn = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/";
          const again = new FFmpeg();
          await again.load({ coreURL: cdn + "ffmpeg-core.js", wasmURL: cdn + "ffmpeg-core.wasm" });
          ff = again;
          return again;
        }
        ff = inst;
        return inst;
      })().catch((e) => { ffLoading = null; throw e; });
    }
    return ffLoading;
  }
  function stopFF() { if (ff) { try { ff.terminate(); } catch (e) { /* ignora */ } } ff = null; ffLoading = null; }

  /* ---------- Lettura di un MOV/MP4 (solo quello che serve) ---------- */
  function readBoxes(u8, start, end) {
    const out = [];
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let p = start;
    while (p + 8 <= end) {
      let size = dv.getUint32(p), hdr = 8;
      const type = String.fromCharCode(u8[p + 4], u8[p + 5], u8[p + 6], u8[p + 7]);
      if (size === 1) { size = Number(dv.getBigUint64(p + 8)); hdr = 16; }
      else if (size === 0) size = end - p;
      out.push({ type, start: p, hdr, end: p + size });
      p += size;
    }
    return out;
  }
  function find(u8, path, start = 0, end = u8.byteLength) {
    const [head, ...rest] = path;
    const b = readBoxes(u8, start, end).find((x) => x.type === head);
    if (!b) return null;
    return rest.length ? find(u8, rest, b.start + b.hdr, b.end) : b;
  }
  // restituisce {stsd (byte), samples: [Uint8Array]}
  function parseSegment(u8) {
    const stbl = find(u8, ["moov", "trak", "mdia", "minf", "stbl"]);
    if (!stbl) throw new Error("mov: stbl non trovato");
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const sub = (t) => find(u8, [t], stbl.start + stbl.hdr, stbl.end);
    const stsd = sub("stsd"), stsz = sub("stsz"), stsc = sub("stsc");
    const stco = sub("stco") || sub("co64");
    const c = stsz.start + stsz.hdr + 4;
    const fixed = dv.getUint32(c), n = dv.getUint32(c + 4);
    const sizes = [];
    for (let i = 0; i < n; i++) sizes.push(fixed || dv.getUint32(c + 8 + i * 4));
    const co = stco.start + stco.hdr + 4, nc = dv.getUint32(co);
    const offs = [];
    for (let i = 0; i < nc; i++) offs.push(stco.type === "co64" ? Number(dv.getBigUint64(co + 4 + i * 8)) : dv.getUint32(co + 4 + i * 4));
    const sc = stsc.start + stsc.hdr + 4, ns = dv.getUint32(sc);
    const runs = [];
    for (let i = 0; i < ns; i++) runs.push({ first: dv.getUint32(sc + 4 + i * 12), per: dv.getUint32(sc + 8 + i * 12) });
    const samples = [];
    let si = 0;
    for (let ch = 0; ch < nc; ch++) {
      let per = 1;
      for (const r of runs) if (ch + 1 >= r.first) per = r.per;
      let p = offs[ch];
      for (let k = 0; k < per && si < n; k++, si++) { samples.push(u8.slice(p, p + sizes[si])); p += sizes[si]; }
    }
    samples.forEach(proresV1);
    for (let i = 0; i < samples.length; i++) samples[i] = fixProresAlpha(samples[i]);
    return { stsd: u8.slice(stsd.start, stsd.end), samples };
  }
  // ffmpeg scrive i fotogrammi ProRes come "versione 0", che per le app Apple (Keynote, QuickTime) significa
  // "senza canale alfa": decodificano i colori e scartano la trasparenza (sfondo nero). I fotogrammi 4:4:4 con alfa
  // prodotti da Apple sono "versione 1": basta cambiare quel campo dell'intestazione, il resto è identico.
  function proresV1(fr) {
    if (fr.length > 12 && fr[4] === 0x69 && fr[5] === 0x63 && fr[6] === 0x70 && fr[7] === 0x66 && fr[10] === 0 && fr[11] === 0) { fr[11] = 1; fr[25] &= 15; } // come ffmpeg 7: versione 1, bit riservati a zero
  }

  /* ffmpeg prima della versione 7 dimentica l'ultimo codice "ripetizione" della trasparenza quando una fetta (slice)
     finisce con un valore nuovo. ffmpeg non se ne accorge, ma il decodificatore Apple (chip M2/M3, Keynote, QuickTime)
     sì: blocchi trasparenti o neri, oppure "Impossibile decodificare". Qui si rilegge ogni fetta e si aggiunge
     il bit mancante, come fa ffmpeg 7 (commit 9109273e3b, "fix alpha plane encoding bitstream").
     Restituisce il fotogramma corretto (lo stesso array se non serve aggiungere byte). */
  function fixProresAlpha(fr) {
    const rb16 = (o) => (fr[o] << 8) | fr[o + 1];
    const rb32 = (o) => ((fr[o] << 24) >>> 0) + (fr[o + 1] << 16) + (fr[o + 2] << 8) + fr[o + 3];
    if (fr.length < 40 || fr[4] !== 0x69 || fr[5] !== 0x63 || fr[6] !== 0x70 || fr[7] !== 0x66) return fr;
    fr[25] &= 15;                                              // come ffmpeg 7: bit riservati a zero
    const abits = (fr[25] & 15) === 1 ? 8 : (fr[25] & 15) === 2 ? 16 : 0;
    if (!abits || ((fr[20] >> 2) & 3)) return fr;              // senza alfa, o interlacciato: niente da fare
    const W = rb16(16), H = rb16(18);
    const p = 8 + rb16(8);                                     // intestazione dell'immagine
    const phs = fr[p] >> 3, log2w = fr[p + 7] >> 4;
    const mbw = (W + 15) >> 4, mbh = (H + 15) >> 4;
    const mbs = [];
    for (let y = 0; y < mbh; y++) {
      let n = 1 << log2w;
      for (let x = 0; x < mbw; x += n) { while (mbw - x < n) n >>= 1; mbs.push(n); }
    }
    const idx0 = p + phs, data0 = idx0 + mbs.length * 2;
    const dbits = abits === 16 ? 7 : 4;
    const grow = new Uint8Array(mbs.length);                   // 1 = alla fetta serve un byte in più
    let off = data0, extra = 0;
    for (let i = 0; i < mbs.length; i++) {
      const size = rb16(idx0 + i * 2), s = off;
      off += size;
      const shs = fr[s] >> 3, ys = rb16(s + 2), us = rb16(s + 4);
      const vs = shs > 7 ? rb16(s + 6) : size - shs - ys - us;
      const a0 = s + shs + ys + us + vs, aBytes = s + size - a0;
      if (aBytes <= 0) continue;
      const N = mbs[i] * 256, end = aBytes * 8;
      let pos = 0, n = 0;
      const bit = () => { const b = pos < end ? (fr[a0 + (pos >> 3)] >> (7 - (pos & 7))) & 1 : 0; pos++; return b; };
      const bits = (k) => { let v = 0; for (let j = 0; j < k; j++) v = (v << 1) | bit(); return v; };
      let missing = false;
      for (;;) {
        if (bit()) pos += abits; else pos += dbits;             // differenza
        n++;
        if (n >= N) { missing = true; break; }                  // finita con una differenza: manca il codice finale
        if (bit()) continue;                                    // "1": subito un'altra differenza
        let r = bits(4); if (!r) r = bits(11);
        n += r;
        if (n >= N) break;                                      // finita con una ripetizione: corretta
      }
      if (!missing || pos > end) continue;
      if (pos < end) fr[a0 + (pos >> 3)] |= 0x80 >> (pos & 7);  // c'è spazio nel riempimento dell'ultimo byte
      else { grow[i] = 1; extra++; }
    }
    if (!extra) return fr;
    // servono byte in più: si ricompone il fotogramma con le nuove misure
    const out = new Uint8Array(fr.length + extra);
    out.set(fr.subarray(0, data0), 0);
    let src = data0, dst = data0;
    for (let i = 0; i < mbs.length; i++) {
      const size = rb16(idx0 + i * 2);
      out.set(fr.subarray(src, src + size), dst);
      src += size; dst += size;
      if (grow[i]) {
        out[dst++] = 0x80;
        const ns = size + 1; out[idx0 + i * 2] = ns >> 8; out[idx0 + i * 2 + 1] = ns & 255;
      }
    }
    out.set(fr.subarray(src), dst);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, rb32(0) + extra);
    dv.setUint32(p + 1, rb32(p + 1) + extra);
    return out;
  }

  /* ---------- Scrittura del MOV finale ---------- */
  const enc = new TextEncoder();
  function u32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v); return b; }
  function u16(v) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v); return b; }
  function cat(parts) {
    const len = parts.reduce((s, p) => s + p.length, 0), o = new Uint8Array(len);
    let i = 0; for (const p of parts) { o.set(p, i); i += p.length; }
    return o;
  }
  function box(type, ...parts) { const body = cat(parts); return cat([u32(body.length + 8), enc.encode(type), body]); }
  const zeros = (n) => new Uint8Array(n);
  const MATRIX = cat([u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0), u32(0), u32(0), u32(0x40000000)]);
  function pstr(s) { const b = enc.encode(s); return cat([new Uint8Array([b.length]), b]); }

  function buildMov(stsd, sizes, width, height, fps) {
    const n = sizes.length, TS = fps * 100, delta = 100, dur = n * delta;
    const MV = 1000, mvDur = Math.round(n / fps * 1000);
    const ftyp = box("ftyp", enc.encode("qt  "), u32(0x200), enc.encode("qt  "));
    const dataLen = sizes.reduce((s, x) => s + x, 0);
    const big = dataLen + 16 > 0xffffffff;
    const mdatHdr = big ? cat([u32(1), enc.encode("mdat"), (() => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(dataLen + 16)); return b; })()])
      : cat([u32(dataLen + 8), enc.encode("mdat")]);
    let off = ftyp.length + mdatHdr.length;
    const offs = sizes.map((s) => { const o = off; off += s; return o; });
    const mvhd = box("mvhd", u32(0), u32(0), u32(0), u32(MV), u32(mvDur), u32(0x00010000), u16(0x0100), zeros(10), MATRIX, zeros(24), u32(2));
    const tkhd = box("tkhd", u32(0x00000003), u32(0), u32(0), u32(1), u32(0), u32(mvDur), zeros(8), u16(0), u16(0), u16(0), u16(0), MATRIX, u32(width << 16), u32(height << 16));
    const mdhd = box("mdhd", u32(0), u32(0), u32(0), u32(TS), u32(dur), u16(0x7fff), u16(0));
    const hdlr = box("hdlr", u32(0), enc.encode("mhlr"), enc.encode("vide"), u32(0), u32(0), u32(0), pstr("VideoHandler"));
    // modalità grafica 0 (copy) come ffmpeg: con 0x40 (dither copy) le app Apple ignorano l'alfa e mostrano nero
    const vmhd = box("vmhd", u32(1), u16(0), u16(0), u16(0), u16(0));
    const dhlr = box("hdlr", u32(0), enc.encode("dhlr"), enc.encode("url "), u32(0), u32(0), u32(0), pstr("DataHandler"));
    const dinf = box("dinf", box("dref", u32(0), u32(1), box("url ", u32(1))));
    const stts = box("stts", u32(0), u32(1), u32(n), u32(delta));
    const stsc = box("stsc", u32(0), u32(1), u32(1), u32(1), u32(1));
    const stsz = box("stsz", u32(0), u32(0), u32(n), ...sizes.map(u32));
    const stco = big
      ? box("co64", u32(0), u32(n), ...offs.map((o) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(o)); return b; }))
      : box("stco", u32(0), u32(n), ...offs.map(u32));
    const stbl = box("stbl", stsd, stts, stsc, stsz, stco);
    const minf = box("minf", vmhd, dhlr, dinf, stbl);
    const mdia = box("mdia", mdhd, hdlr, minf);
    const edts = box("edts", box("elst", u32(0), u32(1), u32(mvDur), u32(0), u32(0x00010000)));
    const trak = box("trak", tkhd, edts, mdia);
    const moov = box("moov", mvhd, trak);
    return { head: cat([ftyp, mdatHdr]), moov };
  }

  /* ---------- Fotogrammi ---------- */
  function frameCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return { c, ctx: c.getContext("2d", { willReadFrequently: true }) };
  }
  // piccola pausa per lasciar respirare la pagina; con MessageChannel non viene rallentata
  // quando la scheda è in secondo piano (i timer sì, fino a una volta al secondo)
  const idle = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });

  // testo leggibile per qualsiasi errore (Safari a volte rifiuta con un Event, che diventa "[object Event]")
  function describe(e) {
    if (!e) return "?";
    if (typeof Event !== "undefined" && e instanceof Event) {
      return "evento " + e.type + (e.message ? ": " + e.message : "") + (e.filename ? " @ " + String(e.filename).split("/").pop() + ":" + (e.lineno || "") : "");
    }
    return e.message || String(e);
  }
  const RECYCLE = 15;                     // ogni 15 blocchi (180 fotogrammi) il motore riparte pulito: Safari libera la memoria

  async function mov(job) {
    const { width: W, height: H, fps, frames: N, render, onProgress, isCancelled } = job;
    let f;
    try { f = await ffmpeg(() => onProgress(0, "load")); }
    catch (e) { throw new Error("motore video non caricato – " + describe(e)); }
    const { c, ctx } = frameCanvas(W, H);
    let stsd = null;
    const chunks = [], sizes = [];
    const encode = async (raw) => {
      await f.writeFile("in.raw", raw);
      const code = await f.exec(["-f", "rawvideo", "-pix_fmt", "rgba", "-s", W + "x" + H, "-r", String(fps), "-i", "in.raw",
        "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le", "-alpha_bits", "16", "-vendor", "apl0",
        "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
        "-qscale:v", "6", "seg.mov"]);
      try { await f.deleteFile("in.raw"); } catch (e) { /* ignora */ }
      if (code) throw new Error("ffmpeg codice " + code);
      const u8 = await f.readFile("seg.mov");
      await f.deleteFile("seg.mov");
      return parseSegment(u8);
    };
    for (let s = 0, seg = 0; s < N; s += BLOCK, seg++) {
      const n = Math.min(BLOCK, N - s);
      let raw = new Uint8Array(W * H * 4 * n);
      for (let k = 0; k < n; k++) {
        if (isCancelled()) throw new Error("cancel");
        ctx.clearRect(0, 0, W, H);
        try { await render(ctx, s + k, W, H); }
        catch (e) { throw new Error("fotogramma " + (s + k) + " – " + describe(e)); }
        raw.set(ctx.getImageData(0, 0, W, H).data, k * W * H * 4);
        onProgress((s + k + 0.5) / N, "frames");
        if (k % 3 === 2) await idle();
      }
      if (seg && seg % RECYCLE === 0) { stopFF(); f = await ffmpeg(); }
      let pr;
      try { pr = await encode(raw); }
      catch (e) {
        // un secondo tentativo con il motore riavviato (se si è bloccato o ha finito la memoria)
        if (isCancelled()) throw new Error("cancel");
        stopFF();
        try { f = await ffmpeg(); pr = await encode(raw); }
        catch (e2) { throw new Error("blocco " + (seg + 1) + " – " + describe(e2)); }
      }
      raw = null;
      if (!stsd) stsd = pr.stsd;
      pr.samples.forEach((x) => sizes.push(x.length));
      // i fotogrammi pronti diventano subito un Blob: il browser può tenerli fuori dalla memoria della pagina
      chunks.push(new Blob(pr.samples));
      if (isCancelled()) throw new Error("cancel");
    }
    const { head, moov } = buildMov(stsd, sizes, W, H, fps);
    return new Blob([head, ...chunks, moov], { type: "video/quicktime" });
  }

  async function avcSupported(W, H, fps) {
    if (!window.VideoEncoder || !window.Mp4Muxer) return null;
    for (const codec of ["avc1.640028", "avc1.4d0028", "avc1.42e028"]) {
      try {
        const cfg = { codec, width: W, height: H, bitrate: W >= 1900 ? 14e6 : 8e6, framerate: fps, avc: { format: "avc" } };
        const r = await VideoEncoder.isConfigSupported(cfg);
        if (r && r.supported) return cfg;
      } catch (e) { /* prova il successivo */ }
    }
    return null;
  }
  async function mp4(job) {
    const { width: W, height: H, fps, frames: N, render, onProgress, isCancelled } = job;
    const cfg = await avcSupported(W, H, fps);
    const { c, ctx } = frameCanvas(W, H);
    if (cfg) {
      const muxer = new Mp4Muxer.Muxer({ target: new Mp4Muxer.ArrayBufferTarget(), video: { codec: "avc", width: W, height: H, frameRate: fps }, fastStart: "in-memory" });
      let err = null;
      const venc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { err = e; } });
      venc.configure(cfg);
      for (let k = 0; k < N; k++) {
        if (isCancelled()) { try { venc.close(); } catch (e) { /* ignora */ } throw new Error("cancel"); }
        if (err) throw err;
        await render(ctx, k, W, H);
        const vf = new VideoFrame(c, { timestamp: Math.round(k * 1e6 / fps), duration: Math.round(1e6 / fps) });
        venc.encode(vf, { keyFrame: k % (fps * 2) === 0 });
        vf.close();
        onProgress((k + 1) / N, "frames");
        while (venc.encodeQueueSize > 6) await new Promise((r) => { const done = () => { venc.removeEventListener && venc.removeEventListener("dequeue", done); r(); }; if (venc.addEventListener && "ondequeue" in venc) venc.addEventListener("dequeue", done, { once: true }); else idle().then(r); });
        if (k % 4 === 3) await idle();
      }
      await venc.flush();
      if (err) throw err;
      muxer.finalize();
      return new Blob([muxer.target.buffer], { type: "video/mp4" });
    }
    // ripiego: ffmpeg (libx264) a blocchi, poi unione senza ricodifica
    const f = await ffmpeg(() => onProgress(0, "load"));
    const B = 30, segs = [];
    for (let s = 0, seg = 0; s < N; s += B, seg++) {
      const n = Math.min(B, N - s);
      const raw = new Uint8Array(W * H * 4 * n);
      for (let k = 0; k < n; k++) {
        if (isCancelled()) throw new Error("cancel");
        await render(ctx, s + k, W, H);
        raw.set(ctx.getImageData(0, 0, W, H).data, k * W * H * 4);
        onProgress((s + k + 0.5) / N, "frames");
        if (k % 3 === 2) await idle();
      }
      await f.writeFile("in.raw", raw);
      const name = "s" + seg + ".mp4";
      await f.exec(["-f", "rawvideo", "-pix_fmt", "rgba", "-s", W + "x" + H, "-r", String(fps), "-i", "in.raw",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-g", String(fps * 2), name]);
      await f.deleteFile("in.raw");
      segs.push(name);
    }
    await f.writeFile("list.txt", new TextEncoder().encode(segs.map((s) => "file '" + s + "'").join("\n")));
    await f.exec(["-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "-movflags", "+faststart", "out.mp4"]);
    const out = await f.readFile("out.mp4");
    for (const s of segs) { try { await f.deleteFile(s); } catch (e) { /* ignora */ } }
    await f.deleteFile("out.mp4"); await f.deleteFile("list.txt");
    return new Blob([out], { type: "video/mp4" });
  }

  window.FBExport = {
    run(job) { return job.format === "mov" ? mov(job) : mp4(job); },
    cancel: stopFF,
    avcSupported,
    _parseSegment: parseSegment, _buildMov: buildMov, _fixProresAlpha: fixProresAlpha,
  };
})();

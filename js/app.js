/* The Ultraspeaker Flipbook Lab – app online: sfoglia, sottolinea, ingrandisci, registra */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const E = window.FBEngine, A = window.FBAnnot, PG = window.FBPages, ST = window.FBStore;
  const now = () => performance.now();
  const FPS = 30;
  const CAM0 = () => ({ z: 1, x: E.SW / 2, y: E.SH / 2 });

  /* ---------- Lingua ---------- */
  const I18N = window.FB_I18N;
  const LANGS = I18N.langs.map((l) => l[0]);
  let LANG = "it";
  const t = (k, v) => {
    let s = (I18N[LANG] && I18N[LANG][k]) || I18N.it[k] || k;
    if (v) Object.keys(v).forEach((x) => { s = s.split("{" + x + "}").join(v[x]); });
    return s;
  };
  function detectLang() {
    const saved = ST.pref("lang", null);
    if (saved && LANGS.includes(saved)) return saved;
    const l = ((navigator.languages && navigator.languages[0]) || navigator.language || "it").slice(0, 2).toLowerCase();
    return LANGS.includes(l) ? l : "en";
  }
  function applyStatic() {
    document.documentElement.lang = LANG;
    $$("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $$("[data-i18n-aria]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
    $$("[data-i18n-title]").forEach((el) => el.setAttribute("title", t(el.dataset.i18nTitle)));
    $$("[data-tool]").forEach((b) => { b.title = t("tool." + b.dataset.tool); b.setAttribute("aria-label", t("tool." + b.dataset.tool)); });
    $$("[data-mode]").forEach((b) => { b.title = t("mode." + b.dataset.mode); b.setAttribute("aria-label", t("mode." + b.dataset.mode)); });
    $("#clearBtn").title = t("clearPage"); $("#clearBtn").setAttribute("aria-label", t("clearPage"));
    $("#lang").value = LANG;
    buildDots(); syncUI();
  }

  /* ---------- Stato ---------- */
  let book = null;                                   // {name}
  const st = { view: 0, flip: null };
  let layout = ST.pref("layout", "book"), cover = ST.pref("cover", true);
  let bgMode = ST.pref("bgMode", "clear"), bgColor = ST.pref("bgColor", "#000000");
  let bgImg = null, bgBlob = null;                   // immagine di sfondo
  let tool = "hand", color = ST.pref("color", "#ffd400"), markMode = ST.pref("markMode", "keep");
  let anim = null, queue = 0, drag = null, stroke = null, pan = null, peek = { dir: 0, corner: "bottom", amt: 0, target: 0 };
  let cam = CAM0(), camT = CAM0();                   // zoom: posizione attuale e di arrivo
  let spaceDown = false;
  let rec = null, take = null;
  let dirty = true;
  const COLORS = ["#ffd400", "#ff5a4f", "#3fa7ff", "#4cd964", "#111111", "#ffffff"];
  A.lineSource = (p) => PG.linesOf(p);

  function views(lay, cov) { return E.buildViews(PG.count, lay || layout, cov == null ? cover : cov); }
  function geo() { return E.geometry(PG.aspect, layout); }
  function drawPageFor(T, reveal) {
    return (ctx, idx, x, y, w, h) => {
      const bm = PG.get(idx);
      if (bm) ctx.drawImage(bm, x, y, w, h);
      else { ctx.fillStyle = "#ffffff"; ctx.fillRect(x, y, w, h); }
      A.draw(ctx, idx, x, y, w, h, T, reveal);
    };
  }
  /* o: {bg, bgImage, T, reveal, layout, cover, cam} */
  function opts(o) {
    o = o || {};
    return {
      pageCount: PG.count, aspect: PG.aspect,
      layout: o.layout || layout, cover: o.cover == null ? cover : o.cover,
      drawPage: drawPageFor(o.T == null ? now() : o.T, o.reveal),
      bg: o.bg || null, bgImage: o.bgImage || null, cam: o.cam || null,
    };
  }
  function displayOpts(T) {
    return opts({ T, cam, bg: bgMode === "color" ? bgColor : null, bgImage: bgMode === "image" ? bgImg : null });
  }

  /* ---------- Disegno sullo schermo ---------- */
  const cv = $("#cv"), ctx = cv.getContext("2d");
  // il palco è sempre 16:9: la misura più grande che entra nello spazio disponibile, senza deformarsi
  function fitStage() {
    const wrap = $("#stagewrap"), stage = $("#stage");
    const cs = getComputedStyle(wrap);
    const aw = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const ah = wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (aw <= 0 || ah <= 0) return;
    let w = aw, h = aw * 9 / 16;
    if (h > ah) { h = ah; w = ah * 16 / 9; }
    stage.style.width = Math.floor(w) + "px"; stage.style.height = Math.floor(h) + "px";
  }
  function resize() {
    fitStage();
    const r = cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; dirty = true; }
  }
  function stepCam() {
    const k = 0.24;
    const dz = camT.z - cam.z, dx = camT.x - cam.x, dy = camT.y - cam.y;
    if (Math.abs(dz) < 0.001 && Math.abs(dx) < 0.3 && Math.abs(dy) < 0.3) { cam = { ...camT }; return false; }
    cam = { z: cam.z + dz * k, x: cam.x + dx * k, y: cam.y + dy * k };
    return true;
  }
  function frame() {
    const T = now();
    let busyAnim = stepCam();
    if (book) {
      if (anim) {
        busyAnim = true;
        const g = geo();
        const k = Math.min(1, (T - anim.t0) / anim.dur);
        st.flip = { dir: anim.dir, corner: anim.corner, P: E.flipPath(g, anim.corner, anim.P0, k, anim.complete) };
        if (k >= 1) {
          if (anim.complete) st.view += anim.dir;
          st.flip = null; anim = null; peek.amt = 0;
          afterView();
          if (queue) { const d = Math.sign(queue); queue -= d; startFlip(d, null, null, 520); }
        }
      } else if (!drag) {
        const d = peek.target - peek.amt;
        if (Math.abs(d) > 0.003) { peek.amt += d * 0.22; busyAnim = true; }
        else peek.amt = peek.target;
        if (peek.amt > 0.004 && peek.dir) {
          const g = geo(), { C } = E.corners(g, peek.corner);
          const s = g.W * 0.085 * peek.amt;
          st.flip = { dir: peek.dir, corner: peek.corner, P: { x: C.x - s, y: C.y + (peek.corner === "top" ? s : -s) } };
        } else if (st.flip && !drag) st.flip = null;
      }
      if (rec) {
        busyAnim = true;
        rec.snaps.push({ t: T - rec.t0, view: st.view, cam: { ...cam }, flip: st.flip ? { dir: st.flip.dir, corner: st.flip.corner, P: { x: st.flip.P.x, y: st.flip.P.y } } : null });
        const s = Math.floor((T - rec.t0) / 1000);
        $("#recTime").textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
        if (T - rec.t0 > 15 * 60 * 1000) stopRec();
      }
      if (A.hasFading(T)) busyAnim = true;
    }
    if (dirty || busyAnim) {
      dirty = false;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (book) {
        ctx.setTransform(cv.width / E.SW, 0, 0, cv.height / E.SH, 0, 0);
        E.render(ctx, st, displayOpts(T));
      }
      $("#zoomPct").textContent = Math.round(camT.z * 100) + "%";
    }
    requestAnimationFrame(frame);
  }

  /* ---------- Sfogliare ---------- */
  function canGo(dir) { const v = views(); return !!v[st.view + dir]; }
  function startFlip(dir, P0, corner, dur) {
    if (!book) return false;
    if (anim) {
      // un altro giro mentre la pagina sta ancora girando: lo mettiamo in coda, anche nella direzione opposta
      const base = st.view + (anim.complete ? anim.dir : 0);
      if (Math.sign(queue) === -dir) queue = 0;
      if (views()[base + queue + dir]) queue += dir;
      return true;
    }
    if (!canGo(dir)) return false;
    const g = geo();
    corner = corner || (st.flip && st.flip.dir === dir ? st.flip.corner : "bottom");
    const { C } = E.corners(g, corner);
    const from = P0 || (st.flip && st.flip.dir === dir ? st.flip.P : C);
    anim = { dir, corner, P0: from, complete: true, t0: now(), dur: dur || 820 };
    peek.target = 0;
    return true;
  }
  function goTo(view) {
    const v = views();
    view = Math.max(0, Math.min(v.length - 1, view));
    anim = null; queue = 0; st.flip = null; st.view = view; afterView();
  }
  function afterView() {
    const v = views();
    const around = [];
    for (let k = st.view - 1; k <= st.view + 2; k++) if (v[k]) around.push(v[k][0], v[k][1]);
    PG.ensure(around.filter((x) => x != null));
    dirty = true; syncNav(); saveSoon();
  }
  function syncNav() {
    const v = views(), cur = v[st.view];
    if (!book || !cur) { $("#num").textContent = "–"; return; }
    const pages = cur.filter((x) => x != null).map((x) => x + 1);
    $("#num").textContent = (pages.length > 1 ? pages[0] + "–" + pages[1] : pages[0]) + " / " + PG.count;
    $("#prevBtn").disabled = $("#firstBtn").disabled = st.view <= 0;
    $("#nextBtn").disabled = st.view >= v.length - 1;
  }

  /* ---------- Zoom ---------- */
  function zoomAt(screenPt, factor) {
    const w = E.toWorld(screenPt, camT);
    const z = Math.max(1, Math.min(5, camT.z * factor));
    camT = E.clampCam({ z, x: w.x - (screenPt.x - E.SW / 2) / z, y: w.y - (screenPt.y - E.SH / 2) / z });
    peek.target = 0;
  }
  function zoomReset() { camT = CAM0(); }
  const center = () => ({ x: E.SW / 2, y: E.SH / 2 });

  /* ---------- Puntatore ---------- */
  function screenPt(e) {
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * E.SW, y: (e.clientY - r.top) / r.height * E.SH };
  }
  const worldPt = (e) => E.toWorld(screenPt(e), cam);
  function pageRectX(side) { const g = geo(); return (side ? g.S : g.S - g.W) + E.offsetNow({ view: st.view, flip: null }, opts()); }
  function sideAt(p) {
    const g = geo(), ox = E.offsetNow({ view: st.view, flip: null }, opts());
    const lx = p.x - ox, cur = views()[st.view];
    if (!cur || p.y < g.y0 - 20 || p.y > g.y0 + g.H + 20) return null;
    if (layout === "single") {
      if (lx < g.S - 20 || lx > g.S + g.W + 20) return null;
      return { dir: lx < g.S + g.W / 2 ? -1 : 1, lx, ox, g };
    }
    if (lx >= g.S && lx <= g.S + g.W + 20 && cur[1] != null) return { dir: 1, lx, ox, g };
    if (lx <= g.S && lx >= g.S - g.W - 20 && cur[0] != null) return { dir: -1, lx, ox, g };
    return null;
  }
  function startPan(e) {
    pan = { sx: screenPt(e), cam: { ...camT }, moved: false, alt: e.altKey };
    cv.style.cursor = "grabbing";
  }
  function onDown(e) {
    if (!book) return;
    cv.setPointerCapture(e.pointerId);
    const p = worldPt(e);
    // spostarsi nell'ingrandimento: barra spaziatrice, tasto centrale, o strumento lente
    if (spaceDown || e.button === 1 || tool === "zoom") { startPan(e); return; }
    if (tool === "hand") {
      if (anim) return;
      const s = sideAt(p);
      if (!s || !canGo(s.dir)) { if (camT.z > 1.01) startPan(e); return; }
      const { g } = s;
      const corner = p.y < g.y0 + g.H / 2 ? "top" : "bottom";
      const { C } = E.corners(g, corner);
      const fx = s.dir > 0 ? s.lx : 2 * g.S - s.lx;
      const start = st.flip && st.flip.dir === s.dir && st.flip.corner === corner ? st.flip.P : C;
      drag = { dir: s.dir, corner, ox: s.ox, dx: start.x - fx, dy: start.y - p.y, x0: p.x, y0: p.y, moved: false };
      peek.target = 0;
      return;
    }
    if (anim || st.flip) { st.flip = null; peek.amt = peek.target = 0; }
    const h = E.hitPage(p, st, opts());
    if (!h) return;
    const T = now();
    if (tool === "erase") { stroke = { erase: true, page: h.idx, side: h.side }; if (A.eraseAt(h.idx, h.u, h.v, PG.aspect, T)) { dirty = true; saveSoon(); } return; }
    stroke = { s: A.begin(h.idx, tool, color, markMode === "fade", h.u, h.v, T), side: h.side };
    dirty = true;
  }
  function onMove(e) {
    if (pan) {
      const sp = screenPt(e);
      const dx = sp.x - pan.sx.x, dy = sp.y - pan.sx.y;
      if (Math.hypot(dx, dy) > 4) pan.moved = true;
      camT = E.clampCam({ z: pan.cam.z, x: pan.cam.x - dx / pan.cam.z, y: pan.cam.y - dy / pan.cam.z });
      cam = { ...camT };
      dirty = true;
      return;
    }
    const p = worldPt(e);
    if (drag) {
      if (!drag.moved && Math.hypot(p.x - drag.x0, p.y - drag.y0) > 6 / cam.z) drag.moved = true;
      if (!drag.moved) return;
      const g = geo();
      const lx = p.x - drag.ox;
      const fx = drag.dir > 0 ? lx : 2 * g.S - lx;
      st.flip = { dir: drag.dir, corner: drag.corner, P: E.constrain({ x: fx + drag.dx, y: p.y + drag.dy }, g, drag.corner) };
      dirty = true;
      return;
    }
    if (stroke) {
      const g = geo(), x0 = pageRectX(stroke.side);
      const u = Math.max(0, Math.min(1, (p.x - x0) / g.W)), v = Math.max(0, Math.min(1, (p.y - g.y0) / g.H));
      if (stroke.erase) { if (A.eraseAt(stroke.page, u, v, PG.aspect, now())) { dirty = true; saveSoon(); } }
      else { A.add(stroke.s, u, v, now()); dirty = true; }
      return;
    }
    if (tool === "zoom" || spaceDown) { cv.style.cursor = spaceDown ? "grab" : (e.altKey ? "zoom-out" : "zoom-in"); return; }
    if (tool === "hand" && book && !anim && e.pointerType === "mouse") {
      const s = sideAt(p);
      let tgt = 0, dir = 0, corner = "bottom";
      if (s && canGo(s.dir)) {
        const g = s.g, fx = s.dir > 0 ? s.lx : 2 * g.S - s.lx;
        const nearX = fx > g.S + g.W * 0.8;
        const nearY = p.y > g.y0 + g.H * 0.8 || p.y < g.y0 + g.H * 0.2;
        if (nearX && nearY) { tgt = 1; dir = s.dir; corner = p.y < g.y0 + g.H / 2 ? "top" : "bottom"; }
      }
      if (tgt && (peek.dir !== dir || peek.corner !== corner)) { peek.amt = 0; peek.dir = dir; peek.corner = corner; }
      peek.target = tgt;
      cv.style.cursor = tgt ? "grab" : (s && canGo(s.dir) ? "pointer" : (camT.z > 1.01 ? "grab" : "default"));
    }
  }
  function onUp(e) {
    if (pan) {
      const p = pan; pan = null; toolCursor();
      if (!p.moved && tool === "zoom") zoomAt(screenPt(e), e.altKey || e.shiftKey ? 1 / 1.6 : 1.6);
      return;
    }
    if (drag) {
      const d = drag; drag = null;
      if (!d.moved) { startFlip(d.dir, null, d.corner); return; }
      const g = geo();
      const f = st.flip;
      if (!f) return;
      const complete = f.P.x < g.S + g.W * 0.25;
      const remain = complete ? (f.P.x - (g.S - g.W)) / (2 * g.W) : (g.S + g.W - f.P.x) / (2 * g.W);
      anim = { dir: d.dir, corner: d.corner, P0: f.P, complete, t0: now(), dur: 260 + 520 * Math.max(0, Math.min(1, remain)) };
      return;
    }
    if (stroke) {
      if (!stroke.erase) A.end(stroke.s, now());
      stroke = null; dirty = true; saveSoon();
    }
  }
  function onWheel(e) {
    if (!book) return;
    e.preventDefault();
    const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018));
    zoomAt(screenPt(e), f);
  }
  function toolCursor() {
    cv.style.cursor = tool === "hand" ? "default" : tool === "erase" ? "cell" : tool === "zoom" ? "zoom-in" : "crosshair";
  }

  /* ---------- Strumenti ---------- */
  function setTool(k) { tool = k; peek.target = 0; syncUI(); toolCursor(); }
  function buildDots() {
    const box = $("#dots"); box.innerHTML = "";
    COLORS.forEach((c) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "dot"; b.style.background = c;
      b.setAttribute("aria-label", t("color") + " " + c); b.title = t("color");
      b.dataset.c = c;
      b.addEventListener("click", () => { color = c; ST.setPref("color", c); if (!["hl", "ul", "pen"].includes(tool)) setTool("hl"); syncUI(); });
      box.appendChild(b);
    });
  }
  function syncUI() {
    $$("[data-tool]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tool === tool)));
    $$("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === markMode)));
    $$("#dots .dot").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.c === color)));
    $$("#segLayout button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === layout)));
    $$("#segBg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === bgMode)));
    $("#optCover").checked = !!cover;
    $("#coverWrap").hidden = layout !== "book";
    $("#bgChip").style.background = bgColor;
    $("#bgColor").value = bgColor;
    $("#bgSwatch").style.background = bgColor;
    $("#bgSwatch").hidden = bgMode !== "color";
    $("#bgImgBtn").hidden = bgMode !== "image";
    const stage = $("#stage");
    stage.classList.toggle("checker", bgMode === "clear");
    stage.style.background = bgMode === "color" ? bgColor : bgMode === "image" ? "#000000" : "";
    stage.classList.toggle("light", bgMode === "color" && lum(bgColor) > 0.6);
    $("#stagenote").textContent = !book ? "" : t("note." + bgMode);
    const recording = !!rec;
    $("#recLabel").textContent = recording ? t("stop") : t("rec");
    $("#recIco").innerHTML = recording ? '<rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none"/>' : '<circle cx="12" cy="12" r="6" fill="currentColor" stroke="none"/>';
    $("#recPill").hidden = !recording;
    stage.classList.toggle("recording", recording);
    ["#openBtn", "#autoBtn", "#optCover"].forEach((s) => { $(s).disabled = recording || (!book && s !== "#openBtn"); });
    $$("#segLayout button, #segBg button").forEach((b) => { b.disabled = recording; });
    $("#bgColor").disabled = recording; $("#bgImgBtn").disabled = recording;
    $("#recBtn").disabled = !book;
    $$("#zoomGrp button").forEach((b) => { b.disabled = !book; });
    $("#doc").hidden = !book;
    if (book) { $("#docName").textContent = book.name; $("#docInfo").textContent = t("pages", { n: PG.count }); }
    syncNav();
    dirty = true;
  }
  function lum(hex) { const n = parseInt(hex.slice(1), 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; }

  /* ---------- Sfondo immagine ---------- */
  async function setBgImage(blob, save) {
    if (!blob) return;
    try {
      const bm = window.createImageBitmap ? await createImageBitmap(blob) : await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(blob); });
      bgImg = bm; bgBlob = blob;
      const u = URL.createObjectURL(blob);
      $("#bgImgBtn").style.backgroundImage = "url(" + u + ")";
      bgMode = "image"; ST.setPref("bgMode", bgMode);
      if (save && !window.FB_PREVIEW) ST.put("bgImage", blob);
      syncUI();
    } catch (e) { toast(t("err.image"), true); }
  }

  /* ---------- Apertura PDF ---------- */
  let toastT;
  function toast(msg, err) {
    const el = $("#toast"); el.textContent = msg; el.classList.toggle("err", !!err); el.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("show"), err ? 5000 : 2600);
  }
  function busy(on, text, frac) {
    $("#busy").hidden = !on;
    if (text != null) $("#busyText").textContent = text;
    if (frac != null) $("#busyBar").style.width = Math.round(frac * 100) + "%";
  }
  async function openData(data, name, extra) {
    extra = extra || {};
    if (rec) return;
    busy(true, t("prep.open"), 0);
    try {
      const r = await PG.openPDF(data, (i, n) => busy(true, t("prep.page", { n: i, t: n }), (i - 1) / n));
      PG.set(r.blobs, r.aspect);
      PG.setLines(r.lines);
      A.reset();
      book = { name, sample: extra.sample || null };
      st.view = 0; st.flip = null; anim = null;
      if (extra.view != null) st.view = Math.min(extra.view, views().length - 1);
      else { zoomReset(); cam = CAM0(); }
      $("#empty").hidden = true;
      afterView(); syncUI();
      const hasText = r.lines.some((l) => l && l.length);
      if (r.total > r.used) toast(t("cut", { t: r.total, n: r.used }));
      else if (!extra.sample || extra.view == null) toast(hasText ? t("ready") : t("readyNoText"));
      saveNow();
    } catch (e) {
      console.error(e);
      toast(t(e.code || "err.pdf"), true);
    } finally { busy(false); }
  }
  function isPDF(file) { return file && (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)); }
  function isImage(file) { return file && /^image\//i.test(file.type); }
  function readFile(file) {
    if (!file) return;
    if (isImage(file)) { setBgImage(file, true); return; }
    if (!isPDF(file)) { toast(t("err.pdf"), true); return; }
    file.arrayBuffer().then((b) => openData(new Uint8Array(b), file.name.replace(/\.pdf$/i, ""))).catch(() => toast(t("err.pdf"), true));
  }
  /* ---------- PDF da un link ---------- */
  // i link di condivisione dei servizi più usati portano a una pagina di anteprima: qui diventano link al file
  function directLink(raw) {
    let u;
    try { u = new URL(raw.trim()); } catch (e) { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    const h = u.hostname.replace(/^www\./, "");
    if (h === "dropbox.com") {                                     // Dropbox: ?dl=0 → file diretto
      u.hostname = "dl.dropboxusercontent.com"; u.searchParams.delete("dl"); u.searchParams.delete("raw");
    } else if (h === "drive.google.com" || h === "docs.google.com") { // Google Drive
      const m = u.pathname.match(/\/d\/([\w-]{10,})/);
      const id = (m && m[1]) || u.searchParams.get("id");
      if (id) return "https://drive.usercontent.google.com/download?id=" + id + "&export=download&confirm=t";
    } else if (h === "github.com") {                               // GitHub: pagina del file → file grezzo
      const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/);
      if (m) return "https://raw.githubusercontent.com/" + m[1] + "/" + m[2] + "/" + m[3];
    } else if (h === "1drv.ms" || h === "onedrive.live.com") {     // OneDrive: condivisione → download
      if (!u.searchParams.has("download")) u.searchParams.set("download", "1");
    }
    return u.href;
  }
  function nameFromLink(href) {
    try {
      const seg = decodeURIComponent(new URL(href).pathname.split("/").filter(Boolean).pop() || "");
      if (/\.pdf$/i.test(seg)) return seg.replace(/\.pdf$/i, "");
    } catch (e) { /* ignora */ }
    return "PDF";
  }
  function isPdfBytes(b) {
    const n = Math.min(b.length - 4, 1024);
    for (let i = 0; i < n; i++) if (b[i] === 0x25 && b[i + 1] === 0x50 && b[i + 2] === 0x44 && b[i + 3] === 0x46) return true; // %PDF
    return false;
  }
  async function openLink(raw) {
    if (rec) return;
    const url = directLink(raw);
    if (!url) { toast(t("l.errUrl"), true); return false; }
    busy(true, t("l.loading"), 0);
    let res;
    try { res = await fetch(url, { mode: "cors", credentials: "omit", redirect: "follow" }); }
    catch (e) { busy(false); toast(t("l.errCors"), true); return false; }        // il sito non lascia scaricare il file da un'altra pagina
    if (!res.ok) { busy(false); toast(t("l.errHttp", { c: res.status }), true); return false; }
    let data;
    try {
      const total = +res.headers.get("content-length") || 0;
      if (res.body && res.body.getReader) {
        const rd = res.body.getReader(), parts = [];
        let got = 0;
        for (;;) {
          const { done, value } = await rd.read();
          if (done) break;
          parts.push(value); got += value.length;
          busy(true, t("l.loadingMb", { mb: (got / 1048576).toFixed(1) }), total ? got / total : null);
        }
        data = new Uint8Array(got); let o = 0; parts.forEach((x) => { data.set(x, o); o += x.length; });
      } else data = new Uint8Array(await res.arrayBuffer());
    } catch (e) { busy(false); toast(t("l.errCors"), true); return false; }
    busy(false);
    if (!isPdfBytes(data)) { toast(t("l.errNotPdf"), true); return false; }
    await openData(data, nameFromLink(url));
    return true;
  }
  function openLinkDlg() {
    if (rec) return;
    $("#linkUrl").value = "";
    showDlg("#linkDlg");
    setTimeout(() => $("#linkUrl").focus(), 30);
  }

  // PDF di esempio: una guida all'app nella lingua scelta (cambia lingua insieme all'app)
  async function loadSample(keepView) {
    try {
      let b;
      const lang = LANG;
      if (window.FB_SAMPLES) {
        const s = atob(window.FB_SAMPLES[lang] || window.FB_SAMPLES.en);
        b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
      } else b = new Uint8Array(await (await fetch("demo/esempio-" + lang + ".pdf")).arrayBuffer());
      await openData(b, t("sampleName"), { sample: lang, view: keepView });
    } catch (e) { toast(t("err.pdf"), true); }
  }

  /* ---------- Memoria nel browser ---------- */
  let saveT;
  function saveSoon() { if (!book) return; clearTimeout(saveT); saveT = setTimeout(saveNow, 1500); }
  function saveNow() {
    if (!book || window.FB_PREVIEW) return;
    ST.save({ name: book.name, sample: book.sample || null, aspect: PG.aspect, blobs: PG.blobs, lines: PG.lines, strokes: A.exportKeep(), view: st.view });
  }
  async function restore() {
    if (window.FB_PREVIEW) return false;
    const bgb = await ST.get("bgImage");
    if (bgb) { const m = bgMode; await setBgImage(bgb, false); bgMode = m; }
    const r = await ST.load();
    if (!r || !r.blobs || !r.blobs.length) return false;
    PG.set(r.blobs, r.aspect);
    PG.setLines(r.lines || []);
    A.importKeep(r.strokes);
    book = { name: r.name || "PDF", sample: r.sample || null };
    st.view = Math.min(r.view || 0, views().length - 1);
    afterView();
    if (r.sample && r.sample !== LANG) loadSample(st.view);   // guida di esempio nella lingua attuale
    return true;
  }

  /* ---------- Registrazione dal vivo ---------- */
  function startRec() {
    if (!book || rec) return;
    anim = null; queue = 0; drag = null; peek.target = peek.amt = 0; st.flip = null;
    rec = { t0: now(), snaps: [], layout, cover };
    A.prune(now() - 10000);
    syncUI();
    toast(t("recStarted"));
  }
  function stopRec() {
    if (!rec) return;
    const r = rec; rec = null;
    const dur = now() - r.t0;
    syncUI();
    if (dur < 400) return;
    const snaps = r.snaps;
    take = {
      kind: "live", dur, layout: r.layout, cover: r.cover,
      stateAt(ms) {
        let lo = 0, hi = snaps.length - 1;
        while (lo < hi) { const m = (lo + hi + 1) >> 1; if (snaps[m].t <= ms) lo = m; else hi = m - 1; }
        const s = snaps[lo] || { view: 0, flip: null, cam: CAM0() };
        return { st: { view: s.view, flip: s.flip }, T: r.t0 + ms, cam: s.cam };
      },
    };
    openExport();
  }

  /* ---------- Video automatico ---------- */
  let aHold = ST.pref("aHold", 2), aSpeed = ST.pref("aSpeed", 0.9), aMarks = ST.pref("aMarks", "draw");
  let aAfter = ST.pref("aAfter", 1.5), aClose = ST.pref("aClose", true);
  function openAuto() {
    if (!book) return;
    const n = PG.count;
    $("#aFrom").max = $("#aTo").max = n;
    const cur = views()[st.view];
    $("#aFrom").value = (cur.find((x) => x != null) || 0) + 1;
    $("#aTo").value = n;
    const hold = $("#aHold"); hold.innerHTML = "";
    [1, 1.5, 2, 3, 5].forEach((s) => hold.appendChild(chip(s + " s", aHold === s, () => { aHold = s; ST.setPref("aHold", s); openAutoSync(); })));
    const sp = $("#aSpeed"); sp.innerHTML = "";
    [[0.6, "a.fast"], [0.9, "a.normal"], [1.4, "a.slow"]].forEach(([s, k]) => sp.appendChild(chip(t(k), aSpeed === s, () => { aSpeed = s; ST.setPref("aSpeed", s); openAutoSync(); })));
    const af = $("#aAfter"); af.innerHTML = "";
    [0.5, 1, 1.5, 2, 3, 5].forEach((s) => af.appendChild(chip(s + " s", aAfter === s, () => { aAfter = s; ST.setPref("aAfter", s); openAutoSync(); })));
    $("#aClose").checked = aClose;
    openAutoSync();
    showDlg("#autoDlg");
  }
  function chip(label, on, fn) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip"; b.textContent = label; b.setAttribute("aria-pressed", String(on));
    b.addEventListener("click", () => { $$(".chip", b.parentElement).forEach((x) => x.setAttribute("aria-pressed", "false")); b.setAttribute("aria-pressed", "true"); fn(); });
    return b;
  }
  // durata di disegno di un segno: più lungo il segno, più tempo
  function drawDur(s) { return Math.round(Math.min(2200, 350 + A.length(s, PG.aspect) * 1400)); }
  /* Piano del video: una pausa su ogni coppia di pagine (allungata se ci sono segni da disegnare) e i giri pagina */
  function autoPlan() {
    const n = PG.count, v = views();
    const from = Math.max(1, Math.min(n, +$("#aFrom").value || 1)) - 1;
    const to = Math.max(1, Math.min(n, +$("#aTo").value || n)) - 1;
    const vi = (p) => v.findIndex((x) => x[0] === p || x[1] === p);
    const a = vi(Math.min(from, to)), b = vi(Math.max(from, to));
    const H = aHold * 1000, F = aSpeed * 1000;
    const segs = [], sched = new Map();
    let tt = 0, marks = 0;
    for (let i = a; i <= b; i++) {
      const pages = v[i].filter((x) => x != null);
      let hold = H;
      if (aMarks === "draw") {
        const list = A.keepList(pages);
        let s0 = tt + 450;
        for (const s of list) { const d = drawDur(s); sched.set(s, [s0, d]); s0 += d + 220; marks++; }
        // dopo l'ultimo segno la pagina resta ferma per il tempo scelto
        if (list.length) hold = Math.max(H, s0 - 220 - tt + aAfter * 1000);
      } else marks += A.keepList(pages).length;
      segs.push({ type: "hold", view: i, t0: tt, dur: hold }); tt += hold;
      if (i < b) { segs.push({ type: "flip", view: i, t0: tt, dur: F }); tt += F; }
    }
    // richiudere il libro: un unico giro all'indietro fino alla copertina, poi una pausa
    if (aClose && b > 0) {
      segs.push({ type: "close", view: b, t0: tt, dur: 1300 }); tt += 1300;
      segs.push({ type: "hold", view: 0, t0: tt, dur: 1500 }); tt += 1500;
    }
    return { a, b, flips: b - a, dur: tt, segs, sched, marks };
  }
  function openAutoSync() {
    const p = autoPlan();
    $$("#aMarks button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === aMarks)));
    $("#aInfo").textContent = t("a.info", { f: p.flips, d: fmtDur(p.dur) });
    $("#aMarksInfo").textContent = p.marks ? t("a.marksCount", { n: p.marks }) : t("a.marksNone");
    $("#aAfterRow").hidden = aMarks !== "draw";
  }
  function buildAutoTake() {
    const p = autoPlan();
    const lay = layout, cov = cover;
    const g = E.geometry(PG.aspect, lay);
    const { C } = E.corners(g, "bottom");
    const drawMode = aMarks === "draw";
    take = {
      kind: "auto", dur: p.dur, layout: lay, cover: cov,
      stateAt(ms) {
        let seg = p.segs[p.segs.length - 1];
        for (const s of p.segs) if (ms >= s.t0 && ms < s.t0 + s.dur) { seg = s; break; }
        const reveal = drawMode ? (s) => { const x = p.sched.get(s); return x ? Math.max(0, Math.min(1, (ms - x[0]) / x[1])) : 1; } : null;
        if (seg.type === "hold") return { st: { view: seg.view, flip: null }, T: Infinity, reveal, cam: CAM0() };
        if (seg.type === "close") {
          const k = Math.min(1, (ms - seg.t0) / seg.dur);
          return { st: { view: seg.view, flip: { dir: -1, to: 0, corner: "bottom", P: E.flipPath(g, "bottom", C, k, true) } }, T: Infinity, reveal, cam: CAM0() };
        }
        const k = Math.min(1, (ms - seg.t0) / seg.dur);
        return { st: { view: seg.view, flip: { dir: 1, corner: "bottom", P: E.flipPath(g, "bottom", C, k, true) } }, T: Infinity, reveal, cam: CAM0() };
      },
    };
    hideDlg("#autoDlg");
    openExport();
  }
  const fmtDur = (ms) => { const s = Math.round(ms / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

  /* ---------- Esportazione ---------- */
  let lastBlob = null, shareFile = null, shareOK = false;
  // telefono o tablet: lì il video va nelle Foto o in WhatsApp, tramite il menu Condividi del sistema
  const isMobile = () => /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)) || matchMedia("(pointer: coarse)").matches;
  function canShareFile(f) { try { return !!(navigator.share && navigator.canShare && navigator.canShare({ files: [f] })); } catch (e) { return false; } }
  let xFmt = null, xRes = ST.pref("xRes", 1080), mp4Color = null, mp4Bg = null, xCancel = false, xUrl = null, xRunning = false;
  function openExport() {
    if (!take) return;
    // sul telefono l'MP4: si apre nelle Foto e in WhatsApp (il MOV trasparente è per Keynote sul Mac)
    if (!xFmt) xFmt = isMobile() ? "mp4" : bgMode === "clear" ? "mov" : "mp4";
    if (window.FB_NO_MOV) xFmt = "mp4";
    if (!mp4Color) mp4Color = bgMode === "color" ? bgColor : "#000000";
    mp4Bg = bgMode === "image" && bgImg ? "image" : (mp4Bg === "image" && bgImg ? "image" : "color");
    showExpState("form");
    showDlg("#expDlg");
    syncExport();
  }
  function syncExport() {
    const frames = Math.ceil(take.dur / 1000 * FPS);
    $("#expSub").textContent = t(take.kind === "auto" ? "x.subAuto" : "x.subLive", { d: fmtDur(take.dur), f: frames });
    $$(".card[data-fmt]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.fmt === xFmt));
      if (window.FB_NO_MOV && b.dataset.fmt === "mov") { b.disabled = true; b.title = t("x.movOnline"); $("[data-i18n='x.movText']", b).textContent = t("x.movOnline"); }
    });
    $("#mp4ColorRow").hidden = xFmt !== "mp4";
    $$("#mp4Bg button").forEach((b) => { b.setAttribute("aria-pressed", String(b.dataset.v === mp4Bg)); if (b.dataset.v === "image") b.disabled = !bgImg; });
    $("#mp4Sw").hidden = mp4Bg !== "color";
    $("#mp4Color").value = mp4Color;
    $("#mp4Sw").style.background = mp4Color;
    $("#mp4BgNote").textContent = mp4Bg === "image" ? t("x.imageNote") : t("x.colorNote");
    const pv = $("#mp4Prev");
    if (mp4Bg === "image" && bgBlob) { pv.style.background = "#000000 center/cover no-repeat"; pv.style.backgroundImage = $("#bgImgBtn").style.backgroundImage; }
    else { pv.style.backgroundImage = ""; pv.style.background = mp4Color; }
    const rc = $("#resChips"); rc.innerHTML = "";
    [[1080, "1920 × 1080"], [720, "1280 × 720"]].forEach(([r, l]) => rc.appendChild(chip(l, xRes === r, () => { xRes = r; ST.setPref("xRes", r); syncExport(); })));
    const secs = take.dur / 1000;
    const mb = xFmt === "mov" ? secs * (xRes === 1080 ? 12 : 6) : secs * (xRes === 1080 ? 1.6 : 0.8);
    $("#expNote").textContent = t(xFmt === "mov" ? "x.noteMov" : "x.noteMp4", { mb: mb < 10 ? mb.toFixed(1) : Math.round(mb) });
  }
  function showExpState(s) {
    $("#expForm").hidden = s !== "form";
    $("#expRun").hidden = s !== "run";
    $("#expDone").hidden = s !== "done";
    $("#expGo").hidden = s !== "form";
    $("#expDl").hidden = s !== "done";
    $("#expShare").hidden = s !== "done" || !shareOK;
    $("#expDl").classList.toggle("pri", !(s === "done" && shareOK));
    $("#expOther").hidden = s !== "done" || !!window.FB_NO_MOV;
    $("#expCancel").textContent = s === "done" ? t("close") : t("cancel");
  }
  async function runExport() {
    if (!take || xRunning) return;
    xRunning = true; xCancel = false;
    showExpState("run");
    const W = xRes === 1080 ? 1920 : 1280, H = xRes === 1080 ? 1080 : 720;
    const frames = Math.max(1, Math.ceil(take.dur / 1000 * FPS));
    const bg = xFmt === "mp4" ? (mp4Bg === "image" ? "#000000" : mp4Color) : null;
    const bgImage = xFmt === "mp4" && mp4Bg === "image" ? bgImg : null;
    const lay = take.layout, cov = take.cover;
    const v = views(lay, cov);
    const phase = (k, p) => {
      $("#expPhase").textContent = k === "load" ? t("x.loading") : t("x.making", { p: Math.round(p * 100) });
      if (p != null) $("#expBar").style.width = Math.round(p * 100) + "%";
    };
    phase("frames", 0);
    try {
      const blob = await FBExport.run({
        format: xFmt, width: W, height: H, fps: FPS, frames,
        isCancelled: () => xCancel,
        onProgress: (p, k) => phase(k, p),
        render: async (c, k, w, h) => {
          const f = take.stateAt(k * 1000 / FPS);
          const s = f.st;
          const need = [];
          const cur = v[s.view]; if (cur) need.push(cur[0], cur[1]);
          if (s.flip) { const n2 = v[s.flip.to != null ? s.flip.to : s.view + s.flip.dir]; if (n2) need.push(n2[0], n2[1]); }
          await PG.ensure(need.filter((x) => x != null));
          c.save();
          c.setTransform(w / E.SW, 0, 0, h / E.SH, 0, 0);
          E.render(c, s, opts({ bg, bgImage, T: f.T, reveal: f.reveal, layout: lay, cover: cov, cam: f.cam }));
          c.restore();
        },
      });
      if (xUrl) URL.revokeObjectURL(xUrl);
      xUrl = URL.createObjectURL(blob);
      lastBlob = blob;
      const ext = xFmt === "mov" ? "mov" : "mp4";
      const name = (book ? book.name : "flipbook").replace(/[^\w\-àèéìòù ]+/gi, "").trim().replace(/\s+/g, "-") + "-flipbook." + ext;
      const a = $("#expDl"); a.href = xUrl; a.download = name;
      $("#expFile").textContent = name;
      $("#expSize").textContent = (blob.size / 1048576).toFixed(1) + " MB";
      const vid = $("#expVideo");
      if (xFmt === "mp4") { vid.hidden = false; vid.src = xUrl; } else { vid.hidden = true; vid.removeAttribute("src"); }
      shareFile = new File([blob], name, { type: xFmt === "mov" ? "video/quicktime" : "video/mp4" });
      shareOK = isMobile() && canShareFile(shareFile);
      $("#expHow").textContent = shareOK ? t(xFmt === "mov" ? "x.shareMov" : "x.shareHow") : xFmt === "mov" ? t("x.howMov") : t("x.howMp4");
      $("#expOther").textContent = xFmt === "mov" ? t("x.alsoMp4") : t("x.alsoMov");
      showExpState("done");
    } catch (e) {
      if (e && e.message === "cancel") { showExpState("form"); }
      else {
        console.error(e);
        const msg = (e && (e.message || (e.type ? "evento " + e.type : String(e))) || "").slice(0, 160);
        const safari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);
        toast(t(safari && xFmt === "mov" ? "x.errSafari" : "x.err") + (msg ? " (" + msg + ")" : ""), true);
        showExpState("form");
      }
    } finally { xRunning = false; }
  }

  /* ---------- Finestre ---------- */
  let lastFocus = null;
  function showDlg(sel) { lastFocus = document.activeElement; $(sel).hidden = false; const f = $(sel + " button:not([hidden]):not(:disabled), " + sel + " input"); f && f.focus(); }
  function hideDlg(sel) { $(sel).hidden = true; lastFocus && lastFocus.focus && lastFocus.focus(); }
  const dlgOpen = () => !$("#expDlg").hidden || !$("#autoDlg").hidden || !$("#linkDlg").hidden;

  /* ---------- Trascina e rilascia ---------- */
  function fileOf(dt) {
    if (!dt) return null;
    if (dt.files && dt.files.length) return dt.files[0];
    if (dt.items) for (const it of dt.items) if (it.kind === "file") { const f = it.getAsFile(); if (f) return f; }
    return null;
  }
  function hasFiles(e) {
    const dt = e.dataTransfer;
    if (!dt) return false;
    const types = Array.from(dt.types || []);
    return types.includes("Files") || types.includes("application/x-moz-file") || Array.from(dt.items || []).some((i) => i.kind === "file");
  }

  /* ---------- Eventi ---------- */
  function wire() {
    const lang = $("#lang");
    lang.innerHTML = I18N.langs.map(([k, n]) => `<option value="${k}">${n}</option>`).join("");
    lang.addEventListener("change", () => {
      LANG = lang.value; ST.setPref("lang", LANG); applyStatic(); lang.blur();   // le frecce tornano a sfogliare
      if (book && book.sample && book.sample !== LANG && !rec) loadSample(st.view);
    });
    $("#openBtn").addEventListener("click", () => $("#fileIn").click());
    $("#chooseBtn").addEventListener("click", () => $("#fileIn").click());
    $("#sampleBtn").addEventListener("click", () => loadSample());
    $("#linkBtn").addEventListener("click", openLinkDlg);
    $("#linkBtn2").addEventListener("click", openLinkDlg);
    $("#linkCancel").addEventListener("click", () => hideDlg("#linkDlg"));
    $("#linkForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const v = $("#linkUrl").value;
      if (!directLink(v)) { toast(t("l.errUrl"), true); return; }
      hideDlg("#linkDlg");
      openLink(v);
    });
    $("#linkUrl").addEventListener("keydown", (e) => { if (e.key === "Escape") hideDlg("#linkDlg"); });
    $("#fileIn").addEventListener("change", (e) => { readFile(e.target.files[0]); e.target.value = ""; });
    $("#prevBtn").addEventListener("click", () => startFlip(-1));
    $("#nextBtn").addEventListener("click", () => startFlip(1));
    $("#firstBtn").addEventListener("click", () => goTo(0));
    $("#zoomIn").addEventListener("click", () => zoomAt(center(), 1.4));
    $("#zoomOut").addEventListener("click", () => zoomAt(center(), 1 / 1.4));
    $("#zoomPct").addEventListener("click", zoomReset);
    $$("[data-tool]").forEach((b) => b.addEventListener("click", () => setTool(b.dataset.tool)));
    $$("[data-mode]").forEach((b) => b.addEventListener("click", () => { markMode = b.dataset.mode; ST.setPref("markMode", markMode); if (!["hl", "ul", "pen"].includes(tool)) setTool("ul"); syncUI(); }));
    $("#clearBtn").addEventListener("click", () => {
      const cur = views()[st.view]; if (!cur) return;
      let n = 0; cur.forEach((p) => { if (p != null) n += A.clearPage(p, now()); });
      dirty = true; saveSoon(); toast(n ? t("cleared") : t("nothingToClear"));
    });
    const relayout = (fn) => {
      const cur = views()[st.view], first = cur ? cur.find((x) => x != null) : 0;
      fn();
      const v = views(); goTo(Math.max(0, v.findIndex((x) => x[0] === first || x[1] === first)));
      syncUI();
    };
    $$("#segLayout button").forEach((b) => b.addEventListener("click", () => { if (layout !== b.dataset.v) relayout(() => { layout = b.dataset.v; ST.setPref("layout", layout); }); }));
    $("#optCover").addEventListener("change", (e) => relayout(() => { cover = e.target.checked; ST.setPref("cover", cover); }));
    $$("#segBg button").forEach((b) => b.addEventListener("click", () => {
      if (b.dataset.v === "image" && !bgImg) { $("#bgFile").click(); return; }
      bgMode = b.dataset.v; ST.setPref("bgMode", bgMode); syncUI();
    }));
    $("#bgColor").addEventListener("input", (e) => { bgColor = e.target.value; bgMode = "color"; ST.setPref("bgColor", bgColor); ST.setPref("bgMode", bgMode); syncUI(); });
    $("#bgImgBtn").addEventListener("click", () => $("#bgFile").click());
    $("#bgFile").addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) setBgImage(f, true); });
    $("#recBtn").addEventListener("click", () => (rec ? stopRec() : startRec()));
    $("#autoBtn").addEventListener("click", openAuto);
    $("#aGo").addEventListener("click", buildAutoTake);
    ["#aFrom", "#aTo"].forEach((s) => $(s).addEventListener("input", openAutoSync));
    $$("#aMarks button").forEach((b) => b.addEventListener("click", () => { aMarks = b.dataset.v; ST.setPref("aMarks", aMarks); openAutoSync(); }));
    $("#aClose").addEventListener("change", (e) => { aClose = e.target.checked; ST.setPref("aClose", aClose); openAutoSync(); });
    $$("[data-close]").forEach((b) => b.addEventListener("click", () => hideDlg("#" + b.closest(".veil").id)));
    $$(".card[data-fmt]").forEach((b) => b.addEventListener("click", () => { xFmt = b.dataset.fmt; syncExport(); }));
    $$("#mp4Bg button").forEach((b) => b.addEventListener("click", () => { mp4Bg = b.dataset.v; syncExport(); }));
    $("#mp4Color").addEventListener("input", (e) => { mp4Color = e.target.value; syncExport(); });
    $("#expGo").addEventListener("click", runExport);
    $("#expDl").addEventListener("click", (e) => {
      if (!window.FB_SAVE || !lastBlob) return;
      e.preventDefault();
      window.FB_SAVE($("#expDl").download, lastBlob).catch(() => toast(t("x.saveErr"), true));
    });
    $("#expShare").addEventListener("click", async () => {
      if (!shareFile) return;
      try { await navigator.share({ files: [shareFile], title: shareFile.name }); }
      catch (e) { if (!e || e.name !== "AbortError") toast(t("x.shareErr"), true); }
    });
    $("#expCancel").addEventListener("click", () => {
      if (xRunning) { xCancel = true; FBExport.cancel(); return; }
      hideDlg("#expDlg");
    });
    $("#expOther").addEventListener("click", () => { xFmt = xFmt === "mov" ? "mp4" : "mov"; showExpState("form"); syncExport(); });
    $("#fsBtn").addEventListener("click", () => {
      const el = $("#stagewrap");
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      if (fsEl) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    });
    ["fullscreenchange", "webkitfullscreenchange"].forEach((ev) => document.addEventListener(ev, () => { resize(); setTimeout(resize, 60); setTimeout(resize, 250); }));

    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("pointercancel", onUp);
    cv.addEventListener("pointerleave", () => { peek.target = 0; });
    cv.addEventListener("wheel", onWheel, { passive: false });
    cv.addEventListener("auxclick", (e) => e.preventDefault());
    new ResizeObserver(resize).observe($("#stagewrap"));
    new ResizeObserver(resize).observe(cv);
    window.addEventListener("resize", resize);

    document.addEventListener("keydown", (e) => {
      if (e.target && e.target.closest && e.target.closest("input,select,textarea")) return;
      if (dlgOpen()) {
        if (e.key === "Escape" && !xRunning) { $("#expDlg").hidden = true; $("#autoDlg").hidden = true; $("#linkDlg").hidden = true; }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      const map = { h: "hand", e: "hl", u: "ul", p: "pen", g: "erase", z: "zoom" };
      if (k === " ") { e.preventDefault(); if (!spaceDown) { spaceDown = true; cv.style.cursor = "grab"; } return; }
      if (["ArrowRight", "ArrowDown", "PageDown"].includes(k)) { e.preventDefault(); startFlip(1); }
      else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(k)) { e.preventDefault(); startFlip(-1); }
      else if (k === "Home") goTo(0);
      else if (k === "End") goTo(views().length - 1);
      else if (k === "+" || k === "=") zoomAt(center(), 1.4);
      else if (k === "-" || k === "_") zoomAt(center(), 1 / 1.4);
      else if (k === "0") zoomReset();
      else if (map[k.toLowerCase()]) setTool(map[k.toLowerCase()]);
      else if (k.toLowerCase() === "m") { markMode = markMode === "keep" ? "fade" : "keep"; ST.setPref("markMode", markMode); syncUI(); }
      else if (k.toLowerCase() === "r" && book) { rec ? stopRec() : startRec(); }
      else if (k === "Escape" && rec) stopRec();
    });
    document.addEventListener("keyup", (e) => { if (e.key === " ") { spaceDown = false; toolCursor(); } });

    // trascina e rilascia: PDF (apre il libro) o immagine (diventa lo sfondo), ovunque nella finestra
    let depth = 0;
    const show = (on) => { $("#drop").hidden = !on || !book; $("#dropzone").classList.toggle("over", on); };
    window.addEventListener("dragenter", (e) => { if (!hasFiles(e) || rec) return; e.preventDefault(); depth++; show(true); });
    window.addEventListener("dragover", (e) => { if (!hasFiles(e)) return; e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; });
    window.addEventListener("dragleave", (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) show(false); });
    window.addEventListener("drop", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); depth = 0; show(false);
      if (!rec && !dlgOpen()) readFile(fileOf(e.dataTransfer));
    });
    window.addEventListener("beforeunload", saveNow);
    PG.onReady = () => { dirty = true; };
  }

  /* ---------- Avvio ---------- */
  async function start() {
    LANG = detectLang();
    wire();
    applyStatic();
    setTool("hand");
    resize();
    requestAnimationFrame(frame);
    // indirizzo dell'app con ?pdf=<link>: apre subito quel PDF (utile da condividere)
    let qpdf = null;
    try { qpdf = new URLSearchParams(location.search).get("pdf"); } catch (e) { /* ignora */ }
    const had = await restore();
    const ok = qpdf ? (await openLink(qpdf)) || had : had;
    if (!ok) {
      $("#empty").hidden = false;
      if (window.FB_PREVIEW) loadSample();
    }
    syncUI();
    window.FBApp = { st, get take() { return take; }, startFlip, goTo, startRec, stopRec, setTool, runExport, zoomAt, get cam() { return camT; }, get layout() { return layout; } };
  }
  start();
})();

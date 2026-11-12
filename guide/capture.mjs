// The Ultraspeaker Flipbook Lab — screenshot della guida d'utilizzo.
// Uso, dalla radice del repository:   node guide/capture.mjs
// Serve il Lab in locale, lo apre con Playwright e salva in guide/img/<lingua>/ gli screenshot di ogni capitolo
// (scala 2×: 1440 px web, 350 px pannello), più pins.json con la posizione dei richiami.
// Il PDF sfogliato è la guida di esempio del Lab; lo sfondo è The Shadow del Brand Book. Nessun dato personale.
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

let chromium;
try { ({ chromium } = await import("playwright")); }
catch { ({ chromium } = createRequire(import.meta.url)("playwright")); }

const ROOT = resolve(process.cwd());
const LANGS = ["it", "en", "es", "fr", "de"];
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".json": "application/json", ".pdf": "application/pdf", ".webmanifest": "application/manifest+json" };

// Server statico minimo: niente dipendenze
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = join(ROOT, path === "/" ? "index.html" : path);
    if (!file.startsWith(ROOT)) throw new Error("fuori dalla cartella");
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}/`;
const SHADOW = await readFile(join(ROOT, "shared/guide/the-shadow.jpg"));

const browser = await chromium.launch();
const pins = {};

async function open(lang, width, height, page = "index.html", officeLang) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: lang });
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem("g")) { localStorage.clear(); indexedDB.deleteDatabase("flipbook-lab"); sessionStorage.setItem("g", 1); } } catch (e) { /* niente memoria */ } });
  // pannello: PowerPoint simulato; versione web: Office.js assente
  const office = officeLang ? `window.Office={context:{displayLanguage:"${officeLang}",ui:{openBrowserWindow(){}}},onReady:(f)=>setTimeout(()=>f({host:"PowerPoint"}),10)};` : "";
  await ctx.route(/appsforoffice/, (r) => r.fulfill({ body: office, contentType: "text/javascript" }));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.error("errore nella pagina:", e.message));
  await p.goto(BASE + page + "?lang=" + lang, { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(500);
  return p;
}
async function sample(p) {
  await p.click("#sampleBtn");
  await p.waitForFunction(() => window.FBPages && FBPages.count > 0 && document.getElementById("busy").hidden);
  await p.evaluate(() => document.getElementById("toast").classList.remove("show"));
  await p.waitForTimeout(700);
}
const rect = (p, sel) => p.locator(sel).first().evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
// richiamo su un punto di un elemento (dx, dy in frazioni: fuori da 0–1 sta accanto, così non copre le scritte), in percentuale della schermata intera
async function pin(p, sel, n, W, H, dx = 0.5, dy = 0.5) {
  const r = await rect(p, sel);
  return { n, left: +((r.x + r.w * dx) / W * 100).toFixed(1), top: +((r.y + r.h * dy) / H * 100).toFixed(1) };
}
async function shotOf(p, sel, file, pad = 0) {
  const r = await rect(p, sel);
  await p.screenshot({ path: file, clip: { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.w + pad * 2, height: r.h + pad * 2 } });
}
// trascina con il mouse tra due punti del libro, in frazioni della tela
async function stroke(p, a, b) {
  const r = await rect(p, "#cv");
  await p.mouse.move(r.x + r.w * a[0], r.y + r.h * a[1]); await p.mouse.down();
  await p.mouse.move(r.x + r.w * b[0], r.y + r.h * b[1], { steps: 12 }); await p.mouse.up();
}

for (const lang of LANGS) {
  const dir = join(ROOT, "guide/img", lang);
  await mkdir(dir, { recursive: true });
  pins[lang] = {};

  // 1. libro aperto con i segni: panoramica dell'interfaccia
  let p = await open(lang, 1440, 900);
  await sample(p);
  await p.keyboard.press("ArrowRight"); await p.waitForTimeout(1100);
  await p.keyboard.press("ArrowRight"); await p.waitForTimeout(1100);
  await p.keyboard.press("u"); await stroke(p, [0.585, 0.335], [0.7, 0.335]);
  await p.click('#dots [data-c="#ff5a4f"]'); await p.keyboard.press("p"); await stroke(p, [0.3, 0.66], [0.4, 0.69]);
  await p.click('#dots [data-c="#ffd400"]'); await p.keyboard.press("e");
  await p.mouse.move(10, 10); await p.waitForTimeout(400);
  await p.screenshot({ path: join(dir, "overview.png") });
  pins[lang].overview = [
    await pin(p, ".us-header-tools", 1, 1440, 900, -0.025, 0.5),
    await pin(p, "#tools", 2, 1440, 900, 1, 0.3),
    await pin(p, "#stage", 3, 1440, 900, 0.5, 0.06),
    await pin(p, ".bottom .nav", 4, 1440, 900, 0.5, -0.45),
    await pin(p, "#fmtSel", 5, 1440, 900, 0.5, -0.45),
    await pin(p, "#segBg", 6, 1440, 900, 0.5, -0.45),
    await pin(p, "#recBtn", 7, 1440, 900, 0.5, -0.4),
  ];
  // 2. finestra «Da un link»
  await p.click("#linkBtn"); await p.waitForTimeout(250);
  await shotOf(p, "#linkDlg .dlg", join(dir, "link.png"));
  await p.keyboard.press("Escape");
  // 3. formato 3:1, sfondo immagine e strumento Sposta
  await p.selectOption("#fmtSel", "3:1"); await p.waitForTimeout(300);
  await p.setInputFiles("#bgFile", { name: "the-shadow.jpg", mimeType: "image/jpeg", buffer: SHADOW });
  await p.waitForTimeout(500);
  await p.keyboard.press("v"); await p.waitForTimeout(200);
  await p.click("#placeOut"); await p.click("#placeOut"); await p.click("#placeOut");
  const st = await rect(p, "#cv");
  await p.mouse.move(st.x + st.w * 0.5, st.y + st.h * 0.5); await p.mouse.down();
  await p.mouse.move(st.x + st.w * 0.68, st.y + st.h * 0.53, { steps: 10 }); await p.mouse.up();
  await p.mouse.move(st.x + st.w * 0.95, st.y + st.h * 0.9); await p.waitForTimeout(300);
  await shotOf(p, "#stage", join(dir, "move.png"));
  // 4. formato personalizzato
  await p.selectOption("#fmtSel", "custom"); await p.waitForTimeout(200);
  await p.fill("#fmtW", "1500"); await p.fill("#fmtH", "500"); await p.dispatchEvent("#fmtW", "input");
  await shotOf(p, "#fmtDlg .dlg", join(dir, "custom.png"));
  await p.click("#fmtDlg [data-close]");
  await p.selectOption("#fmtSel", "16:9"); await p.click("#placeReset"); await p.keyboard.press("h");
  await p.click('#segBg [data-v="clear"]'); await p.waitForTimeout(200);
  // 5. video automatico ed esportazione
  await p.click("#autoBtn"); await p.waitForTimeout(250);
  await p.fill("#aFrom", "1"); await p.fill("#aTo", "6"); await p.dispatchEvent("#aTo", "input");
  await shotOf(p, "#autoDlg .dlg", join(dir, "auto.png"));
  await p.click("#aGo"); await p.waitForTimeout(250);
  await p.click('[data-fmt="mp4"]'); await p.waitForTimeout(150);
  await shotOf(p, "#expDlg .dlg", join(dir, "export.png"));
  await p.context().close();

  // 6. pannello di PowerPoint (simulato, 350 px)
  p = await open(lang, 350, 760, "addin.html", { it: "it-IT", en: "en-GB", es: "es-ES", fr: "fr-FR", de: "de-DE" }[lang]);
  const main = await rect(p, ".panel-main > .note");   // fino alla nota sotto il pulsante: i passi sono già nella guida
  await p.screenshot({ path: join(dir, "panel.png"), clip: { x: 0, y: 0, width: 350, height: Math.ceil(main.y + main.h + 16) } });
  await p.context().close();
  console.log("ok", lang);
}
await writeFile(join(ROOT, "guide/img/pins.json"), JSON.stringify(pins, null, 1));
await browser.close(); server.close();

// The Ultraspeaker Check Lab — screenshot della guida d'utilizzo.
// Uso, dalla radice del repository:   node guide/capture.mjs
// Serve il Lab in locale, lo apre con Playwright e salva in guide/img/<lingua>/ gli screenshot di ogni capitolo
// (scala 2×: 1440 px web, 350 px pannello), più pins.json con la posizione dei richiami.
// La presentazione analizzata è test/Check-Lab-test-problemi.pptx, con problemi voluti e nessun dato personale.
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

let chromium;
try { ({ chromium } = await import("playwright")); }
catch { ({ chromium } = createRequire(import.meta.url)("playwright")); }

const ROOT = resolve(process.cwd());
const LANGS = ["it", "en", "es", "fr", "de"];
const SAMPLE = join(ROOT, "test/Check-Lab-test-problemi.pptx");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".json": "application/json", ".webmanifest": "application/manifest+json" };

// Server statico minimo: niente dipendenze
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = path === "/__sample" ? SAMPLE : join(ROOT, path === "/" ? "index.html" : path);
    if (!file.startsWith(ROOT)) throw new Error("fuori dalla cartella");
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}/`;

// PowerPoint simulato per il pannello: consegna la presentazione di prova come farebbe getFileAsync
const OFFICE = (lang) => `window.Office={AsyncResultStatus:{Succeeded:"ok"},FileType:{Compressed:"c"},PlatformType:{PC:"PC",Mac:"Mac"},GoToType:{Index:"i"},
onReady(cb){setTimeout(cb,0);return Promise.resolve()},
context:{platform:"PC",displayLanguage:"${lang}",requirements:{isSetSupported:()=>true},ui:{openBrowserWindow(){}},
document:{url:"C:/Talk/Check-Lab-test.pptx",getFileAsync(t,o,cb){fetch("/__sample").then(r=>r.arrayBuffer()).then(b=>{const u=new Uint8Array(b);
cb({status:"ok",value:{size:u.length,sliceCount:1,getSliceAsync(i,c){c({status:"ok",value:{data:u}})},closeAsync(){}}})})},goToByIdAsync(n,t,cb){cb({status:"ok"})}}}};
window.PowerPoint={run:async()=>{},createPresentation:async()=>{},GeometricShapeType:{},ShapeZOrder:{}};`;

const browser = await chromium.launch();
const pins = {};

async function open(lang, width, height, addin) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: lang });
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem("g")) { localStorage.clear(); sessionStorage.setItem("g", 1); } } catch (e) { /* niente memoria */ } });
  await ctx.route(/appsforoffice/, (r) => r.fulfill({ body: addin ? OFFICE(lang) : "", contentType: "text/javascript" }));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.error("errore nella pagina:", e.message));
  await p.goto(BASE + (addin ? "addin/taskpane.html" : "index.html") + "?lang=" + lang, { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  return p;
}
const rect = (p, sel) => p.locator(sel).first().evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top + scrollY, w: r.width, h: r.height }; });
// richiamo subito a sinistra di un elemento (così non copre le scritte), alla sua altezza dy; in percentuale dell'area fotografata
async function pin(p, sel, n, clip, dy = 0.5) {
  const r = await rect(p, sel);
  return { n, left: +((r.x - 18 - clip.x) / clip.width * 100).toFixed(1), top: +((r.y + r.h * dy - clip.y) / clip.height * 100).toFixed(1) };
}
async function area(p, top, bottom, pad = 12, left = 40) {
  const a = await rect(p, top), b = await rect(p, bottom), W = await p.evaluate(() => innerWidth);
  const x = Math.max(0, Math.min(a.x, b.x) - left), right = Math.min(W, Math.max(a.x + a.w, b.x + b.w) + pad);
  return { x, y: Math.max(0, a.y - pad), width: right - x, height: b.y + b.h - a.y + pad * 2 };
}
async function shot(p, file, clip) { await p.screenshot({ path: file, clip, fullPage: true }); }
async function check(p, room) {
  await p.setInputFiles("#cl-file", SAMPLE);
  await p.waitForSelector("[data-ask]");
  if (room) { await p.click(`[data-ask="${room}"]`); await p.waitForSelector(".cl-counts", { timeout: 120000 }); }
}

for (const lang of LANGS) {
  const dir = join(ROOT, "guide/img", lang);
  await mkdir(dir, { recursive: true });
  pins[lang] = {};

  // 02 · panoramica della scheda Controllo
  let p = await open(lang, 1440, 1000);
  let clip = { x: 316, y: 0, width: 808, height: 640 };
  await shot(p, join(dir, "02-overview.png"), clip);
  pins[lang].overview = [await pin(p, "#usLang", 1, clip), await pin(p, ".us-tabs", 2, clip), await pin(p, "#cl-drop", 3, clip, 0.15),
    await pin(p, ".cl-main > section.cl-panel h2", 4, clip)];

  // 03 · la domanda sulla sala, poi il tempo per slide
  await p.selectOption('select[data-set="venueOS"]', "win");
  await p.fill('input[data-set="minutes"]', "20");
  await p.dispatchEvent('input[data-set="minutes"]', "change");
  await check(p, null);
  clip = await area(p, ".cl-main > section", ".cl-main > section", 16);
  await shot(p, join(dir, "03-room.png"), clip);
  await p.click('[data-ask="sala"]');
  await p.waitForSelector(".cl-counts", { timeout: 120000 });

  // 04 · il report: conteggi e prima voce con elenco, consiglio, valutazione e nota aperti
  await p.click(".cl-issue details[data-open^='list:'] summary");
  await p.click(".cl-issue .cl-fixd summary");
  await p.click(".cl-issue [data-noteopen]");
  await p.fill(".cl-issue .cl-notein", { it: "Font installato in regia, verificato con la segreteria", en: "Font installed at the AV desk, checked with the organisers", es: "Fuente instalada en la cabina, comprobado con la secretaría", fr: "Police installée en régie, vérifié avec le secrétariat", de: "Schrift in der Technik installiert, mit dem Sekretariat geprüft" }[lang]);
  await p.locator(".cl-issue .cl-notein").first().blur();
  clip = await area(p, ".cl-main > section", ".cl-issue", 16);
  await shot(p, join(dir, "04-report.png"), clip);
  pins[lang].report = [await pin(p, ".cl-counts", 1, clip), await pin(p, ".cl-issue .title", 2, clip), await pin(p, ".cl-issue details[data-open^='list:'] summary", 3, clip),
    await pin(p, ".cl-issue .cl-fixd summary", 4, clip), await pin(p, ".cl-issue .cl-judge", 5, clip), await pin(p, ".cl-issue .cl-notein", 6, clip, 0.3)];
  // l'elenco «OK» con «Valuta»
  clip = await area(p, ".cl-h3.ok", ".cl-oklist", 16);
  await shot(p, join(dir, "04-ok.png"), clip);

  // 03 · tempo per slide dopo il controllo
  await p.click('[data-tab="check"]');
  clip = await area(p, 'section:has([data-set="minutes"]) h2', 'select[data-set="rows"]', 16);
  await shot(p, join(dir, "03-talk.png"), clip);

  // 06 · scheda Stile e spiegazione del contrasto
  await p.click('[data-tab="style"]');
  clip = await area(p, ".st-quick", ".st-quick", 16);
  await shot(p, join(dir, "06-style.png"), clip);
  pins[lang].style = [await pin(p, ".st-card", 1, clip, 0.25), await pin(p, ".st-pills", 2, clip), await pin(p, ".st-controls", 3, clip, 0.2), await pin(p, "#st-best", 4, clip, 0.1), await pin(p, ".st-toggle", 5, clip)];
  await p.click('[data-st="info"]');
  clip = await area(p, ".cl-modal-box", ".cl-modal-box", 0, 0);
  await shot(p, join(dir, "06-contrast.png"), clip);
  await p.keyboard.press("Escape");

  // 07 · scheda Regia
  await p.click('[data-tab="venue"]');
  await p.fill('[data-del="date"]', "2026-12-04"); await p.fill('[data-del="time"]', "10:30");
  await p.fill('[data-del="room"]', { it: "Sala A", en: "Room A", es: "Sala A", fr: "Salle A", de: "Saal A" }[lang]);
  await p.fill('[data-del="surname"]', "Rossi"); await p.fill('[data-del="talk"]', { it: "Carico immediato", en: "Immediate loading", es: "Carga inmediata", fr: "Mise en charge immédiate", de: "Sofortbelastung" }[lang]);
  clip = await area(p, ".cl-main > section", ".cl-main > section", 16);
  await shot(p, join(dir, "07-name.png"), clip);
  clip = await area(p, ".cl-main > section:last-of-type", ".cl-main > section:last-of-type", 16);
  await shot(p, join(dir, "07-kits.png"), clip);
  await p.context().close();

  // 04 · pannello di PowerPoint (350 px)
  p = await open(lang, 350, 900, true);
  await p.click("#cl-start");
  await p.waitForSelector("[data-ask]"); await p.click('[data-ask="sala"]');
  await p.waitForSelector(".cl-counts", { timeout: 120000 });
  await p.click(".cl-issue details[data-open^='list:'] summary");
  clip = await area(p, ".us-header", ".cl-issue .cl-items", 0, 0);
  clip.x = 0; clip.width = 350; clip.height = Math.min(clip.height, 1100);
  await shot(p, join(dir, "04-panel.png"), clip);
  await p.context().close();
  console.log("ok", lang);
}
await writeFile(join(ROOT, "guide/img/pins.json"), JSON.stringify(pins, null, 1));
await browser.close();
server.close();

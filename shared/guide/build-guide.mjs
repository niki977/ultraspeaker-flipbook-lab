// The Ultraspeaker Lab — generatore delle guide PDF · versione 1.3 (novembre 2026)
// File IDENTICO in tutti i Lab: shared/guide/build-guide.mjs
// Uso, dalla radice del repository:   node shared/guide/build-guide.mjs
// Legge guide/guide.config.json  →  {"slug": "qr"}
// Trasforma guide/src/guide.<lingua>.html in guide/<slug>-lab-guide-<lingua>.pdf per it, en, es, fr, de.
// Serve Playwright con Chromium (solo per chi genera le guide, non per il sito):
//   se manca, installalo fuori dal repository o in node_modules escluso da .gitignore.
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Playwright come modulo del progetto o, se non c'è, installato globalmente (NODE_PATH)
let chromium;
try { ({ chromium } = await import("playwright")); }
catch { ({ chromium } = createRequire(import.meta.url)("playwright")); }

const LANGS = ["it", "en", "es", "fr", "de"];
const root = process.cwd();
const { slug } = JSON.parse(readFileSync(resolve(root, "guide/guide.config.json"), "utf8"));
if (!slug) throw new Error("guide/guide.config.json: manca \"slug\"");

const browser = await chromium.launch();
const page = await browser.newPage();
let errors = 0;
for (const lang of LANGS) {
  const src = resolve(root, `guide/src/guide.${lang}.html`);
  if (!existsSync(src)) { console.error(`MANCA ${src}`); errors++; continue; }
  page.removeAllListeners("requestfailed");
  page.on("requestfailed", (r) => { console.error(`[${lang}] risorsa non trovata: ${r.url()}`); errors++; });
  await page.goto(pathToFileURL(src).href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const out = resolve(root, `guide/${slug}-lab-guide-${lang}.pdf`);
  await page.pdf({ path: out, preferCSSPageSize: true, printBackground: true, tagged: true });
  console.log(`ok  ${out}`);
}
await browser.close();
if (errors) { console.error(`${errors} problemi: controlla i messaggi sopra`); process.exit(1); }

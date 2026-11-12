# The Ultraspeaker Flipbook Lab

App web che trasforma un .pdf in un **libro da sfogliare**: lo sottolinei e registri un **video** da mettere nelle slide.

- **MOV trasparente** (ProRes 4444 con canale alfa) per Keynote.
- **MP4 con colore o immagine** (H.264) per PowerPoint: con lo sfondo della slide sembra trasparente.

Funziona nel browser, senza installare nulla, in italiano, inglese, spagnolo, francese e tedesco. Il PDF non lascia il dispositivo.

- **Indirizzo:** https://niki977.github.io/ultraspeaker-flipbook-lab/
- **Repository:** https://github.com/niki977/ultraspeaker-flipbook-lab (GitHub Pages, ramo `main`, cartella principale)
- **Famiglia:** The Ultraspeaker Lab (QR, Image, Flipbook, Projector, Check), uniformati alla linea guida 1.3 con il kit comune in `shared/`.

## Cosa fa

- **Aprire un PDF:** Apri PDF, trascinamento nella finestra (un'immagine trascinata diventa lo sfondo), **Link** (Dropbox, Google Drive, OneDrive, GitHub o link diretto; il file deve essere pubblico e scaricabile da altre pagine). `?pdf=<link>` apre subito un PDF, `?lang=it|en|es|fr|de` sceglie la lingua.
- **Sfogliare:** angolo trascinabile, clic, frecce; vista Libro (copertina da sola) o Pagina.
- **Segni:** Evidenzia (E) e Sottolinea (U) agganciati al testo del PDF, Penna (P), Gomma (G), sei colori; segni che restano o che svaniscono dopo 3 secondi (M).
- **Zoom:** rotellina, pizzico, pulsanti − % +, Lente (Z) e Lente − (⇧Z). Lo zoom entra nella registrazione.
- **Formato del video:** 16:9, 4:3, 3:1 o personalizzato (larghezza × altezza in pixel, da 160 a 3840).
- **Sposta (V):** trascina il libro sul palco; rotellina, pizzico o − % + per ingrandirlo o rimpicciolirlo; «Centra» lo rimette al centro. Serve a collocarlo sopra un'immagine di sfondo e vale anche nel video.
- **Sfondo:** trasparente, colore o immagine.
- **Registra** (R) dal vivo oppure **Video automatico** (pagine, secondi, velocità, sottolineature che si disegnano da sole, chiusura sulla copertina).
- **Esporta:** MOV o MP4. Con i formati fissi a 1080 o 720 px di altezza, con quello personalizzato alla misura esatta. «Scarica il video», «Salva in…» (Chrome, Edge) e, sul telefono, «Salva o condividi».
- **Memoria:** sul computer l'ultimo PDF, la pagina e i segni (IndexedDB `flipbook-lab`); le preferenze in `ultraspeaker.flipbook.*`, la lingua in `ultraspeaker.lang`. Le vecchie chiavi `flipbooklab.*` vengono copiate e cancellate al primo avvio.
- **Pannello di PowerPoint** (in prova, fase 2): `addin.html` apre l'app nel browser, perché PowerPoint per Mac non lascia salvare file ai componenti aggiuntivi.

## File

| File | Contenuto |
|---|---|
| `index.html`, `css/app.css` | Interfaccia e stile proprio del Lab (dopo `shared/ultraspeaker-lab.css`) |
| `js/app.js` | Collegamenti tra interfaccia, formato, strumento Sposta, registrazione, esportazione e memoria |
| `js/engine.js` | Libro disegnato su canvas: piega, ombre, zoom, palco a formato variabile, posizione del libro |
| `js/annot.js` | Segni agganciati al testo, sbiadimento, gomma |
| `js/pages.js` | PDF → immagini con pdf.js, righe di testo, cache |
| `js/store.js` | Memoria del browser e migrazione delle preferenze |
| `js/export.js` | MOV (ffmpeg.wasm + muxer MOV) e MP4 (WebCodecs + mp4-muxer) |
| `js/i18n.js` | Testi nelle cinque lingue, anche del pannello (`p.*`) |
| `js/addin.js`, `addin.html` | Pannello di PowerPoint |
| `js/legal.js` | Menu e lingua delle pagine di servizio |
| `support.html`, `privacy.html`, `terms.html`, `GUIDA-INSTALLAZIONE.html` | Pagine di servizio, cinque lingue nel file |
| `ultraspeaker-flipbook-lab-manifest.xml` | Manifest dell'add-in (Id `efb799d0-d3c9-41ef-bb99-1e0e0cbf0a3b`) |
| `site.webmanifest` | Nome e icone per la schermata Home |
| `guide/` | Guide d'utilizzo PDF, sorgenti, screenshot e `capture.mjs` |
| `demo/` | Guida di esempio da sfogliare, in cinque lingue |
| `shared/`, `fonts/` | Kit comune 1.3 e Champagne & Limousines (non si modificano qui) |
| `vendor/` | pdf.js (Apache 2.0), mp4-muxer (MIT), ffmpeg.wasm (MIT; core FFmpeg GPL-2.0-or-later, vedi `vendor/ffmpeg/LICENZE.txt`) |

## Decisioni tecniche da non annullare

- **Trasparenza in Keynote:** `fixProres()` in `export.js` corregge i fotogrammi ProRes di ffmpeg 5/6 (versione dell'intestazione 1, bit di ripetizione alla fine dei dati alfa).
- **MOV in Safari:** il motore riparte ogni 15 blocchi e ogni blocco si ritenta una volta, contro i limiti di memoria.
- **Pagine bianche in Safari:** si salvano byte e non Blob in IndexedDB; pdf.js con `disableFontFace`.
- **MP4** solo con WebCodecs; il livello H.264 sale con la misura del video (4.0 fino a 1920 × 1080, poi 5.0 o 5.1).

## Pubblicare un aggiornamento

Si usa sempre **GitHub Desktop**: `vendor/ffmpeg/ffmpeg-core.wasm` pesa 31 MB, oltre il limite di 25 MB del caricamento dal sito.

1. Estrai lo zip e copiane il contenuto nella cartella del repository (**Sostituisci**). I file da eliminare vanno tolti a mano.
2. In GitHub Desktop scrivi il messaggio, **Commit to main**, poi **Push origin**.
3. Dopo 1–2 minuti ricarica il sito con ⌘⇧R.

A ogni rilascio si aggiorna `?v=AAAAMMGG` su CSS e JS.

## Aggiornare la guida d'utilizzo

```bash
node guide/capture.mjs              # rifà gli screenshot in guide/img/<lingua>/
node shared/guide/build-guide.mjs   # genera guide/flipbook-lab-guide-<lingua>.pdf
```

Servono Node e Playwright (`npm i playwright`, fuori dal repository o con `node_modules/` ignorato).

## Versioni

- **1.1 (novembre 2026):** linea guida 1.3 (kit comune, intestazione, chiusura, pagine di servizio, lingua comune, chiavi `ultraspeaker.flipbook.*`), formato del video a scelta, strumento Sposta, guida d'utilizzo PDF, manifest 1.1.0.0.
- **1.0 (ottobre 2026):** prima versione online; Brand Book 1.0, componente aggiuntivo che apre l'app nel browser.

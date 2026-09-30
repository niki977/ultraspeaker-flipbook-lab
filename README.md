# The Ultraspeaker Flipbook Lab

App online che trasforma un PDF in un **libro da sfogliare**, con **sottolineature** e **registrazione video**:
MOV con **sfondo trasparente** per Keynote, MP4 con **il colore della slide** per PowerPoint.
Funziona nel browser (Chrome, Edge, Safari recenti), senza installare nulla. Interfaccia in italiano, inglese, spagnolo, francese e tedesco.

## Cosa fa

- **Sfogliare**: trascina l’angolo della pagina, clicca sulla pagina, usa ◀ ▶ o le frecce della tastiera.
  Vista **Libro** (due pagine, copertina da sola) o **Pagina** singola.
- **Aprire un PDF**: pulsante Apri PDF oppure trascinalo nella finestra (anche con un libro già aperto). Trascinando un’immagine, diventa lo sfondo.
- **Da un link**: pulsante **Link** (o «Da un link»): incolli l’indirizzo e l’app scarica il PDF. Vanno i link diretti a un .pdf e i link di condivisione di Dropbox, Google Drive, OneDrive e GitHub, se il file è pubblico e il sito permette il download da altre pagine.
  Con `?pdf=` nell’indirizzo dell’app il PDF si apre da solo, per esempio `https://niki977.github.io/ultraspeaker-flipbook-lab/?pdf=https://…/file.pdf`.
- **Sottolineare**: Evidenzia (E) e Sottolinea (U) **si agganciano al testo come una selezione**: parola per parola, anche su più righe,
  restando nella stessa colonna (articoli a due colonne compresi). Un clic segna una parola. Penna (P), Gomma (G), 6 colori.
  L’aggancio usa il testo del PDF: con le scansioni senza testo la linea resta dritta ma libera.
  Ogni segno può **restare** oppure **svanire dopo 3 secondi** (tasto M per passare dall’uno all’altro).
- **Zoom**: rotellina del mouse (o pizzico sul trackpad) sul punto da ingrandire, pulsanti − % +, strumenti Lente per ingrandire (Z) e per ridurre (⇧Z).
  Su telefono e tablet: pizzico con due dita sul libro per ingrandire, ridurre e spostarsi.
  Per spostarti: tieni premuta la barra spaziatrice e trascina, oppure trascina fuori dalle pagine. Lo zoom entra nella registrazione.
- **Sfondo**: trasparente, a colore o un’immagine.
- **Registrare dal vivo**: premi **Registra** (o R), sfoglia e sottolinea, premi **Stop**. Il video riproduce esattamente
  quello che hai fatto, ma solo il libro: niente mouse, niente interfaccia.
- **Video automatico**: scegli le pagine, i secondi su ogni pagina e la velocità del giro: le pagine si girano da sole.
  Opzione **Sottolineature che si disegnano da sole**: prepara prima i segni (modalità «restano») e nel video compaiono uno dopo l’altro, nell’ordine di lettura,
  con una pausa a scelta dopo l’ultimo segno. Opzione **Richiudi il libro sulla copertina** alla fine del video.
- **Esportare**:
  - **MOV trasparente** (ProRes 4444 con canale alfa) → Keynote, Final Cut. File grandi: circa 12 MB al secondo in 1920×1080.
  - **MP4 con colore o immagine** (H.264) → PowerPoint su Mac e Windows. Usa lo stesso sfondo della slide.
- **Sul telefono**: a video pronto, il pulsante **Salva o condividi** apre il menu Condividi del sistema: «Salva video» lo mette nelle Foto, oppure lo invii con WhatsApp, Messaggi o Mail. Sul telefono il formato proposto è l’MP4.
- L’ultimo PDF, con le sottolineature fisse, resta memorizzato **in questo browser**. Il PDF non viene inviato a nessun server.

Perché due formati: PowerPoint non mostra la trasparenza dei video in modo affidabile durante la presentazione
(su Mac lo sfondo diventa nero), mentre Keynote sì. Con l’MP4 dello stesso colore della slide il risultato in PowerPoint è identico.

## Pubblicazione su GitHub Pages

Passo passo in **GUIDA-INSTALLAZIONE.html** (aprila con doppio clic). In breve: repository pubblico `ultraspeaker-flipbook-lab`,
caricamento dal sito di GitHub di tutto il contenuto della cartella **tranne** `vendor/ffmpeg/ffmpeg-core.wasm` (31 MB, oltre il limite di 25 MB),
poi *Settings → Pages → main / (root)*. Senza quel file l’app scarica il motore video da jsDelivr la prima volta che crea un MOV;
per renderla indipendente si può aggiungere il file con GitHub Desktop.

## File

| File | Cosa contiene |
|---|---|
| `index.html` | L’interfaccia |
| `js/engine.js` | Il libro disegnato su canvas: piega della pagina, ombre, sfondo trasparente |
| `js/annot.js` | Evidenziatore, sottolineatura, penna, gomma, segni che svaniscono |
| `js/pages.js` | Conversione delle pagine PDF in immagini nitide |
| `js/export.js` | Video: MOV ProRes 4444 con trasparenza, MP4 H.264 |
| `js/app.js` | Collegamenti tra interfaccia, registrazione ed esportazione |
| `js/store.js` | Memoria dell’ultimo PDF nel browser |
| `js/i18n.js` | Testi nelle 5 lingue |
| `vendor/` | pdf.js (Apache 2.0), mp4-muxer (MIT), ffmpeg.wasm (MIT; core FFmpeg GPL-2.0-or-later, vedi `vendor/ffmpeg/LICENZE.txt`) |
| `assets/`, `fonts/` | Loghi, icone, Quicksand (OFL) |
| `GUIDA-INSTALLAZIONE.html` | Come mettere l’app online su GitHub Pages |
| `demo/esempio-it.pdf` … `esempio-de.pdf` | Guida di esempio nelle 5 lingue (A4, copertina con la scena della homepage del sito): l’app apre quella della lingua scelta |

## Scorciatoie

← → sfoglia · + − 0 zoom · spazio+trascina sposta · H sfoglia · E evidenzia · U sottolinea · P penna · G gomma · Z lente · ⇧Z riduci · M resta/svanisce · R registra/stop · Esc chiude

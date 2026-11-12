# Check Lab — pubblicazione e test

## 1. Pubblica su GitHub Pages con GitHub Desktop

1. Estrai lo ZIP: ottieni la cartella `ultraspeaker-check-lab`.
2. GitHub Desktop › **File › Add local repository…** › scegli la cartella › **create a repository** (nome `ultraspeaker-check-lab`, branch `main`).
3. Scrivi un messaggio (es. «Prima versione») › **Commit to main**.
4. **Publish repository**: account `niki977`, togli la spunta **Keep this code private** (GitHub Pages gratuito richiede un repository pubblico) › **Publish**.
5. Su github.com apri il repository › **Settings › Pages** › Source **Deploy from a branch** › Branch **main**, cartella **/ (root)** › **Save**.
6. Dopo 1–2 minuti apri https://niki977.github.io/ultraspeaker-check-lab/ : deve comparire la pagina nera con «Trascina qui il file .pptx o .key».

Il file `.nojekyll` è già incluso: non cancellarlo.

## 2. Carica l’add-in in PowerPoint (sideload)

**Windows**
1. Crea una cartella (es. `C:\AddinManifest`), copiaci `ultraspeaker-check-lab-manifest.xml`, tasto destro › Proprietà › Condivisione › Condividi con te stesso. Annota il percorso di rete (es. `\\NOMEPC\AddinManifest`).
2. PowerPoint › File › Opzioni › Centro protezione › Impostazioni Centro protezione › **Cataloghi componenti aggiuntivi attendibili**: incolla il percorso, **Aggiungi catalogo**, spunta **Mostra nel menu**, OK.
3. Riavvia PowerPoint › Home › **Componenti aggiuntivi** › Altri componenti aggiuntivi › **CARTELLA CONDIVISA** › The Ultraspeaker Check Lab › Aggiungi.

**Mac**
1. Finder › Vai › Vai alla cartella: `~/Library/Containers/com.microsoft.Powerpoint/Data/Documents/` › crea la cartella `wef` se non c’è › copiaci `ultraspeaker-check-lab-manifest.xml`.
2. Riavvia PowerPoint › Home › **Componenti aggiuntivi** (o Inserisci › I miei componenti aggiuntivi) › The Ultraspeaker Check Lab.

**PowerPoint per il web**
Home › Componenti aggiuntivi › Altri componenti aggiuntivi › I miei componenti aggiuntivi › **Carica componente aggiuntivo** › `ultraspeaker-check-lab-manifest.xml`.

Dopo il caricamento trovi il pulsante **Check Lab** nella scheda Home, gruppo **The Ultraspeaker**.

## 3. Prova con la presentazione di test

Il file `test/Check-Lab-test-problemi.pptx` contiene problemi voluti. Con «Computer della regia: Windows» e «Tempo assegnato: 2 minuti» il report deve mostrare:

| Slide | Problema voluto | Esito atteso |
|---|---|---|
| 1 | Font «Gotham Rounded» non incorporato | Critico |
| 1 | Font Mac «Avenir Next» non incorporato | Critico (Attenzione se la regia è «Non lo so», nessun avviso se Mac) |
| 2 | Video collegato `Caso_03.mp4` | Critico |
| 3 | Foto 400×300 px a tutto schermo | Attenzione: bassa risoluzione |
| 4 | Video ProRes .mov | Critico su Windows |
| 5 | Slide nascosta | OK, con il numero della slide |
| 6 | Slide vuota | Attenzione |
| 7 | Link a `Statistiche.xlsx` e a una pagina web | Attenzione |
| — | 7 slide in 2 minuti | Attenzione: ritmo e tempo |

Cose da provare:
1. **Online**: trascina il file nella pagina › controlla il report › «Esporta PDF».
2. **Add-in**: apri il file in PowerPoint › Check Lab › «Avvia controllo» › prova «Vai alla slide».
3. **Regia**: compila il nome file, spunta la checklist, crea «I miei video» e «Kit generico» (nell’add-in si aprono come nuova presentazione; online vengono scaricati).
4. Cambia lingua dal selettore e controlla che report e pagine cambino.
5. Prova anche un tuo file Keynote nella versione online: è la parte da verificare su file reali.

## 4. Verso il Microsoft Marketplace

1. Verifica il manifest dal tuo computer (serve Node.js): `npx office-addin-manifest validate ultraspeaker-check-lab-manifest.xml`.
2. Partner Center › Microsoft 365 e Copilot › nuova offerta **Office Add-in** › carica `ultraspeaker-check-lab-manifest.xml`.
3. Scheda dello store: icona 300×300 `assets/icons/check-lab-mark-300.png`, logo `assets/img/check-lab-logo.png`, screenshot del pannello (1366×768 consigliato).
4. URL richiesti: privacy `…/privacy.html`, condizioni `…/terms.html`, supporto `…/support.html`.
5. Nelle note per i revisori allega `test/Check-Lab-test-problemi.pptx` e spiega che l’analisi è locale.
6. Per ogni aggiornamento aumenta `<Version>` nel manifest (es. 1.0.1.0).

## Note

- Contatto indicato nelle pagine: `info@theultraspeaker.com` (modificabile in `assets/js/pages.js`).
- Link al Projector Lab: `https://niki977.github.io/ultraspeaker-projector-lab/` (in `assets/js/ui.js`, costante `PROJECTOR_LAB`).

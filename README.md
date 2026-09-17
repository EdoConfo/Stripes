# 💳 Stripes · Carte fedeltà

Una PWA offline-first per tenere in tasca tutte le carte fedeltà del supermercato. Inquadri il codice una volta, e alla cassa apri l'app, tocchi la carta e mostri il codice a barre. Anche senza connessione.

Scritta in Vanilla HTML, CSS e JavaScript, senza framework e senza build.

[🌍 Prova l'app live](https://edoconfo.github.io/Stripes/)

---

## ✨ Funzionalità

- 📷 **Scansione con la fotocamera**
  Inquadri il codice a barre o il QR della carta e il numero viene letto e salvato insieme al suo formato. In alternativa puoi leggerlo da una foto della galleria o scriverlo a mano.

- 🏷️ **Codici supportati**
  EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39, Code 93, ITF, Codabar, GS1 DataBar, QR Code, Data Matrix, Aztec e PDF417. Se inserisci il numero a mano, il formato viene riconosciuto in automatico (EAN/UPC con cifra di controllo valida, altrimenti Code 128).

- 🎨 **Aspetto automatico, senza AI**
  - Un catalogo di oltre 40 insegne italiane (Esselunga, Coop, Conad, Lidl, Carrefour, Tigotà, IKEA…) assegna alla carta il colore del negozio.
  - Per i negozi fuori catalogo il colore si ricava dal nome, quindi è sempre lo stesso.
  - Se aggiungi una foto della carta, il colore dominante viene estratto dall'immagine con un istogramma su canvas. Se nella foto c'è un codice, viene letto anche quello.
  - Non ci sono loghi registrati: il "logo" è il nome del negozio scritto sulla carta. Colore e foto si possono sempre cambiare.

- 🔎 **Alla cassa**
  Codice grande su sfondo bianco, schermo che resta acceso (Wake Lock) e vista a schermo intero. Nella vista a schermo intero i codici a barre vengono ruotati in orizzontale, così lo scanner li legge più facilmente.

- 💾 **Offline-first e privacy**
  Le carte restano solo sul dispositivo, in IndexedDB. Non ci sono account né server. Il Service Worker mette in cache tutta l'app, librerie comprese.

- 📦 **Backup**
  Puoi esportare e importare tutte le carte, foto incluse, in un file JSON per passarle da un telefono all'altro.

---

## 🛠 Tech Stack

- **HTML5 + CSS3 vanilla**: Custom Properties, Grid, container queries, tema chiaro/scuro automatico, safe area iOS.
- **JavaScript ES Modules**: `main.js` (interfaccia), `codes.js` (lettura e generazione dei codici), `brands.js` (catalogo e colori), `store.js` (IndexedDB).
- **Librerie incluse nel repo** (`assets/vendor`, nessuna CDN):
  - [bwip-js](https://github.com/metafloor/bwip-js) (MIT): genera i codici in SVG.
  - [ZXing-js](https://github.com/zxing-js/library) (Apache-2.0): legge i codici quando il browser non ha `BarcodeDetector`, per esempio Safari su iOS.
- **PWA**: manifest, icone maskable, Service Worker con precache (network-first per l'HTML, cache-first per gli asset).

---

## 🚀 Sviluppo locale

App statica, nessuna build. Serve un server locale perché il Service Worker non funziona con `file://`:

```bash
python3 -m http.server 8000
```

Poi apri `http://localhost:8000`. La fotocamera richiede HTTPS oppure `localhost`.

Quando modifichi un asset, aumenta `VERSION` in `sw.js` e il `?v=` in `index.html` e nella lista `ASSETS`, così i dispositivi scaricano la nuova versione.

## 🌐 Deploy

GitHub Pages: **Settings → Pages → Deploy from a branch → `main` / root**.

---

## 📄 Licenza

MIT. Le librerie in `assets/vendor` mantengono le loro licenze (file `LICENSE-*.txt`).

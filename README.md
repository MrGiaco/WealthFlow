# WealthFlow 📈

**App PWA personale** per il monitoraggio di portafoglio investimenti e conti bancari.

- 🔐 PIN 6 cifre + biometria (Face ID / impronta)
- ☁️ Dati cifrati con **AES-256-GCM** su **Google Drive**
- 📊 Quotazioni in tempo reale via **Cloudflare Worker** (Yahoo Finance / ZoneBourse)
- 📱 Mobile-first + Desktop a pieno schermo
- 🔄 Import movimenti da **Excel/CSV** bancario
- 🚫 Zero pubblicità, zero server propri, zero abbonamenti

---

## Setup — 3 passaggi

### 1. Deploy su GitHub Pages

```bash
# Clona/forka il repository, poi abilita GitHub Pages:
# Settings → Pages → Source: main branch / root
# L'app sarà disponibile su: https://tuousername.github.io/WealthFlow/
```

### 2. Cloudflare Worker (quotazioni)

1. Vai su [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create Worker**
2. Incolla il contenuto di `cloudflare-worker/worker.js`
3. Clicca **Deploy**
4. Copia l'URL del worker (es. `https://quotes.tuodominio.workers.dev`)
5. Nell'app: **Impostazioni → Cloudflare Worker URL** → incolla l'URL

> **Nota:** Il Worker gratuito supporta 100.000 richieste/giorno — più che sufficiente.

### 3. Google Cloud — OAuth + Drive

#### 3a. Crea il progetto

1. Vai su [console.cloud.google.com](https://console.cloud.google.com)
2. **Nuovo progetto** → nome: `WealthFlow`

#### 3b. Abilita le API

1. **API e Servizi → Libreria**
2. Cerca e abilita: **Google Drive API**

#### 3c. Crea le credenziali OAuth

1. **API e Servizi → Credenziali → Crea credenziali → ID client OAuth 2.0**
2. Tipo applicazione: **Applicazione web**
3. Nome: `WealthFlow`
4. **Origini JavaScript autorizzate** — aggiungi:
   - `https://tuousername.github.io`
   - `http://localhost:3000` (per sviluppo locale)
5. Copia il **Client ID** (formato: `xxxxxxxx.apps.googleusercontent.com`)

#### 3d. Configura la schermata di consenso

1. **Schermata consenso OAuth → User Type: Esterno**
2. Nome app: `WealthFlow`, Email supporto: la tua email
3. **Aggiungi o rimuovi scope** → cerca e aggiungi: `https://www.googleapis.com/auth/drive.appdata`
4. **Utenti di test**: aggiungi la tua email Gmail

#### 3e. Collega nell'app

1. App → **Impostazioni → Google Client ID** → incolla il Client ID
2. App → **Impostazioni → Google Drive** → clicca per connettere

> I dati vengono salvati nella cartella **App Data** del tuo Drive (non visibile nell'interfaccia Drive normale, accessibile solo dall'app).

---

## Utilizzo

### Primo avvio

1. Scegli un **PIN a 6 cifre**
2. Attiva la **biometria** (opzionale)
3. Configura **Worker URL** e **Google Drive**
4. Aggiungi i tuoi **conti** (Fineco, ISP, ING…)
5. Aggiungi i **titoli** del portafoglio

### Aggiungere un titolo

- **Ticker Yahoo Finance**: es. `ENI.MI`, `VEUR.AS`, `AAPL`, `ISP.MI`
- **Certificates ZoneBourse**: usa l'ID numerico dalla URL di ZoneBourse (es. `184320628`)
- **PMC**: il tuo prezzo medio di carico (costo totale ÷ quantità)

### Ticker comuni

| Titolo | Ticker |
|--------|--------|
| ENI | `ENI.MI` |
| Intesa Sanpaolo | `ISP.MI` |
| ENEL | `ENEL.MI` |
| Mediobanca | `MB.MI` |
| Vanguard FTSE All-World | `VWCE.DE` |
| iShares Core MSCI World | `IWDA.AS` |
| Vanguard FTSE Europe | `VEUR.AS` |
| BTP (ETF) | `BTPI.MI` |

### Import movimenti da banca

1. **Movimenti → icona importa**
2. Trascina il file Excel/CSV esportato dalla tua banca
3. Mappa le colonne (Data, Descrizione, Importo)
4. Clicca **Importa**

> Compatibile con l'export di Fineco, Intesa Sanpaolo, ING, e la maggior parte delle banche italiane.

### Auto-lock

L'app si blocca automaticamente dopo **5 minuti** di inattività. Puoi sbloccare con PIN o biometria.

---

## Struttura file

```
WealthFlow/
├── index.html              # App shell completo
├── manifest.json           # PWA manifest
├── sw.js                   # Service Worker (offline)
├── css/
│   ├── main.css            # Design system, componenti
│   ├── mobile.css          # Layout mobile
│   └── desktop.css         # Layout desktop (sidebar)
├── js/
│   ├── utils.js            # Utility: formatter, toast, eventi
│   ├── auth.js             # PIN, SHA-256, WebAuthn, auto-lock
│   ├── drive.js            # Google Drive API + AES-256-GCM
│   ├── quotes.js           # Proxy Worker, cache, auto-refresh
│   ├── portfolio.js        # CRUD titoli, PMC, gain/loss
│   ├── transactions.js     # CRUD movimenti, import CSV/Excel
│   ├── charts.js           # Chart.js: donut, line, bar, sparkline
│   └── app.js              # Router, orchestrazione, settings
└── cloudflare-worker/
    └── worker.js           # Worker proxy (da deployare su CF)
```

---

## Sicurezza & Privacy

- **PIN**: hash SHA-256, mai memorizzato in chiaro
- **Biometria**: WebAuthn platform authenticator (Touch ID / Face ID)
- **Dati**: cifrati con AES-256-GCM prima di essere inviati a Drive
- **Chiave di cifratura**: derivata dal PIN hash con PBKDF2 (100.000 iterazioni)
- **Google Drive**: cartella `appDataFolder` — invisibile all'utente, accessibile solo dall'app
- **Zero server**: nessun backend proprietario, nessun dato su server terzi
- **Cloudflare Worker**: fa solo da proxy CORS per Yahoo Finance — non vede i tuoi dati

---

## Sviluppo locale

```bash
# Qualsiasi server statico funziona:
npx serve .
# oppure
python3 -m http.server 3000
# Poi apri http://localhost:3000
```

---

*WealthFlow — uso personale privato · Generato con Claude (Anthropic)*

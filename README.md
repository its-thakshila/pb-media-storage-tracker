# perabeats Card Log

> Real-time SD card and hard disk custody tracker for **perabeats Media Society**, University of Peradeniya.

Live at → **[cards.perabeats.com](https://cards.perabeats.com)**

---

## What it does

Card Log tracks the physical chain of custody of media storage devices (SD cards, hard disks) across society members. Every handover, transfer, newbie handoff, and loss/damage report is permanently logged with a transaction ID and visible on a per-device audit timeline.

### Core features

| Feature | Description |
|---|---|
| **Device home view** | See all devices at a glance — who holds each one, pending transfers, newbie handoffs |
| **Transfer flow** | Initiator hands over → recipient confirms or declines. Both sides notified via the Pending tab |
| **Newbie handoff** | Member gives a device to a non-member temporarily. Card stays under the member's name in the system |
| **Timeline / History** | Full immutable audit trail per device with color-coded events |
| **Admin Override Transfer** | Admin can force-reassign any device to any member, bypassing normal flow |
| **Auto-poll** | Home and Pending views refresh every 15 seconds without user action |
| **Google Sign-In** | Auth via Google Identity Services — only approved members can log in |

---

## Tech stack

| Layer | Technology |
|---|---|
| **Frontend** | Vanilla HTML, CSS, JavaScript (no framework) |
| **Backend** | Google Apps Script (`doPost` web app) |
| **Database** | Google Sheets (Members, Devices, Transactions) |
| **Auth** | Google Identity Services (ID token verified server-side) |
| **Hosting** | GitHub Pages with custom domain |
| **Icons** | Inline Lucide SVGs (no external dependency) |

---

## Project structure

```
pb-media-storage-tracker/
├── index.html              # Single-page app shell + inline JS utilities
├── CNAME                   # Custom domain for GitHub Pages
├── assets/
│   └── logo.png            # perabeats wordmark
├── css/
│   └── styles.css          # Full design system — dark theme, tokens, components
├── js/
│   ├── config.js           # OAUTH_CLIENT_ID + APPS_SCRIPT_URL
│   ├── api.js              # Fetch wrapper for all Apps Script calls
│   ├── auth.js             # Google Sign-In, session persistence (localStorage)
│   ├── icons.js            # Inline Lucide SVG helpers
│   └── views/
│       ├── home.js         # Device card grid + device action modal
│       ├── pending.js      # Pending transfer actions
│       ├── history.js      # Per-device audit timeline
│       └── update.js       # Action forms (transfer, newbie, lost/damaged, kept)
├── apps-script/
│   └── Code.gs             # Full backend — auth, devices, transactions, members
└── spec_doc.md             # Original specification document
```

---

## Setup guide

### 1. Google Sheet

Create a Google Sheet with three tabs — column headers must match exactly:

**Members**
```
Email | Name | Role | Title | ApprovedDate | Active
```
- `Role`: `Member` or `Admin`
- `Title`: Use `Resource Coordinator` for the RC (controls timeline colour-coding)
- `Active`: `Y` or `N`

**Devices**
```
DeviceLabel | DeviceType | Capacity | Status | CurrentHolderEmail | HasPendingTransferTo | LastUpdated | PhysicallyWithNote
```
- `DeviceType`: `SD Card` or `Hard Disk`
- `Status`: `Active`, `Lost`, or `Damaged`

**Transactions**
```
TransactionID | Timestamp | DeviceLabel | ActionType | ActorEmail | CameraModel | CounterpartyEmail | NewbieName | Notes | TransferStatus | LinkedTransactionID
```

---

### 2. Google Apps Script

1. Open the Sheet → **Extensions → Apps Script**
2. Paste the contents of `apps-script/Code.gs`
3. Update the two constants at the top:
   ```javascript
   const OAUTH_CLIENT_ID = "your-client-id.apps.googleusercontent.com";
   const SPREADSHEET_ID  = "your-sheet-id-from-the-url";
   ```
4. Deploy → **New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the deployment URL

---

### 3. Google Cloud Console

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com)
2. **APIs & Services → OAuth consent screen**
   - User type: External
   - App name: `perabeats Card Log`
   - Add your domain under **Authorized domains** (requires Search Console verification)
3. **APIs & Services → Credentials → Create OAuth 2.0 Client ID**
   - Application type: Web application
   - Authorized JavaScript origins: `https://cards.perabeats.com`
4. Copy the Client ID

---

### 4. Frontend config

Edit `js/config.js`:
```javascript
const CONFIG = {
  OAUTH_CLIENT_ID: "your-client-id.apps.googleusercontent.com",
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec",
};
```

---

### 5. Deploy to GitHub Pages

1. Push the repo to GitHub
2. **Settings → Pages → Branch: `main`, folder: `/ (root)`**
3. Add `CNAME` file with your custom domain
4. In your DNS provider (Hostinger), add:
   ```
   Type: CNAME  |  Name: cards  |  Value: your-github-username.github.io
   ```

---

## Timeline colour coding

| Colour | Meaning |
|---|---|
| 🟢 Green | Actor is the Resource Coordinator (RC) |
| 🟣 Purple | Device physically given to a newbie |
| 🔵 Blue | Member-to-member transfers |
| 🟡 Yellow | Pending transfers |
| 🔴 Red | Lost / Damaged reports or Admin Override |
| ⬜ Grey | Declined transfers |

---

## Action types logged

| ActionType | Triggered by |
|---|---|
| `DeviceAdded` | Admin adds a new device |
| `Kept` | Holder confirms they still have it |
| `TransferInitiated` | Holder initiates a handover |
| `TransferConfirmed` | Recipient accepts |
| `TransferDeclined` | Recipient declines |
| `NewbieHandoff` | Member gives device to a non-member temporarily |
| `NewbieReturned` | Device returned from newbie to member |
| `LostDamagedReported` | Holder or Admin reports loss/damage |
| `AdminOverride` | Admin force-reassigns device to any member |

---

## Security notes

- **`OAUTH_CLIENT_ID`** — safe to expose publicly. Google restricts it to your Authorized JavaScript Origins.
- **`APPS_SCRIPT_URL`** — public endpoint, but every action requires a valid Google ID token from an approved member. Unauthenticated calls are rejected.
- **`SPREADSHEET_ID`** — in `Code.gs`. Low risk as long as the Sheet is **not publicly shared** in Google Drive.
- All tokens are verified server-side on every request via Google's `tokeninfo` endpoint.

---

## License

Internal tool — © 2026 perabeats Media Society, University of Peradeniya. All rights reserved.

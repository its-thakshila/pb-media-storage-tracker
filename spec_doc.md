# Perabeats Media Storage Tracking System
### Requirements & Implementation Specification

**Prepared for:** Perabeats Media Society, University of Peradeniya
**Purpose:** Track the real-time location and custody history of SD cards and hard disks (and, incidentally, which camera body they were paired with) used during event coverage.
**Intended use of this document:** Implementation-ready spec for an AI coding agent (built for Antigravity + Claude Sonnet). Every section aims to be concrete enough to build from directly, not just a description of intent.

---

## 1. Problem Statement

Cameras are checked out from the Resource Coordinator by committee members, crew, and newbies for event coverage. SD cards frequently get separated from the camera body — the holder keeps the card back to back up footage before returning it. Hard disks used for backing up footage after events have the exact same problem — they circulate between people and it's unclear who has one at any given time. Over time, nobody can say with confidence where a given card or hard disk physically is, who is responsible for it, or what happened to it on a given day.

## 2. Goals

- At any moment, anyone should be able to open the system and see **where every device currently is and who is responsible for it**.
- Every change of custody should be **logged with a timestamp, actor, and reason**.
- The system should **prevent people from falsely claiming they handed off a device** — a handoff only counts once the recipient confirms it, no exceptions (including the Resource Coordinator, in either direction).
- Only **approved committee members** can log in and make updates.
- Newbies can physically hold a device, but **accountability stays with the committee member** who gave it to them.
- The whole thing must run on **free infrastructure** (GitHub Pages + Google Sheets + Google Apps Script) with **zero paid backend**.
- Updating a device's status should take **under 15 seconds** — people are on-site, busy, and won't use anything clunky.
- Dark-themed UI, on-brand with the Perabeats identity (logo attached).

## 3. Actors / Roles

| Role | Count | Can log in? | Notes |
|---|---|---|---|
| **Newbie** | Many, informal | No | Never logs in. Can only appear as a *note* on a transaction ("device given to Nimal, a newbie"). Has zero accountability in the system — whoever logged the note remains responsible. |
| **Page Coordinator** | ~12 (4 per page) | Yes (pre-approved) | A regular Member in the system — can hold devices, initiate transfers, confirm transfers directed to them. |
| **Exco / other Committee Members** | Several | Yes (pre-approved) | Same permissions as Page Coordinators. |
| **Resource Coordinator (RC)** | Exactly 1 | Yes (pre-approved) | **Functionally just another Member** in the transfer chain — not a special "home base" state. He can hold devices, send them out, and receive them back, but every send and every return is a transfer that must be *confirmed by the other party*, exactly like member-to-member transfers. This is what stops the RC (or anyone) from unilaterally declaring a device's location. |
| **Admin** | President, Secretary, Treasurer | Yes | Approves new member accounts, adds/retires devices. Deliberately kept separate from the Resource Coordinator — the person managing day-to-day equipment custody shouldn't also control who's allowed into the system or be able to add/remove members unilaterally. |

**Registration control:** A committee member cannot just "sign up." An Admin maintains an *Approved Members* list (name + university email, tagged with role — Page Coordinator / Exco / RC — for display purposes only). The login screen checks this list before granting access — anyone not on it is rejected, so third parties can't get in even if they discover the site.

**Why the RC isn't special-cased:** the concern "the RC could misuse the system" is solved by removing his special status entirely. He's simply the person who, in practice, holds most devices at rest between events. Nothing in the data model gives him unilateral power to move a device without the receiving person's confirmation, or to mark a device as returned without confirming he actually received it back.

## 4. Device Labeling Convention & Current Inventory

Two device types are tracked with the same system: **SD cards** and **hard disks**. They share one label format, distinguished by an explicit type tag so a "64" and a "2TB" never get confused even at a glance:

**SD cards:** `PB-<CapacityGB>-<Sequence>`
**Hard disks:** `PB-HDD-<CapacityTB>-<Sequence>`

Why this format:
- `PB` prevents mix-ups if gear is ever shared with another club/department.
- Capacity leads for SD cards because that's usually the first thing someone asks ("is there a free 64GB card?"). Hard disks get an explicit `HDD` tag and `TB` unit so nobody misreads "2" as a 2GB card.
- Two-digit sequence avoids relabeling if you ever cross 9 of the same capacity.

**Current inventory to physically label (stickers) and seed into the system:**

| Label | Type | Capacity |
|---|---|---|
| PB-32-01 | SD Card | 32GB |
| PB-32-02 | SD Card | 32GB |
| PB-32-03 | SD Card | 32GB |
| PB-64-01 | SD Card | 64GB |
| PB-64-02 | SD Card | 64GB |
| PB-64-03 | SD Card | 64GB |
| PB-HDD-2TB-01 | Hard Disk | 2TB |
| PB-HDD-4TB-01 | Hard Disk | 4TB |

**Cameras:** No separate label needed. Camera tracking is just a free-text reference field on relevant transactions — the camera's actual model name (e.g. "Canon 200D", "Sony A6400") — not a separate CAM-01 style registry.

## 5. Visual Design System

**Source:** Perabeats logo (attached) — black background, "pera" in white, "beats" in red, tagline "EXPECT THE UNEXPECTED" in white, clean geometric sans-serif typeface.

### 5.1 Theme
Dark theme throughout — no light-mode toggle needed for v1.

### 5.2 Color Tokens

| Token | Approx. Hex | Usage |
|---|---|---|
| `--bg-base` | `#0A0A0A` | App background (matches logo's black) |
| `--bg-surface` | `#161616` | Cards, table rows, panels |
| `--bg-surface-raised` | `#1F1F1F` | Modals, dropdowns, elevated elements |
| `--border-subtle` | `#2A2A2A` | Dividers, card borders |
| `--text-primary` | `#F5F5F5` | Main text (matches logo's "pera" white) |
| `--text-secondary` | `#9CA3AF` | Muted text, timestamps, helper text |
| `--brand-red` | `#E4202C` | Primary buttons, active/selected states, brand accents (matches logo's "beats" red — **sample the exact hex from the attached logo file during build for a pixel-perfect match**) |
| `--status-confirmed` | `#22C55E` | Green — confirmed transfers, "returned to RC" |
| `--status-pending` | `#F5A623` | Amber — pending transfer confirmation |
| `--status-newbie` | `#A855F7` | Purple — "gave to a newbie" events |
| `--status-neutral` | `#6B7280` | Gray — routine "kept with me" events |
| `--status-lost-damaged` | `--brand-red` (`#E4202C`) | Reuses brand red — a device flagged Lost/Damaged should feel as urgent as the brand's boldest color, and it avoids introducing a second, competing red |

### 5.3 Typography
- **Headings / brand moments** (page titles, the "Perabeats" wordmark if shown in-app): **Poppins**, weights 600–800 — geometric and close to the logo's letterforms. Free on Google Fonts.
- **Body / UI text** (labels, table content, buttons, form fields): **Inter**, weights 400–600 — highly legible at small sizes on mobile, which matters given most updates happen on a phone.
- Load both via Google Fonts CDN link in the `<head>`.

### 5.4 Component Notes
- **Buttons:** primary actions (Confirm, Submit, Hand Over) use `--brand-red` fill with white text; secondary/neutral actions use `--bg-surface-raised` fill with `--text-primary`; destructive-adjacent actions (Decline, Report Lost/Damaged) can still use `--brand-red` since it's already the "attention" color — differentiate by icon/label, not by inventing a second red.
- **Status badges** (on Home page and timeline) use the color tokens from 5.2 as background tints at ~15% opacity with full-opacity text/icon in that color, standard "pill" badge style.
- **Cards/rows:** `--bg-surface` background, `1px solid --border-subtle`, generous padding (16px+) since this is used one-handed on mobile — tap targets should be comfortably large (44px minimum height).
- **Empty/loading states:** every list-based view (Home, History, Pending Actions, Member list) needs an explicit empty state (e.g. "No devices yet — add one below" for Admins, or a plain "Nothing pending" for the Pending Actions panel) and a loading skeleton/spinner — don't leave a blank screen while the Apps Script call is in flight.

## 6. Device Lifecycle (State Machine)

The Resource Coordinator is **not** a separate state — he's just an entry in the `Members` list, like any Page Coordinator or Exco member. A device is always in exactly one of these states:

```
                    ┌────────────────────────────────────────────┐
                    │                                              │
                    ▼                                              │
              WITH (holder = any Member, incl. RC)                 │
                    │                                              │
                    ├── kept (self-loop: refresh reason/date, same holder)
                    │                                              │
                    ├── initiate transfer to Member Y ──▶ PENDING_TRANSFER
                    │                                          │
                    │                                Y confirms received
                    │                                          │
                    │                                          ▼
                    └──────────────────────────────── WITH (holder = Y) ──┘
                    │
                    ├── note: gave physical possession to a newbie
                    │   (holder unchanged, flagged "physically with <newbie name>")
                    │
                    └── report Lost/Damaged ──▶ LOST / DAMAGED (terminal, outside transfer pool)
```

Key rule: **`PENDING_TRANSFER` is a real, visible state, for every kind of handoff, in every direction — including to and from the RC.** A device is not considered moved until the *recipient* actively confirms. Until confirmation, the original holder is still shown as responsible. This is what stops anyone — a member *or* the RC — from offloading or claiming responsibility just by saying so.

## 7. Actions Reference

Each action becomes one row in the transaction log. There's no separate "checkout" or "return to coordinator" action — both are just a **transfer**, with the RC picked as the recipient like any other member.

| Action | Who logs it | Fields required | Resulting state |
|---|---|---|---|
| **Kept with me** | Current holder | Device, reason (e.g. "backing up footage"), date | Unchanged holder, timestamp/reason refreshed |
| **Hand over device** | Current holder | Device, recipient (dropdown of approved members, **RC included**), camera model handed over too (optional free text), optional notes | `PENDING_TRANSFER` → in-app notification to the chosen recipient |
| **Confirm / decline received** | Recipient | One tap: Confirm or Decline | Confirmed → recipient becomes the new holder. Declined → reverts to previous holder + alerts the sender to sort it out. |
| **Gave to a newbie** | Current holder | Device, newbie's name, free-text note | Holder unchanged, note attached — no confirmation possible since newbies don't have accounts |
| **Report Lost / Damaged** | Current holder (or Admin) | Device, Lost or Damaged, free-text note | Device status set to `Lost`/`Damaged`, tagged with who reported it (logged-in user, automatic); device drops out of the transfer pool but history remains intact |

Every action is timestamped and tied to the logged-in user automatically — no one manually types "who did this."

## 8. Data Model — Google Sheet Schema

One Google Sheet (spreadsheet), three tabs. Exact column headers and example rows below — build the sheet with these headers verbatim, since the backend code will reference them by name.

### 8.1 `Members`

| Email | Name | Role | ApprovedDate | Active |
|---|---|---|---|---|
| president@pdn.ac.lk | Amaya Silva | Admin | 2026-07-01 | Y |
| rc@pdn.ac.lk | Sunil Wickrama | Member | 2026-07-01 | Y |
| kasun@pdn.ac.lk | Kasun Perera | Member | 2026-07-01 | Y |

- `Role` is either `Member` or `Admin` — this is the *only* permission flag; Page Coordinator/Exco/RC are informational labels, not separate permission levels (add an optional `Title` column if you want to display "Page Coordinator" etc. on screen, but it shouldn't gate anything).
- `Active = N` disables login without deleting the row (rows are never deleted, since past transactions reference these emails).

### 8.2 `Devices`

| DeviceLabel | DeviceType | Capacity | Status | CurrentHolderEmail | HasPendingTransferTo | LastUpdated | PhysicallyWithNote |
|---|---|---|---|---|---|---|---|
| PB-64-01 | SD Card | 64GB | Active | kasun@pdn.ac.lk | | 2026-07-05T15:40:00+05:30 | |
| PB-64-02 | SD Card | 64GB | Active | rc@pdn.ac.lk | nadeesha@pdn.ac.lk | 2026-07-04T18:00:00+05:30 | |
| PB-HDD-2TB-01 | Hard Disk | 2TB | Active | rc@pdn.ac.lk | | 2026-07-03T09:10:00+05:30 | |
| PB-32-01 | SD Card | 32GB | Damaged | kasun@pdn.ac.lk | | 2026-07-02T11:00:00+05:30 | |

- `DeviceType` (`SD Card` / `Hard Disk`) is what lets one sheet, one Update page, and one History page handle both device kinds identically.
- `Status` ∈ `Active`, `Lost`, `Damaged`, `Retired`.
- `HasPendingTransferTo` holds the recipient's email while a transfer is awaiting confirmation; blank otherwise. This single column is what drives the "Pending" badge on the Home page.
- `PhysicallyWithNote` is free text like "physically with Nimal (newbie)" — informational only, doesn't affect `CurrentHolderEmail`.
- There's no `CurrentState` enum like "WITH_COORDINATOR" — the RC is just an email address in `CurrentHolderEmail` like anyone else.

### 8.3 `Transactions` (append-only — never edit existing rows, only append; corrections are new rows)

| TransactionID | Timestamp | DeviceLabel | ActionType | ActorEmail | CameraModel | CounterpartyEmail | NewbieName | Notes | TransferStatus | LinkedTransactionID |
|---|---|---|---|---|---|---|---|---|---|---|
| TXN-00001 | 2026-07-03T09:00:00+05:30 | PB-HDD-2TB-01 | TransferInitiated | previous-holder@pdn.ac.lk | | rc@pdn.ac.lk | | | Pending | |
| TXN-00002 | 2026-07-03T09:10:00+05:30 | PB-HDD-2TB-01 | TransferConfirmed | rc@pdn.ac.lk | | previous-holder@pdn.ac.lk | | | Confirmed | TXN-00001 |
| TXN-00003 | 2026-07-04T18:00:00+05:30 | PB-64-02 | TransferInitiated | rc@pdn.ac.lk | Canon 200D | nadeesha@pdn.ac.lk | | For Cultural Night | Pending | |
| TXN-00004 | 2026-07-05T15:40:00+05:30 | PB-64-01 | Kept | kasun@pdn.ac.lk | | | | Backing up wedding footage | N/A | |

- `ActionType` ∈ `Kept`, `TransferInitiated`, `TransferConfirmed`, `TransferDeclined`, `NewbieHandoff`, `LostDamagedReported`, `DeviceAdded`, `AdminCorrection`.
- `ActorEmail` is always the logged-in user performing *this specific* row's action — for a confirm/decline row, that's the recipient, not the original sender.
- `LinkedTransactionID` connects a `TransferConfirmed`/`TransferDeclined`/`AdminCorrection` row back to the `TransactionID` it resolves or corrects. Leave blank for standalone actions (Kept, NewbieHandoff, LostDamagedReported, DeviceAdded).
- `TransferStatus` ∈ `N/A` (non-transfer actions), `Pending`, `Confirmed`, `Declined`.
- The `Devices` sheet always reflects "current state" (fast read for Home page); `Transactions` is the full history (used for the timeline view).

## 9. Pages / Screens

### 9.1 Login
- "Sign in with Google" button (Google Identity Services), centered, dark background, Perabeats logo above it.
- On success but email not found/inactive in `Members`: show a clear, non-technical message — "This account isn't registered. Contact an Admin to get added." Do not silently retry or loop.

### 9.2 Home Page (default view after login)
One row per active device (Lost/Damaged devices shown too, visually distinguished, not hidden):

| Device | Type | Capacity | With | Since | Note |
|---|---|---|---|---|---|
| PB-64-01 | SD Card | 64GB | Kasun P. | Today, 3:40 PM | Backing up footage |
| PB-64-02 | SD Card | 64GB | Pending: RC → Nadeesha | Awaiting confirmation | — |
| PB-HDD-2TB-01 | Hard Disk | 2TB | Sunil W. (RC) | 2 days ago | — |
| PB-32-01 | SD Card | 32GB | Kasun P. | 3 days ago | ⚠ Reported Damaged by Kasun |

- Color-coded per Section 5.2 (green = settled/confirmed, amber = pending, brand red = Lost/Damaged).
- Sortable/filterable by device type (SD Card / Hard Disk) once inventory grows past ~15 items; not required for the current 8-device MVP.
- The RC is displayed the same way any other holder is — no visually "special" resting state.

### 9.3 Device History Page
Select a device → vertical timeline, newest first:

```
● Jul 5, 3:40 PM — Kasun kept the device ("backing up wedding footage")          [gray]
● Jul 5, 1:15 PM — Transfer confirmed: Nadeesha → Kasun                          [green]
● Jul 5, 1:10 PM — Nadeesha initiated transfer to Kasun (pending)                [amber]
● Jul 4, 6:05 PM — Transfer confirmed: RC → Nadeesha (Canon 200D handed over)    [green]
● Jul 4, 6:00 PM — RC initiated transfer to Nadeesha (pending)                   [amber]
```

Color legend per Section 5.2: green = confirmed (esp. "returned to RC"), amber = pending, purple = gave to newbie, gray = routine "kept," brand red (bold) = Lost/Damaged report.

This is simpler and more reliable to build than a branching tree, and reads just as clearly — a device's life is inherently a single chronological chain.

### 9.4 Update Page (the one people actually use in the field)
Minimal, mobile-first, big tap targets:
1. Pick your device (searchable dropdown — type the label or capacity).
2. Pick an action: **Kept** / **Hand Over** / **Gave to a Newbie** / **Report Lost or Damaged**.
3. Fill only the 1–2 fields that action needs (recipient dropdown for Hand Over; free-text name for newbie; free-text reason/notes elsewhere).
4. Submit → optimistic UI update with a clear "saving…" state, then success confirmation or a retry-able error.

Target: **under 15 seconds** per update on a phone.

### 9.5 Pending Actions (surfaced immediately after login, not buried in a menu)
"Nadeesha wants to give you PB-64-01 — Confirm / Decline." Since notifications are in-app only (no email/Telegram for now), **this is the only place** a person learns about a pending handoff — it must be the first thing visible on login. If empty, show a plain "Nothing pending" state rather than hiding the panel.

### 9.6 Admin Controls (no separate page — inline, permission-gated)
- **Manage Members** panel (Home page, Admin-only): approve a new member (email, name, role), deactivate an existing one.
- **Add Device** button (Home page, Admin-only): label, type, capacity, initial holder — see Section 9.7 for validation.
- **Report Lost/Damaged**: no special Admin path — it's the same action any holder can log (Section 7).
- **Correct a log entry**: a "flag/correct" option on a transaction row in the History page, Admin-only — appends a new `AdminCorrection` row (Section 8.3), never edits the original.

This keeps the whole app to effectively three core views (Home, History, Update) plus a Pending Actions panel and a couple of permission-gated inline extras — no fourth full page most people would rarely open.

### 9.7 Adding New Devices in the Future

**Recommended:** the "Add Device" admin control (9.6). An Admin fills a small form — label, type (SD Card / Hard Disk), capacity, initial holder — and the app appends a validated, correctly-formatted row to `Devices` via the backend (`addDevice` action, Section 10).

**Also possible, but riskier:** editing the Google Sheet directly. It works — it's a normal spreadsheet — but bypasses the app's validation. A typo'd label, missing `Status`, or blank `CurrentHolderEmail` will make that device behave strangely (won't render correctly on Home, can't be transferred) until manually fixed. Fine as a one-off emergency fix; not the normal workflow once the Admin UI exists.

Either way, the moment a device has a valid row in `Devices`, it's fully live — no code changes or redeployment needed.

## 10. API Contract — Google Apps Script Backend

The Apps Script Web App is the only thing allowed to read/write the Sheet. The frontend calls it as a single `POST` endpoint (Apps Script web apps only support `doGet`/`doPost`; we route internally by an `action` field in the body).

**Endpoint:** `POST <apps-script-web-app-url>`

**Request shape (all actions):**
```json
{
  "action": "actionName",
  "idToken": "<Google ID token from Sign-In>",
  "payload": { }
}
```

**Response shape (all actions):**
```json
{ "success": true, "data": { } }
```
or on failure:
```json
{ "success": false, "error": "Human-readable message" }
```

### Actions

| `action` | `payload` | Behavior | Auth level |
|---|---|---|---|
| `authCheck` | `{}` | Verifies token, looks up email in `Members`. Returns `{ email, name, role }` or an error if not found/inactive. | Any valid token |
| `listDevices` | `{}` | Returns all devices with holder **names** already resolved server-side (join against `Members`), so the frontend never needs a second lookup. | Any Member |
| `getDeviceHistory` | `{ deviceLabel }` | Returns that device's `Transactions` rows, newest first, names resolved. | Any Member |
| `listMembers` | `{}` | Returns active members `[{ email, name, role }]` — for populating the "hand over to" dropdown. | Any Member |
| `getPendingActions` | `{}` | Returns transactions where `CounterpartyEmail` = caller's email and `TransferStatus = Pending`. | Any Member |
| `logKept` | `{ deviceLabel, reason }` | Validates caller is `CurrentHolderEmail`; appends a `Kept` row; refreshes `LastUpdated`. | Current holder |
| `initiateTransfer` | `{ deviceLabel, toEmail, cameraModel?, notes? }` | Validates caller is current holder and device has no existing pending transfer; appends `TransferInitiated` row (`TransferStatus: Pending`); sets `Devices.HasPendingTransferTo`. | Current holder |
| `respondToTransfer` | `{ transactionId, decision: "confirm" \| "decline" }` | Validates caller is the `CounterpartyEmail` on that pending transaction. If confirmed: appends `TransferConfirmed` row, updates `CurrentHolderEmail`, clears `HasPendingTransferTo`. If declined: appends `TransferDeclined` row, clears `HasPendingTransferTo`, holder unchanged. | Named recipient only |
| `logNewbieHandoff` | `{ deviceLabel, newbieName, notes? }` | Validates caller is current holder; appends `NewbieHandoff` row; sets `PhysicallyWithNote`. | Current holder |
| `reportLostDamaged` | `{ deviceLabel, status: "Lost" \| "Damaged", notes? }` | Appends `LostDamagedReported` row; sets `Devices.Status`. | Current holder or Admin |
| `addDevice` | `{ deviceLabel, deviceType, capacity, initialHolderEmail }` | Validates label doesn't already exist; appends row to `Devices` (`Status: Active`); appends `DeviceAdded` transaction row. | Admin only |
| `approveMember` | `{ email, name, role }` | Appends or reactivates a `Members` row. | Admin only |
| `removeMember` | `{ email }` | Sets `Active = N`. Never deletes the row. | Admin only |
| `correctLogEntry` | `{ transactionId, correctionNote }` | Appends an `AdminCorrection` row with `LinkedTransactionID` pointing at the original. Never edits the original row. | Admin only |

**Error messages should be specific and human-readable**, e.g.:
- `"You are not the current holder of this device."`
- `"This device already has a pending transfer awaiting confirmation."`
- `"This email is not an approved member."`
- `"Only Admins can perform this action."`

## 11. Auth Flow

1. Frontend loads Google Identity Services (`accounts.google.com/gsi/client`) and renders a "Sign in with Google" button, configured with your OAuth Client ID (public, safe to expose in frontend code).
2. On success, the frontend receives a Google **ID token** (a JWT).
3. Store the token in `sessionStorage` for the tab's lifetime (this is a real deployed site, not a Claude artifact, so `sessionStorage` is fine here — it just won't persist across a browser restart, which is an acceptable tradeoff; a token also expires in ~1 hour regardless).
4. Every backend call sends this token in the request body (Section 10). The Apps Script backend verifies it server-side:
   - `UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + idToken)`
   - Confirm the response's `aud` matches your Client ID and `exp` hasn't passed.
   - Extract the verified `email` from the response — never trust an email sent directly by the frontend, always re-derive it from the verified token server-side.
   - Look up that email in `Members`; reject with a clear error if not found or `Active = N`.
5. On token expiry (calls start failing with an auth error), prompt the user to sign in again rather than failing silently.

## 12. A Real Gotcha: CORS with Apps Script + `fetch`

Apps Script Web Apps deployed with "Anyone" access do support cross-origin calls from a GitHub Pages domain, but a `fetch()` POST with `Content-Type: application/json` triggers a CORS preflight (`OPTIONS`) request that Apps Script doesn't handle by default, causing the call to fail silently in some browsers.

**Workaround:** send the request with `Content-Type: text/plain;charset=utf-8` instead (this avoids the preflight), and still put JSON in the body as a string — the Apps Script side just does `JSON.parse(e.postData.contents)` in `doPost`, which works fine regardless of the declared content type. Worth building this in from the start rather than debugging it after deployment.

## 13. Technical Architecture

```
┌─────────────────────┐        HTTPS POST            ┌───────────────────────┐
│   GitHub Pages       │ ───────────────────────────▶│  Google Apps Script    │
│  (static HTML/CSS/JS)│    (text/plain to avoid       │  (Web App / API layer) │
│                       │     CORS preflight)           │  - verifies ID token   │
│  - Google Sign-In     │ ◀─────────────────────────── │  - reads/writes sheet  │
│    (client-side)      │        JSON responses         │  - enforces role       │
└─────────────────────┘                              └───────────┬───────────┘
                                                                    │
                                                                    ▼
                                                        ┌───────────────────────┐
                                                        │   Google Sheet          │
                                                        │  Members / Devices /    │
                                                        │  Transactions           │
                                                        └───────────────────────┘
```

### Suggested repo structure
```
/index.html          (single-page app shell: Home, History, Update, Pending views, switched client-side — no server routing needed on GitHub Pages)
/css/styles.css       (design tokens from Section 5, dark theme)
/js/config.js         (Google OAuth Client ID + Apps Script Web App URL — both public, non-secret)
/js/api.js            (fetch wrapper implementing the contract in Section 10, incl. the text/plain workaround)
/js/auth.js           (Google Sign-In init, token storage, sign-out)
/js/views/home.js
/js/views/history.js
/js/views/update.js
/js/views/pending.js
/js/views/admin.js
/assets/logo.png       (the attached Perabeats logo)
/apps-script/Code.gs    (reference copy of backend source, kept in version control even though the live deployment lives in the Apps Script editor tied to the Sheet)
```

A single-file `index.html` with all views toggled via JS is also acceptable for an MVP this size (matches the club's past pattern of self-contained HTML tools) — the file split above is a recommendation for maintainability, not a hard requirement.

## 14. Non-Functional Requirements

- **Speed of use over completeness** — every optional field defaults sensibly; never force typing when a dropdown will do.
- **Mobile-first** — most updates happen on a phone, often one-handed, at an event.
- **Works on flaky connectivity** — explicit "saving…" / "failed, retry" states; never silently lose an update.
- **No cost** — GitHub Pages + Google Sheets + Apps Script + Google Identity Services are all free at this scale.
- **Auditable** — the transaction log is append-only; nothing is ever silently overwritten (corrections are new rows, Section 8.3).
- **Fails safe on accountability** — a transfer only completes on explicit recipient confirmation, never on the sender's claim alone.
- **Dark theme, on-brand** — palette and typography per Section 5.

## 15. Decisions Log

| Item | Decision |
|---|---|
| Labeling scheme | `PB-<Capacity>-<Seq>` for cards, `PB-HDD-<TB>-<Seq>` for hard disks — confirmed. |
| Notification channel | In-app only (Pending Actions panel). No email/Telegram at launch. |
| Event linkage | Not tracked — no `Event` field in the data model. |
| Camera tracking depth | Reference field only on the transaction (free-text model name), no separate camera registry. |
| Lost/Damaged handling | Explicit `Lost`/`Damaged` status, reporter auto-captured via `ActorEmail`. No separate escalation flow for v1. |
| Admin page | No separate page — inline, permission-gated controls on Home/History. |
| Who holds Admin | President, Secretary, Treasurer — deliberately separate from the Resource Coordinator. |
| Hard disk tracking | Same system as SD cards — one `Devices` sheet, one workflow, distinguished by `DeviceType`. |
| Theme | Dark, brand colors sampled from the Perabeats logo (Section 5). |

## 16. Suggested Build Order (MVP first)

1. Create the Google Sheet with `Members`, `Devices`, `Transactions` tabs exactly per Section 8. Seed `Members` with the President/Secretary/Treasurer as Admins and the RC + known Page Coordinators/Exco as Members. Seed `Devices` with the 8-item inventory from Section 4.
2. Build the Apps Script backend (`Code.gs`) implementing `authCheck` and `listDevices` first — this proves the auth + read path end-to-end.
3. Build `index.html` shell with Google Sign-In and the Home page (read-only) — confirms the frontend↔backend connection, including the CORS workaround (Section 12).
4. Implement `logKept`, `initiateTransfer`, `respondToTransfer` and the Update + Pending Actions views — this is the core workflow; everything else is secondary.
5. Implement `getDeviceHistory` and the color-coded History timeline.
6. Implement `logNewbieHandoff` and `reportLostDamaged`.
7. Implement Admin actions (`addDevice`, `approveMember`, `removeMember`, `correctLogEntry`) and their inline UI controls.
8. Polish: dark theme styling pass against Section 5, empty/loading/error states everywhere, mobile tap-target sizing check.
9. *(Phase 2, only if needed later)* Email/Telegram notifications, event linkage, deeper camera tracking, device filtering/search at scale.

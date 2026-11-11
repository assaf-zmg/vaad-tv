# Wave 3 (QR segments) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two QR segments on the lobby screen: "הטיול הבא שלכם" (a small QR card on Israeli landscape photos → a Hebrew Wikipedia page) and "העוגה הבאה שלכם" (Thursday 15:00 → Friday 12:00 Israel time: a cake photo + QR to a recipe), every QR pointing at our own closed `/go/<id>` list.

**Architecture:** Content owns three data files (`server/go-links.json`, `server/cakes.json`, and trip fields on `server/bg-images.json`). The server decides in `schedule.getBackground()` whether a QR card belongs on the current photo and returns it in `background.qr`. It renders QR PNGs at `/api/qr/:id.png` and redirects `/go/:id` → target. The ES5 client only draws `background.qr`.

**Tech Stack:** Node/Express on Vercel (existing), `qrcode@1.5.4` (MIT, pure JS; deps `pngjs`, `dijkstrajs`), ES5 client, node `assert` tests (`cd server && npm test`).

**Spec:** D33 in `docs/plan/work-plan.md` (owner-approved), the manager's brief of 11.11.2026, and design's `docs/design/handoff-wave3.md` (**pending**: Task 6 waits for it; Tasks 1–5 don't).

**Build order:** D31 (announcements card) ships first. Wave 3 starts after it, on a worktree outside iCloud (D19).

## Global Constraints

- Client stays ES5, XHR only, no client libraries; QR is rendered on the server as PNG (the kiosk is Android 4.4).
- Every `/api` response keeps `X-Content-Type-Options: nosniff` (existing middleware).
- `/go/:id` redirects only to entries of `server/go-links.json` (closed list); unknown or invalid id → 404; `Cache-Control: no-store`.
- QR: error level **M**, PNG width **≥ 300 px**, quiet zone (**margin**) **4**, cached per id.
- Cake window: **Israel local Thursday 15:00 → Friday 12:00** (start inclusive, end exclusive).
- No cake while **any** schedule item is active (event, holiday, memorial, mourning, committee request).
- No trip card on theme (holiday/event) photos or during a red alert. Trip card only on **landscape** pool photos that carry trip data.
- No QR card at all during an alert, and none while a committee flyer takes over the photo area.
- Data files are content-owned; dev changes their schema only after agreeing with content (CLAUDE.md).

## Data contract (FINAL, set by the manager 11.11.2026; one source per fact)

```jsonc
// server/go-links.json — the ONLY place target URLs live. id: ^[a-z0-9-]{2,40}$; url: https only
{ "trip-ein-bokek": { "url": "https://he.wikipedia.org/wiki/..." },
  "cake-07":        { "url": "https://..." } }

// server/cakes.json — 52 entries; NO recipe url here (it lives in go-links via "go")
[ { "id": "cake-07", "title": "עוגת שמרים שוקולד",
    "image": "https://images.unsplash.com/...&w=1600&q=70&fm=jpg",
    "credit": "Name", "license": "Unsplash", "source": "Unsplash",
    "page": "https://unsplash.com/photos/...", "go": "cake-07",
    "kashrut_note": "optional" } ]

// server/bg-images.json — optional per landscape entry; NO url here
{ "...": "...", "trip": { "title": "עין בוקק, ים המלח", "go": "trip-ein-bokek" } }
```
Contract tests: every `cakes[].go` and `trip.go` exists in go-links; every go-links url is https; 52 cakes; cake ids unique.
Cake photo: **no caption on screen** (like holiday photos); credit on `/credits`.

## Review Focus

1. **Host header injection:** the QR must encode a fixed public origin (`https://vaad-tv.vercel.app`, env `PUBLIC_ORIGIN` for local), never `req.headers.host`. Test in Task 2.
2. **DST inside the cake window:** Israel moves its clock on a **Friday** at 02:00 in spring. The window must stay Thu 15:00 → Fri 12:00 local on that weekend. Test in Task 3.
3. **A go-link that isn't https, or a cake/trip whose `go` id is missing from go-links.json:** must fail loudly in `npm test`, not at 3 a.m. in the lobby. Contract test in Task 1.
4. **Cake photo fails to load:** the existing preload keeps the previous photo (no black area). The QR card must not appear without its photo: the client shows it only after the photo has loaded. Test in Task 5.
5. **QR readability on 1280×720:** the PNG stays ≥ 300 px; CSS must not scale it below ~180 px on low screens (design spec). Checked in Task 6 via measurement.

---

### Task 1: `/go/:id` closed redirect + data contract test

**Files:**
- Create: `server/golinks.js`, `server/test/golinks.test.js`
- Modify: `server/server.js` (route), `server/package.json` (test script)

**Interfaces:**
- Produces: `golinks.resolve(id: string) -> string|null` (target url or null); `golinks.isValidId(id) -> boolean`; `golinks.LINKS` (the loaded map).

- [ ] **Step 1: Write the failing tests** (`server/test/golinks.test.js`)
  - `resolve('trip-ein-bokek')` returns the https url from the fixture; `resolve('nope')`, `resolve('../x')`, `resolve('')`, `resolve('__proto__')` → `null`.
  - Contract over the REAL files: every `go-links.json` url starts with `https://`; every `cakes.json[].go` and every `bg-images.json[].trip.go` exists in go-links.json; `cakes.json.length === 52`; go-link ids match `/^[a-z0-9-]{2,40}$/`; cake ids unique.
  - Route (extend `test/server.test.js`): `GET /go/<known>` → 302, `Location` = target, `Cache-Control: no-store`; `GET /go/unknown` → 404, empty body.
- [ ] **Step 2: Run** `cd server && node test/golinks.test.js`. Expected: FAIL (`Cannot find module '../golinks'`).
- [ ] **Step 3: Implement** `golinks.js` (`Object.prototype.hasOwnProperty.call` lookup, so `__proto__` can't match), plus the route `app.get('/go/:id', …)` → `res.set('Cache-Control','no-store'); res.redirect(302, url)` or `res.status(404).send('')`.
- [ ] **Step 4: Run** `npm test`. Expected: all suites ALL OK.
- [ ] **Step 5: Commit** `feat(go): closed /go/:id redirect list with contract test`.

### Task 2: QR PNG route `/api/qr/:id.png`

**Files:**
- Create: `server/qr.js`, `server/test/qr.test.js`
- Modify: `server/server.js`, `server/package.json` (dependency `"qrcode": "1.5.4"`, exact), `server/package-lock.json`

**Interfaces:**
- Consumes: `golinks.resolve`, `golinks.isValidId`.
- Produces: `qr.pngFor(id: string) -> Promise<Buffer|null>` (null for unknown ids); `qr.goUrl(id) -> string` = `PUBLIC_ORIGIN + '/go/' + id`.

- [ ] **Step 1: Write the failing tests**
  - `goUrl('cake-07') === 'https://vaad-tv.vercel.app/go/cake-07'` (no env override set).
  - `pngFor('cake-07')` resolves to a Buffer that starts with the PNG signature `89 50 4E 47`; its IHDR width (bytes 16–19, big-endian) is `>= 300`; a second call returns the same Buffer instance (cache).
  - `pngFor('nope')` → `null`.
  - Route: `GET /api/qr/cake-07.png` → 200, `image/png`, `Cache-Control` contains `max-age=86400`, plus `nosniff`. `GET /api/qr/nope.png` → 404. With header `Host: evil.example`, the PNG bytes equal the normal ones (origin is fixed).
- [ ] **Step 2: Run** and expect FAIL (missing module).
- [ ] **Step 3: Implement** with `QRCode.toBuffer(goUrl(id), { errorCorrectionLevel: 'M', margin: 4, width: 320, type: 'png' })`, an in-memory `Map` cache by id, and `PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || 'https://vaad-tv.vercel.app'`.
- [ ] **Step 4: Run** `npm test` (expect ALL OK). Then verify bundling: `npx @vercel/nft@0.27.4 print server/server.js | grep -E "qrcode|pngjs|dijkstrajs"` must list all three, and `yargs` must NOT be required at runtime.
- [ ] **Step 5: Commit** `feat(qr): server-side QR PNG per go-link (M, 320px, margin 4)`.

### Task 3: Cake slot in the schedule

**Files:**
- Modify: `server/schedule.js`, `server/test/schedule.test.js`, `server/credits.js`, `server/test/credits.test.js`

**Interfaces:**
- Consumes: `cakes.json` (Data contract: `title`, `image`, `go`), `golinks`.
- Produces: `schedule.cakeWindowActive(localMs: number) -> boolean`; `schedule.cakeFor(localMs) -> cakeEntry` (week index = floor(days since a fixed Thursday epoch / 7) mod 52, deterministic); `getBackground()` returns `{ …, kind: 'cake', url: '/api/cake/<i>?v=<urlVersion>', caption: '', qr: { kind: 'cake', id, title: 'העוגה הבאה שלכם', line: cake.title, src: '/api/qr/<go>.png' } }` inside the window.

- [ ] **Step 1: Write the failing tests** (local Israel times via the existing `local()` helper):
  - Thursday 14:59 → not cake. Thursday 15:00 → cake. Friday 11:59 → cake. Friday 12:00 → not cake. Saturday 10:00 → not cake.
  - DST: on the spring Friday when clocks move at 02:00, Friday 11:59 local is still cake and 12:00 is not.
  - A schedule item active that Thursday (holiday, memorial, mourning, custom) → no cake; the theme wins as today.
  - Two consecutive weeks show different cakes; the same week shows the same cake all window long.
  - `qr.src === '/api/qr/' + cake.go + '.png'`; the background caption is `''` (D25-like: no caption on the cake photo).
  - credits.test: every `cakes.json` entry appears on `/credits` as `צילום: <credit> · Unsplash` with its `page` link (new section "עוגות").
- [ ] **Step 2: Run** and expect FAIL (`cakeWindowActive is not a function`).
- [ ] **Step 3: Implement** the window check from the Israel-local weekday/hour of `localMs` (UTC getters on local ms, as `localDateString` does). The cake check runs after the schedule check and before `poolBackground`. Add an `/api/cake/:index` route in `server.js` using the existing `sendPoolImage` on `cake.image`.
- [ ] **Step 4: Run** `npm test`. Expected: ALL OK.
- [ ] **Step 5: Commit** `feat(schedule): Thursday 15:00–Friday 12:00 cake slot`.

### Task 4: Trip card on landscape photos + no QR during an alert

**Files:**
- Modify: `server/schedule.js`, `server/server.js` (pass alert state), `server/test/schedule.test.js`

**Interfaces:**
- Changes: `getBackground(schedule, localMs, slotMs, opts)` with `opts = { alert: boolean }`.
- Produces: on a landscape slot whose entry has `trip`, `bg.qr = { kind: 'trip', id: trip.go, title: 'הטיול הבא שלכם', line: trip.title, src: '/api/qr/<go>.png' }`.

- [ ] **Step 1: Write the failing tests:**
  - A landscape slot with `trip` → `qr.kind === 'trip'`. A landscape without `trip` → no `qr`. Nature, art, theme and custom photos → no `qr`.
  - `opts.alert === true` → no `qr` on any kind (cake photo still shows, without its card).
  - Existing calls without `opts` keep working (default `{ alert: false }`).
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Implement**; in `server.js`, call `getBackground(…, { alert: !!(results.alert && results.alert.title) })`.
- [ ] **Step 4: Run** `npm test`. Expected: ALL OK.
- [ ] **Step 5: Commit** `feat(schedule): trip QR card on Israeli landscapes; none during alerts`.

### Task 5: Client render of `background.qr`

**Files:**
- Modify: `public/index.html` (one `#photo-qr` container in `#photo`), `public/js/dashboard.js`, `server/test/client.test.js`

**Interfaces:**
- Consumes: `background.qr` from Tasks 3–4.
- Produces: `renderQr(qr)` in dashboard.js (ES5), called from `applyBackground`'s `onload` (so the card appears only together with its photo) and from `showAnnouncementPhoto` (hidden while a flyer shows).

- [ ] **Step 1: Write the failing test** (extract `qrCardHtml(qr)` as with `stripEmoji`):
  - It returns markup containing `src="/api/qr/cake-07.png"`, the escaped title and line, and `alt=""`.
  - `qrCardHtml(null) === ''`.
  - Title/line with `<b>` are escaped.
- [ ] **Step 2: Run** and expect FAIL (`qrCardHtml not found`).
- [ ] **Step 3: Implement** `qrCardHtml` + `renderQr`; under `body.has-alert` the card is hidden by CSS too (belt and braces).
- [ ] **Step 4: Run** `npm test` and `npx acorn@8.11.3 --ecma5 --silent public/js/dashboard.js` (exit 0).
- [ ] **Step 5: Commit** `feat(client): QR card for cake and trip segments`.

### Task 6: Design CSS + visual gate (needs `handoff-wave3.md`)

**Files:** `public/css/style.css` (append design's CSS verbatim), launch configs `vaad-tv-cake` (DEBUG_DATE on a Thursday 16:00) and `vaad-tv-trip` (a slot with a trip landscape).

- [ ] **Step 1:** Apply design's CSS. The grep for forbidden CSS (`grid|gap:|var(--|backdrop-filter|inset:|clamp(|line-clamp|ellipsis`, comments stripped) → 0.
- [ ] **Step 2:** At 1920×1080 and 1280×720, measure: the QR `<img>` rendered width ≥ 180 px; the card doesn't overlap the column or the caption; there's no hidden text (the D26 check).
- [ ] **Step 3:** Screenshots: cake (both sizes), trip, cake + holiday (no cake), trip + alert (no card), flyer over a trip photo (no card).
- [ ] **Step 4:** A phone scans the 1280 QR from the screen and lands on the target via `/go/` (owner or manager; I can't scan).
- [ ] **Step 5: Commit** `feat(css): wave 3 QR card (design handoff)`. Then the release gate in `docs/plan/release-checklist.md`, a code review, owner approval, and a push by hash.

---

**Self-review notes:**
- Every D33/brief requirement maps to a task: /go → T1; QR → T2; cake window + no-cake rule + cake credits → T3; trip rules + alert → T4; client → T5; design → T6.
- `qrcode`'s `yargs` dependency belongs only to its CLI (`bin/`); the library entry doesn't require it. T2 Step 4 verifies this with nft.
- `getBackground`'s new `opts` (T4) is used by T5's data only through `background.qr`.
- Data contract is final (manager, 11.11.2026). Cake photo: no on-screen caption (decided). Still open: design's handoff-wave3.md (Task 6), and content's link-permission check for the recipe sites (D33).
- Execution: Native (approved), with one reviewer at the end. Order: D31 first, then T1–T6.

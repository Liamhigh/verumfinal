# Verum Omnis – Stateless Web + APK Monorepo

This repo ships a **Firebase backend** (Functions v2 + Hosting) and a **stateless Android APK**
wrapper (Capacitor) that simply loads the web UI and talks to the same `/api` endpoints.
Nothing is stored server‑side except **ephemeral signing**; the phone app stays stateless by design.

## Structure
- `functions/` — Express app exported as Firebase Function `api2` with endpoints:
  - `GET /api/v1/verify` — core manifest (hashes & policy)
  - `GET /api/v1/verify-rules` — 9‑brain rules manifest
  - `POST /api/v1/anchor` — returns a signed receipt (Ed25519 JWS) for a given SHA‑512
  - `GET /api/v1/receipt?hash=...` — fetch a signed receipt for a hash
  - `POST /api/v1/seal` — streams a sealed PDF (logo header, watermark, QR, SHA‑512)
  - `POST /api/v1/chat` — triple‑provider chat (OpenAI/Anthropic/DeepSeek) with 2‑of‑3 consensus
  - `GET /api/health`, `GET /api/docs/openapi.yaml`
- `web/` — Firebase Hosting public site with a basic UI and a link to download the latest APK artifact.
- `capacitor-app/` — Minimal Capacitor wrapper that loads the hosted site in a WebView for an APK that remains stateless.

## One‑time setup
1) Create a Firebase project and set it in `.firebaserc`.
2) Install tools locally (optional): `npm i -g firebase-tools`
3) Generate an Ed25519 key (JWK) and store as secret `VOSIGNINGKEY` (see below).

## Secrets (Firebase)
These are stored as **Firebase Functions secrets**:
- `VOSIGNINGKEY` (required) — Ed25519 private key as JWK JSON (for JWS receipts)
- `ALLOWED_ORIGINS` (recommended) — comma‑separated origins (e.g. `https://verumglobal.foundation`)
- `OPENAIAPIKEY`, `ANTHROPICAPIKEY`, `DEEPSEEKAPIKEY` (optional) — for `/v1/chat`

### Generate an Ed25519 JWK (once)
```bash
node -e "import('jose').then(async j=>{const {generateKeyPair,exportJWK}=j;const {privateKey}=await generateKeyPair('Ed25519');console.log(JSON.stringify(await exportJWK(privateKey)));})"
```

Then:
```bash
npx firebase-tools@latest functions:secrets:set VOSIGNINGKEY
```

## Deploy (from GitHub Actions or local)
```bash
npm --prefix functions ci
npx firebase-tools@latest deploy --only functions,hosting
```

## APK (stateless)
The Capacitor app just wraps the hosted site (default `https://localhost` during dev; set `APP_START_URL` for prod).
It **stores nothing**, and all verification happens client‑side (hashing) or via `/api` calls.

### Build locally
```bash
cd capacitor-app
npm i
npx cap add android
npm run build   # builds web assets into ./www
npx cap copy android
cd android && ./gradlew assembleDebug
```
The debug APK will be at `capacitor-app/android/app/build/outputs/apk/debug/app-debug.apk`.

## CI
- `.github/workflows/firebase-deploy.yml` — deploy Hosting + Functions on pushes to `main`.
- `.github/workflows/android-apk.yml` — build a debug APK and upload it as a GitHub Actions artifact.

---

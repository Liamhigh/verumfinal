# Verum Omnis Copilot Instructions

## Architecture Overview
This is a **stateless cryptographic verification system** built as a Firebase + Capacitor monorepo. Key principle: **nothing persists server-side** except ephemeral Ed25519 signed receipts in memory.

**Core Components:**
- `functions/` - Express app exported as Firebase Function `api2` (Node 20 ES modules)
- `web/` - Static Firebase Hosting site with basic UI
- `capacitor-app/` - Stateless Android APK wrapper that loads the hosted web UI

**Data Flow:** Client → `/api/v1/*` endpoints → Ed25519 signed JWS receipts → Client storage only

## Key Technical Patterns

### Cryptographic Signing (functions/index.js)
- Uses Ed25519 JWK from `VOSIGNINGKEY` secret for all JWS signing
- `signPayload()` creates JWT with 1-hour expiration, issuer "verum.omnis"
- Supports both PKCS8 PEM and JWK JSON formats for the signing key

### API Rate Limiting Strategy
```javascript
const rlTight = rateLimit({ windowMs: 60_000, max: 30 });    // 30/min for anchor/seal
const rlNormal = rateLimit({ windowMs: 15*60_000, max: 300 }); // 300/15min for reads
```

### Firebase Configuration Pattern
- `firebase.json` rewrites `/api/**` → `api2` function
- All API endpoints prefixed with `/v1/`
- CORS configured per `ALLOWED_ORIGINS` environment variable

### Stateless Receipt System
- In-memory Map in `receipts-kv.js` (ephemeral by design)
- SHA-512 hash → signed receipt mapping
- No database persistence - intentionally volatile

## Critical Developer Workflows

### Local Development
```bash
# Functions only (fastest iteration)
cd functions && npm start  # Firebase emulator on port 5001

# Full stack with hosting
npx firebase-tools@latest emulators:start
```

### Environment Setup (One-time)
1. Generate Ed25519 JWK: `node -e "import('jose').then(async j=>{const {generateKeyPair,exportJWK}=j;const {privateKey}=await generateKeyPair('Ed25519');console.log(JSON.stringify(await exportJWK(privateKey)));})"` 
2. Set Firebase secret: `npx firebase-tools@latest functions:secrets:set VOSIGNINGKEY`
3. Configure `.firebaserc` with your Firebase project ID

### Deployment
```bash
npm --prefix functions ci                                    # Install deps
npx firebase-tools@latest deploy --only functions,hosting   # Deploy both
```

### APK Build (Capacitor)
```bash
cd capacitor-app
npm run build      # Copies ../web/* to ./www
npx cap copy android
cd android && ./gradlew assembleDebug
```

## API Endpoint Patterns

### Core Verification Endpoints
- `GET /v1/verify` - Returns signed manifest with constitution/model pack hashes
- `GET /v1/verify-rules` - Returns signed rules manifest from assets/rules/ directory
- `POST /v1/anchor` - Takes `{hash}`, returns Ed25519 signed receipt
- `GET /v1/receipt?hash=...` - Retrieves stored receipt (ephemeral)

### PDF Generation
- `POST /v1/seal` - Streams PDF with logo, QR code, watermark, SHA-512 hash
- Uses PDFKit with custom font loading from `pdf/fonts/`
- Template in `pdf/seal-template.js`

### Multi-Provider Chat
- `POST /v1/chat` - Routes to OpenAI/Anthropic/DeepSeek with 2-of-3 consensus
- Requires `OPENAIAPIKEY`, `ANTHROPICAPIKEY`, `DEEPSEEKAPIKEY` secrets

## File Organization Conventions

### Config & Environment (functions/config.js)
- All environment variables centralized here
- Hash computation utilities (`sha512File`, `sha512Hex`)
- Asset management for constitution.pdf, model_pack.json, rules/

### Security Headers & Middleware
- Helmet with CSP disabled, cross-origin resource policy enabled
- CORS restricted to `ALLOWED_ORIGINS` or localhost defaults
- Express JSON limit set to 10mb for file uploads

### Asset Hashing Strategy
- Constitution: `assets/constitution.pdf` → `CONSTITUTION_HASH`
- Model pack: `assets/model_pack.json` → `MODELPACK_HASH`  
- Rules: Dynamic scanning of `assets/rules/` → `RULES_PACK_HASH`

## Integration Points

### Firebase Hosting Rewrite
`firebase.json` routes all `/api/**` requests to the `api2` Cloud Function, enabling seamless API serving from the same domain as static hosting.

### Capacitor WebView Configuration
- `capacitor.config.ts` sets `server.url` to hosted site
- `APP_START_URL` environment variable for production domains
- No native storage - all state in web context

### OpenAPI Documentation
- Spec available at `/api/docs/openapi.yaml`
- Self-documenting via `functions/openapi.yaml`

## Common Gotchas

- **Receipts are ephemeral** - function restarts clear all stored receipts
- **ES modules required** - use `import/export`, not `require()`
- **CORS origins** must be configured via `ALLOWED_ORIGINS` secret
- **APK requires production URL** - set `APP_START_URL` for real deployments
- **Rate limits are per-instance** - scaling creates separate limits per function instance
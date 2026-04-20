# ReadMeThat

`readmethat.com`

ReadMeThat is a local-first, modular document-to-speech MVP built as a TypeScript monorepo. The project is split into reusable UI, API, and core service layers so the same parsing, language detection, and TTS abstractions can later support a hosted web product, React Native mobile apps, or provider-backed speech services.

## Structure

```text
doc-to-speech-local/
  apps/
    api/                  Fastify API
    web/                  React + Vite browser UI
  packages/
    shared/               Shared types and utilities
    document-core/        TXT/PDF/DOCX parsing
    lang-core/            Language detection
    tts-core/             TTS abstraction and OpenAI/browser providers
```

## Setup

1. Install Node.js 20+.
2. Copy `.env.example` to `.env` and adjust ports if needed.
3. Install dependencies:

```bash
npm install
```

4. Start the local MVP:

```bash
npm run dev
```

Default local addresses for ReadMeThat:

- Web UI: `http://127.0.0.1:5080`
- API: `http://127.0.0.1:5061`

To enable the OpenAI TTS trial:

```bash
OPENAI_API_KEY=your_key_here
OPENAI_TTS_MODEL=gpt-4o-mini-tts
```

Core production env knobs:

```bash
API_HOST=0.0.0.0
WEB_ORIGIN=https://readmethat.com,https://www.readmethat.com
VITE_BACKEND_TARGET=https://api.readmethat.com
TRUST_PROXY=true
API_RATE_LIMIT_MAX=60
API_RATE_LIMIT_WINDOW_MS=60000
MAX_UPLOAD_SIZE_MB=20
```

## MVP Features

- Paste text into the browser UI
- Upload TXT, PDF, or DOCX
- Extract and normalize readable text
- Generate a short, medium, or detailed summary from extracted text
- Optionally translate text before playback
- Auto-detect language
- Manually override language before playback
- Select from OpenAI TTS voices
- Use `warm`, `neutral`, or `narrator` tone presets
- Automatically split long text into multiple synthesis chunks during playback
- Play, pause, resume, and stop playback
- Play either the full extracted text or the generated summary
- Show clear status and error feedback

## API Endpoints

- `POST /api/documents/parse`
- `POST /api/documents/summarize`
- `POST /api/language/detect`
- `POST /api/translation/translate`
- `GET /api/voices`
- `GET /api/speech/status`
- `POST /api/speech/playback-config`
- `POST /api/speech/synthesize`

## Production Readiness

The API now supports:

- comma-separated allowed origins via `WEB_ORIGIN`
- environment-based upload limits via `MAX_UPLOAD_SIZE_MB`
- in-memory request throttling via `API_RATE_LIMIT_MAX` and `API_RATE_LIMIT_WINDOW_MS`
- proxy-aware IP handling via `TRUST_PROXY`

Current note:

- the built-in rate limiter is a good first production layer, but for larger traffic you should move rate limiting to an edge layer or shared store such as Redis
- the current local `.env` file contains a real OpenAI key for development; before going live you should rotate that key and store the new key only in your hosting provider's secret manager

## Live Deployment Path

Recommended first production setup:

1. Deploy `apps/api` as a Node service on Railway, Render, Fly.io, or a VPS.
2. Deploy `apps/web` as a static frontend on Vercel or Netlify.
3. Point `readmethat.com` to the frontend.
4. Point `api.readmethat.com` to the API service.
5. Set production environment variables in the hosting dashboards instead of committing secrets.
6. Set `WEB_ORIGIN` to the exact production frontend origins.
7. Set `VITE_BACKEND_TARGET` to the production API URL.
8. Run a smoke test for parse, summary, and TTS before public launch.

Suggested production URL layout:

- Frontend: `https://readmethat.com`
- API: `https://api.readmethat.com`

## Launch Checklist

- [ ] Rotate the current OpenAI API key before public launch
- [ ] Move secrets from local `.env` into the hosting provider's secret store
- [ ] Set `WEB_ORIGIN` to production domains only
- [ ] Set `TRUST_PROXY=true` if the API is behind a platform proxy
- [ ] Confirm `MAX_UPLOAD_SIZE_MB` matches your cost and abuse tolerance
- [ ] Confirm rate limit values for real traffic
- [ ] Test TXT, PDF, and DOCX parsing on the live domain
- [ ] Test short and long TTS playback on the live domain
- [ ] Confirm CORS works only for your production frontend
- [ ] Confirm error logging is visible in your hosting dashboard

## Vercel + Railway Deployment

This repo is now prepared for a simple first production rollout using:

- `Vercel` for `apps/web`
- `Railway` for `apps/api`

Included config files:

- [vercel.json](/Users/ermanacar/Documents/Claude/Projects/borsa%201.1/doc-to-speech-local/vercel.json)
- [railway.toml](/Users/ermanacar/Documents/Claude/Projects/borsa%201.1/doc-to-speech-local/railway.toml)

### 1. Deploy the API on Railway

1. Create a new Railway project from this repo.
2. Set the root directory to the monorepo root: `doc-to-speech-local`.
3. Railway will use `railway.toml`.
4. Add production environment variables:

```bash
API_HOST=0.0.0.0
API_PORT=8080
WEB_ORIGIN=https://readmethat.com,https://www.readmethat.com
TRUST_PROXY=true
API_RATE_LIMIT_MAX=60
API_RATE_LIMIT_WINDOW_MS=60000
MAX_UPLOAD_SIZE_MB=20
OPENAI_API_KEY=your_rotated_production_key
OPENAI_TTS_MODEL=gpt-4o-mini-tts
LIBRETRANSLATE_URL=
LIBRETRANSLATE_API_KEY=
```

5. After deploy, note the Railway API URL, for example:

```text
https://readmethat-api-production.up.railway.app
```

### 2. Attach the API Domain

In Railway:

1. Add a custom domain such as `api.readmethat.com`
2. Point your DNS record to Railway as instructed in their dashboard
3. Verify `https://api.readmethat.com/health`

### 3. Deploy the Web App on Vercel

1. Import the same repo into Vercel.
2. Set the project root to `doc-to-speech-local`.
3. Vercel will use `vercel.json`.
4. Add environment variables:

```bash
VITE_API_BASE_URL=/api
VITE_BACKEND_TARGET=https://api.readmethat.com
WEB_PORT=4173
```

Important:

- for local dev, Vite proxy points to local API
- for production, the frontend should call the hosted API URL or a reverse-proxied path

### 4. Point the Frontend Domain

In Vercel:

1. Add `readmethat.com`
2. Add `www.readmethat.com` if you want both
3. Configure DNS records in your domain registrar as Vercel instructs

### 5. Final Production Values

Recommended public URL layout:

- frontend: `https://readmethat.com`
- api: `https://api.readmethat.com`

Recommended environment pairing:

Frontend:

```bash
VITE_API_BASE_URL=https://api.readmethat.com/api
```

API:

```bash
WEB_ORIGIN=https://readmethat.com,https://www.readmethat.com
```

### 6. Smoke Test After Deploy

After both sides are live, test in this order:

1. `GET https://api.readmethat.com/health`
2. Open `https://readmethat.com`
3. Paste short text and test `Extract Text`
4. Test `Generate Summary`
5. Test `Play Summary`
6. Test a long text to confirm chunked playback works
7. Test `Marin` and `Cedar` Turkish comparison
8. Confirm browser console has no CORS failures

### 7. Before Public Launch

Do these last:

1. Rotate the current local OpenAI key
2. Delete the old key from local and hosting dashboards
3. Create a new production-only OpenAI key
4. Put only the new key into Railway secrets
5. Re-test TTS after rotation

## Translation Before Playback

ReadMeThat now supports an optional "translate first, then read aloud" flow. The translation layer is provider-based, similar to the TTS design.

To enable real translation, add a LibreTranslate-compatible endpoint in `.env`:

```bash
LIBRETRANSLATE_URL=http://127.0.0.1:5005
LIBRETRANSLATE_API_KEY=
```

If no translation provider is configured, the app will still work normally for direct playback and will show a clear message when translation is requested.

You can verify the translation endpoint from the project root with:

```bash
npm run translation:check
```

The UI also shows the current provider health under the translation panel.

## Acceptance Criteria Checklist

- [x] Separate monorepo structure for web, api, and reusable packages
- [x] Configurable local ports via environment variables
- [x] TXT, PDF, and DOCX parsing path defined in backend services
- [x] Extracted text preview before playback
- [x] Auto-detect language by default
- [x] Manual language override supported
- [x] Voice selection supported from OpenAI TTS voices
- [x] Play, pause, resume, and stop controls
- [x] Clear status and error messaging
- [x] TTS abstraction layer created for future providers

## Known MVP Limitations

- OpenAI TTS requires `OPENAI_API_KEY` to be configured.
- The OpenAI model still has a per-request text limit, but the app now splits long playback into multiple synthesis chunks automatically.
- Translation requires a configured LibreTranslate-compatible service; it is not built into the browser.
- This repo is preconfigured for a local LibreTranslate-style endpoint on `http://127.0.0.1:5005`, but the service itself must be running separately.
- Playback now uses backend-generated audio for the OpenAI TTS path, but realtime streaming is not implemented yet.
- PDF extraction quality depends on the structure of the uploaded PDF.
- No authentication, persistence, or job history is included in MVP.

## Future Expansion Notes

### Replace or Extend TTS Providers

Keep `packages/tts-core` as the provider contract. Add new provider implementations such as ElevenLabs, Polly, Azure, or platform-native mobile adapters while keeping the same abstractions. The UI can continue to request playback config from the API while the actual provider selection stays server-side.

### Add Streaming Playback Later

The current API already isolates playback configuration from the UI. A future `/api/speech/stream` route can generate chunked audio or signed media URLs while keeping the same text parsing and language detection flow.

### Adapt to React Native or Mobile Apps

React Native or native mobile clients can reuse the backend APIs directly and share the contracts from `packages/shared`. Mobile-specific TTS adapters can live behind the same `tts-core` abstractions while reusing parsing and detection services through the API.

### Deploy as a Hosted Web App

The API is already separated from the UI, so deployment can evolve into a standard hosted architecture for `readmethat.com`: static frontend hosting for `apps/web`, a containerized API service for `apps/api`, and external storage or queues added later without rewriting the core parsing and language modules.

## Next Recommended Improvements

1. Add chunked playback for long documents.
2. Add OCR support for image-based PDFs.
3. Add persistent recent documents and playback history.
4. Add provider-backed server-generated audio files.
5. Add authentication and user preferences.

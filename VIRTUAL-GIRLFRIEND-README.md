# Virtual Girlfriend AI — Dark Natural

A mobile-first Russian-language virtual companion prototype with an iPhone-friendly interface, server-side LLM adapter, anonymous signed sessions, PostgreSQL memory, and API safeguards.

## Live preview

Latest deployed preview: https://virtual-girlfriend-97bm91sxn-xxx01po.vercel.app

The preview is deployed, but a working AI conversation still requires an `LLM_API_KEY` from a compatible provider. The database connection and session signing configuration have been added to Vercel; schema tables are created idempotently when the first session initializes. Verify `/api/health` after opening the site.

## Current implementation

- Static mobile UI in `index.html`; designed for Safari and small screens.
- Emotion selector and character traits saved locally.
- Text chat UI connected to `/api/session`, `/api/chat`, and `/api/memory`.
- Vercel serverless TypeScript API routes.
- OpenAI-compatible chat-completions adapter; model, endpoint, and key configured server-side.
- HMAC-signed HttpOnly session cookie; session-owned messages and memories.
- PostgreSQL/Neon schema for sessions, messages, memory facts, and rate limits.
- API rate limits: per-session/minute and HMAC-hashed client key/hour. These reduce casual abuse but are not a substitute for a WAF or billing alerts.
- Same-origin/allowlist checks, no-store API responses, request size limits, and safe error messages.
- Data deletion endpoint removes session, messages, and memory using cascading foreign keys.

## Setup

1. Import this repository into Vercel, with root directory at the repository root.
2. Create a PostgreSQL database (Neon serverless is compatible).
3. Run `schema.sql` once in the database SQL editor.
4. In Vercel Project Settings → Environment Variables, add:
   - `DATABASE_URL`: database connection string.
   - `SESSION_SECRET`: a random secret of at least 32 characters.
   - `LLM_API_KEY`: provider API key.
   - `LLM_BASE_URL`: API base URL, default: `https://openrouter.ai/api/v1` for OpenRouter, or another compatible provider.
   - `LLM_MODEL`: exact model identifier supported by the selected provider; OpenRouter's `openrouter/free` router can be used for testing, subject to free-model availability and rate limits.
   - Optional `ALLOWED_ORIGINS`: comma-separated exact origins; normally leave unset for same-origin hosting.
5. Redeploy after setting environment variables.
6. Open `/api/health`; the booleans should be true for database, session secret, and model configuration.
7. Send a test message from the chat. The provider must support the OpenAI-compatible `/chat/completions` endpoint and JSON response mode.

Never commit real secrets or put them in frontend code. `.env.example` contains placeholders only.

## Important limitations

- No user account / password authentication yet. Anonymous sessions persist in the same browser through an HttpOnly cookie; cross-device sync is not implemented.
- The CSS portrait is a temporary stylized placeholder, not a photorealistic rigged 3D avatar.
- Browser speech input/output is implemented when the user's browser supports it; native voice provider integration, lip sync, push notifications, and real-time streaming are not implemented yet.
- API rate limiting currently uses database buckets; add managed WAF/Redis limits and provider spend caps before public launch.
- The public site is deployed. The PostgreSQL database and signed sessions are configured. Real AI replies remain disabled until an `LLM_API_KEY` is added in Vercel; then redeploy and test `/api/health` and a real chat turn. The avatar is currently a stylized CSS prototype, not a photorealistic character.

## Privacy

The LLM provider receives the current message and a bounded recent conversation history plus saved non-sensitive preference facts. Do not share secrets or sensitive personal information. Use the in-app delete action to delete the current anonymous session's server data. This is not a legal/compliance review.

# Virtual Girlfriend AI — Dark Natural

A mobile-first Russian-language virtual companion prototype with an iPhone-friendly interface, server-side LLM adapter, anonymous signed sessions, PostgreSQL memory, and API safeguards.

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
   - `LLM_BASE_URL`: API base URL, e.g. `https://api.openai.com/v1`.
   - `LLM_MODEL`: exact model identifier supported by the selected provider.
   - Optional `ALLOWED_ORIGINS`: comma-separated exact origins; normally leave unset for same-origin hosting.
5. Redeploy after setting environment variables.
6. Open `/api/health`; the booleans should be true for database, session secret, and model configuration.
7. Send a test message from the chat. The provider must support the OpenAI-compatible `/chat/completions` endpoint and JSON response mode.

Never commit real secrets or put them in frontend code. `.env.example` contains placeholders only.

## Important limitations

- No user account / password authentication yet. Anonymous sessions persist in the same browser through an HttpOnly cookie; cross-device sync is not implemented.
- The CSS portrait is a temporary stylized placeholder, not a photorealistic rigged 3D avatar.
- Voice input/output, lip sync, push notifications, and real-time streaming are not implemented yet.
- API rate limiting currently uses database buckets; add managed WAF/Redis limits and provider spend caps before public launch.
- The project is not production-ready until the database and secrets are configured, deployed, and tested.

## Privacy

The LLM provider receives the current message and a bounded recent conversation history plus saved non-sensitive preference facts. Do not share secrets or sensitive personal information. Use the in-app delete action to delete the current anonymous session's server data. This is not a legal/compliance review.

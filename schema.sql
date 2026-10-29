-- Run once in your PostgreSQL/Neon SQL editor.
CREATE TABLE IF NOT EXISTS vg_sessions (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS vg_messages (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES vg_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL CHECK (char_length(content) <= 8000),
  emotion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS vg_messages_session_created_idx ON vg_messages(session_id, created_at DESC);
CREATE TABLE IF NOT EXISTS vg_memories (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES vg_sessions(id) ON DELETE CASCADE,
  fact TEXT NOT NULL CHECK (char_length(fact) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, fact)
);
CREATE INDEX IF NOT EXISTS vg_memories_session_idx ON vg_memories(session_id, created_at DESC);

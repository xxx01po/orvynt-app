import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";
import { sessionFromCookie } from "../lib/session";

function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  return neon(process.env.DATABASE_URL);
}
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  const origin = req.headers.origin;
  if (origin) {
    const allowed = (process.env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
    const host = req.headers.host;
    const expected = `${req.headers["x-forwarded-proto"] || "https"}://${host}`;
    if (allowed.length ? !allowed.includes(origin) : origin !== expected) return res.status(403).json({ error: "Недопустимый источник запроса." });
  }
  const sessionId = sessionFromCookie(req.headers.cookie);
  if (!sessionId) return res.status(401).json({ error: "Сессия не найдена." });
  try {
    const sql = db();
    if (req.method === "GET") {
      const rows = await sql`SELECT id, fact, created_at FROM vg_memories WHERE session_id = ${sessionId}::uuid ORDER BY created_at DESC LIMIT 100`;
      return res.status(200).json({ memories: rows });
    }
    if (req.method === "DELETE") {
      const id = Number(req.body?.id);
      if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Укажите корректный id записи." });
      await sql`DELETE FROM vg_memories WHERE id = ${id} AND session_id = ${sessionId}::uuid`;
      return res.status(200).json({ ok: true });
    }
    res.setHeader("Allow", "GET, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("memory request failed", error instanceof Error ? error.message : "unknown");
    return res.status(500).json({ error: "Не удалось получить память." });
  }
}

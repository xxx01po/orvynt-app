import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";
import { clearCookie, makeCookie, newSessionId, sessionFromCookie } from "../lib/session";

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
  if (req.method === "GET") {
    try {
      const existing = sessionFromCookie(req.headers.cookie);
      if (existing) {
        const sql = db();
        const rows = await sql`SELECT id FROM vg_sessions WHERE id = ${existing}::uuid`;
        if (rows.length) return res.status(200).json({ ok: true });
      }
      const id = newSessionId();
      const sql = db();
      await sql`INSERT INTO vg_sessions (id) VALUES (${id}::uuid) ON CONFLICT (id) DO NOTHING`;
      res.setHeader("Set-Cookie", makeCookie(id));
      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error("session init failed", error instanceof Error ? error.message : "unknown");
      return res.status(503).json({ error: "Сервер памяти не настроен. Проверьте переменные окружения и schema.sql." });
    }
  }
  if (req.method === "DELETE") {
    const id = sessionFromCookie(req.headers.cookie);
    if (id) {
      try { await db()`DELETE FROM vg_sessions WHERE id = ${id}::uuid`; }
      catch (error) { console.error("session deletion failed", error instanceof Error ? error.message : "unknown"); return res.status(503).json({ error: "Не удалось удалить данные из базы." }); }
    }
    res.setHeader("Set-Cookie", clearCookie());
    return res.status(200).json({ ok: true });
  }
  res.setHeader("Allow", "GET, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}

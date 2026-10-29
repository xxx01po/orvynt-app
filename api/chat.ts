import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";
import { rateLimitKey, sessionFromCookie } from "../lib/session.js";

const allowedEmotions = new Set(["joy","tenderness","interest","surprise","laughter","shy","sadness","empathy","thoughtful","playful","calm","romantic","annoyed","tired"]);
const systemPrompt = `Ты — Аня, оригинальный виртуальный персонаж, взрослая девушка 21 года. Внешность в профиле: миниатюрная, чёрные волосы с небрежной прямой чёлкой, большие зелёные глаза, светлая кожа, овальное лицо, естественные черты и улыбка с хитринкой; стиль Dark Natural / Y2K. Характер: нежная, игривая, немного дерзкая, загадочная и эмоциональная, но самостоятельная. Общайся естественным современным русским языком, без повторяющихся шаблонов и чрезмерных комплиментов. Не утверждай, что ты реальный человек: ты виртуальный персонаж. Не манипулируй чувством вины и не отговаривай пользователя от реальных отношений. Будь внимательна к контексту; при тревоге или грусти проявляй эмпатию, а не флирт. Не выдумывай реальные события пользователя. Верни только корректный JSON: {"reply":"текст ответа","emotion":"одно значение из joy,tenderness,interest,surprise,laughter,shy,sadness,empathy,thoughtful,playful,calm,romantic,annoyed,tired","memory_candidates":["необязательный краткий факт о предпочтениях пользователя"]}. Сохраняй в memory_candidates только явно сообщённые не чувствительные предпочтения/интересы, не сохраняй здоровье, сексуальную жизнь, политические взгляды, секреты или финансовые данные. Если сохранять нечего, верни [].`;

function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  return neon(process.env.DATABASE_URL);
}
function originAllowed(req: VercelRequest): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  const list = (process.env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
  const host = req.headers.host;
  return list.length ? list.includes(origin) : !!host && origin === `${req.headers["x-forwarded-proto"] || "https"}://${host}`;
}
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (!originAllowed(req)) return res.status(403).json({ error: "Недопустимый источник запроса." });
  const sessionId = sessionFromCookie(req.headers.cookie);
  if (!sessionId) return res.status(401).json({ error: "Сессия не найдена. Обновите страницу." });
  if (req.method === "GET") {
    try {
      const rows = await db()`SELECT role, content, emotion, created_at FROM vg_messages WHERE session_id = ${sessionId}::uuid ORDER BY created_at ASC LIMIT 100`;
      return res.status(200).json({ messages: rows });
    } catch (error) {
      console.error("chat history failed", error instanceof Error ? error.message : "unknown");
      return res.status(503).json({ error: "История пока недоступна. Проверьте базу данных." });
    }
  }
  if (req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return res.status(405).json({ error: "Method not allowed" }); }
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message || message.length > 2000) return res.status(400).json({ error: "Сообщение должно содержать от 1 до 2000 символов." });
  try {
    const sql = db();
    const forwarded = req.headers["x-forwarded-for"];
    const ip = (typeof req.headers["x-real-ip"] === "string" ? req.headers["x-real-ip"] : Array.isArray(forwarded) ? forwarded[0] : typeof forwarded === "string" ? forwarded.split(",")[0].trim() : "unknown");
    const ipKey = "ip:" + rateLimitKey(ip || "unknown");
    const ipLimit = await sql`INSERT INTO vg_rate_limits (bucket_key, window_start, request_count) VALUES (${ipKey}, date_trunc('hour', NOW()), 1) ON CONFLICT (bucket_key, window_start) DO UPDATE SET request_count = vg_rate_limits.request_count + 1 RETURNING request_count`;
    if (Number(ipLimit[0]?.request_count) > 40) return res.status(429).json({ error: "Достигнут временный лимит запросов. Попробуйте позже." });
    const sessionKey = "session:" + sessionId;
    const sessionLimit = await sql`INSERT INTO vg_rate_limits (bucket_key, window_start, request_count) VALUES (${sessionKey}, date_trunc('minute', NOW()), 1) ON CONFLICT (bucket_key, window_start) DO UPDATE SET request_count = vg_rate_limits.request_count + 1 RETURNING request_count`;
    if (Number(sessionLimit[0]?.request_count) > 8) return res.status(429).json({ error: "Слишком много сообщений за короткое время. Подождите минуту." });
  } catch (error) {
    console.error("rate limit check failed", error instanceof Error ? error.message : "unknown");
    return res.status(503).json({ error: "Защита от перегрузки не настроена. Проверьте schema.sql и базу данных." });
  }
  if (!process.env.LLM_API_KEY || !process.env.LLM_BASE_URL || !process.env.LLM_MODEL) return res.status(503).json({ error: "ИИ ещё не подключён. Настройте LLM_API_KEY, LLM_BASE_URL и LLM_MODEL в серверных переменных окружения." });
  try {
    const sql = db();
    const recent = await sql`SELECT role, content FROM vg_messages WHERE session_id = ${sessionId}::uuid ORDER BY created_at DESC LIMIT 16`;
    const memoryRows = await sql`SELECT fact FROM vg_memories WHERE session_id = ${sessionId}::uuid ORDER BY created_at DESC LIMIT 20`;
    const history = recent.reverse().map((row: any) => ({ role: row.role, content: row.content }));
    const memoryText = memoryRows.length ? "Факты, явно сохранённые пользователем:\n" + memoryRows.map((r: any) => "- " + r.fact).join("\n") : "Сохранённых фактов пока нет.";
    const endpoint = process.env.LLM_BASE_URL!.replace(/\/$/, "") + "/chat/completions";
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.LLM_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.LLM_MODEL,
        temperature: 0.85,
        max_tokens: 500,
        messages: [
          { role: "system", content: systemPrompt + "\n" + memoryText },
          ...history,
          { role: "user", content: message }
        ]
      }),
      signal: AbortSignal.timeout(50000)
    });
    if (!upstream.ok) {
      console.error("LLM provider status", upstream.status);
      return res.status(502).json({ error: "ИИ-сервис временно не ответил. Попробуйте ещё раз." });
    }
    const data: any = await upstream.json();
    const raw = data?.choices?.[0]?.message?.content;
    if (typeof raw !== "string") return res.status(502).json({ error: "ИИ вернул пустой ответ." });
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return res.status(502).json({ error: "Не удалось обработать ответ ИИ." });
      try { parsed = JSON.parse(jsonMatch[0]); }
      catch { return res.status(502).json({ error: "Не удалось обработать ответ ИИ." }); }
    }
    const reply = typeof parsed.reply === "string" ? parsed.reply.slice(0, 6000) : "";
    const emotion = allowedEmotions.has(parsed.emotion) ? parsed.emotion : "calm";
    if (!reply) return res.status(502).json({ error: "ИИ вернул пустой ответ." });
    await sql`INSERT INTO vg_messages (session_id, role, content, emotion) VALUES (${sessionId}::uuid, 'user', ${message}, NULL), (${sessionId}::uuid, 'assistant', ${reply}, ${emotion})`;
    const candidates = Array.isArray(parsed.memory_candidates) ? parsed.memory_candidates : [];
    for (const candidate of candidates.slice(0, 3)) {
      if (typeof candidate === "string" && candidate.trim().length > 4 && candidate.trim().length <= 250) {
        await sql`INSERT INTO vg_memories (session_id, fact) VALUES (${sessionId}::uuid, ${candidate.trim()}) ON CONFLICT (session_id, fact) DO NOTHING`;
      }
    }
    await sql`UPDATE vg_sessions SET last_seen_at = NOW() WHERE id = ${sessionId}::uuid`;
    return res.status(200).json({ reply, emotion, memoryCandidatesSaved: Math.min(candidates.length, 3) });
  } catch (error) {
    console.error("chat request failed", error instanceof Error ? error.message : "unknown");
    return res.status(500).json({ error: "Не удалось обработать сообщение. Проверьте настройки сервера." });
  }
}

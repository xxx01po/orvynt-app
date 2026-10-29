import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";

const COOKIE_NAME = "vg_session";
const MAX_AGE = 60 * 60 * 24 * 30;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters");
  return value;
}
function sign(id: string): string {
  return createHmac("sha256", secret()).update(id).digest("hex");
}
export function newSessionId(): string {
  return randomUUID();
}
export function makeCookie(id: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${id}.${sign(id)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}${secure}`;
}
export function clearCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}
export function sessionFromCookie(header: string | undefined): string | null {
  if (!header) return null;
  const pair = header.split(";").map(x => x.trim()).find(x => x.startsWith(COOKIE_NAME + "="));
  if (!pair) return null;
  const value = pair.slice(COOKIE_NAME.length + 1);
  const dot = value.indexOf(".");
  if (dot < 1) return null;
  const id = value.slice(0, dot);
  const supplied = value.slice(dot + 1);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f]{64}$/i.test(supplied)) return null;
  let expected: string;
  try { expected = sign(id); } catch { return null; }
  const a = Buffer.from(supplied, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

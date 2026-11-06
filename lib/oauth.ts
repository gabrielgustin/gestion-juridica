import "server-only"
import { createHash, randomBytes } from "node:crypto"
import { sql } from "@/lib/sql"

// OAuth 2.1 mínimo para el conector MCP: registro dinámico de clientes públicos + código con PKCE (S256) + refresh con rotación.

export const issuer = (request: Request) => process.env.BETTER_AUTH_URL?.replace(/\/$/, "") ?? new URL(request.url).origin
export const newRefresh = () => `er_${randomBytes(32).toString("hex")}`
export const newCode = () => randomBytes(32).toString("base64url")

/** https, o http solo hacia la propia máquina (herramientas de escritorio). */
export function validRedirect(uri: unknown): uri is string {
  if (typeof uri !== "string" || uri.length > 500) return false
  try {
    const u = new URL(uri)
    if (u.hash) return false
    return u.protocol === "https:" || (u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname))
  } catch {
    return false
  }
}

export const pkceOk = (verifier: unknown, challenge: string) =>
  typeof verifier === "string" && /^[A-Za-z0-9._~-]{43,128}$/.test(verifier) &&
  createHash("sha256").update(verifier).digest("base64url") === challenge

export async function getClient(id: unknown) {
  if (typeof id !== "string") return null
  const [client] = await sql<{ id: string; name: string; redirect_uris: string[] }>`select id, name, redirect_uris from oauth_clients where id = ${id}`
  return client ?? null
}

export const oauthError = (error: string, description: string, status = 400) =>
  Response.json({ error, error_description: description }, { status, headers: { "Cache-Control": "no-store" } })

import { hashToken, newToken } from "@/lib/mcp"
import { sql } from "@/lib/sql"
import { newRefresh, oauthError, pkceOk } from "@/lib/oauth"

const respond = (access: string, refresh: string) =>
  Response.json({ access_token: access, token_type: "Bearer", expires_in: 3600, refresh_token: refresh }, { headers: { "Cache-Control": "no-store" } })

export async function POST(request: Request) {
  const type = request.headers.get("content-type") ?? ""
  const body: Record<string, unknown> = await (type.includes("json") ? request.json() : request.formData().then(Object.fromEntries)).catch(() => ({}))
  const clientId = typeof body.client_id === "string" ? body.client_id : ""
  const access = newToken()
  const refresh = newRefresh()

  if (body.grant_type === "authorization_code") {
    // El código se consume al primer intento, sea o no correcto lo demás.
    const [code] = await sql<{ client_id: string; studio_id: string; user_id: string; redirect_uri: string; code_challenge: string }>`
      update oauth_codes set used_at = now()
      where code_hash = ${hashToken(String(body.code ?? ""))} and used_at is null and expires_at > now()
      returning client_id, studio_id, user_id, redirect_uri, code_challenge`
    if (!code || code.client_id !== clientId || code.redirect_uri !== body.redirect_uri || !pkceOk(body.code_verifier, code.code_challenge)) {
      return oauthError("invalid_grant", "Código inválido o vencido.")
    }
    const rows = await sql<{ id: string }>`
      insert into api_tokens (studio_id, user_id, name, token_hash, expires_at, refresh_hash, refresh_expires_at, client_id)
      select m.studio_id, m.user_id, 'Claude · ' || c.name, ${hashToken(access)}, now() + interval '1 hour', ${hashToken(refresh)}, now() + interval '90 days', c.id
      from members m
      join studios s on s.id = m.studio_id and s.deleted_at is null
      join oauth_clients c on c.id = ${clientId}
      where m.studio_id = ${code.studio_id} and m.user_id = ${code.user_id} and m.active
      returning id`
    return rows.length ? respond(access, refresh) : oauthError("invalid_grant", "Tu acceso al estudio está desactivado.")
  }

  if (body.grant_type === "refresh_token") {
    // Rotación: el refresh viejo deja de servir. Si el miembro fue desactivado, no renueva.
    const rows = await sql<{ id: string }>`
      update api_tokens set token_hash = ${hashToken(access)}, refresh_hash = ${hashToken(refresh)},
        expires_at = now() + interval '1 hour', refresh_expires_at = now() + interval '90 days'
      where refresh_hash = ${hashToken(String(body.refresh_token ?? ""))} and client_id = ${clientId}
        and revoked_at is null and refresh_expires_at > now()
        and exists (select 1 from members m where m.studio_id = api_tokens.studio_id and m.user_id = api_tokens.user_id and m.active)
      returning id`
    return rows.length ? respond(access, refresh) : oauthError("invalid_grant", "La conexión venció o fue revocada. Volvé a conectar el estudio.")
  }

  return oauthError("unsupported_grant_type", "Solo authorization_code y refresh_token.")
}

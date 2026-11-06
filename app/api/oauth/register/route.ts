import { randomUUID } from "node:crypto"
import { sql } from "@/lib/sql"
import { oauthError, validRedirect } from "@/lib/oauth"

// Registro dinámico de clientes (RFC 7591): Claude se registra solo la primera vez que se agrega el conector.
// shortcut: sin tope ni limpieza de clientes sin uso; si hay abuso, limitar por IP o borrar los que no tengan tokens.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const uris = body?.redirect_uris
  if (!Array.isArray(uris) || uris.length < 1 || uris.length > 5 || !uris.every(validRedirect)) {
    return oauthError("invalid_redirect_uri", "redirect_uris debe tener de 1 a 5 direcciones https (o http a localhost).")
  }
  const name = (typeof body.client_name === "string" && body.client_name.trim().slice(0, 80)) || "Claude"
  const id = randomUUID()
  await sql`insert into oauth_clients (id, name, redirect_uris) values (${id}, ${name}, ${uris})`
  return Response.json({
    client_id: id, client_name: name, redirect_uris: uris,
    token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
  }, { status: 201, headers: { "Cache-Control": "no-store" } })
}

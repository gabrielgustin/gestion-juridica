"use server"

import { randomUUID } from "node:crypto"
import { after } from "next/server"
import { revalidatePath } from "next/cache"
import { getMember } from "@/lib/session"
import { sql } from "@/lib/sql"
import { seal } from "@/lib/vault"
import { connectorOf } from "@/lib/courts/portals"
import { runConnection } from "@/lib/courts/engine"
import type { ActionResult } from "@/app/(app)/configuracion/actions"

/** Conectores sin navegador (el de prueba) corren en la app; los demás los toma el worker. */
function kick(portal: string, id: string) {
  if (connectorOf(portal)?.inline) after(() => runConnection(id).then(() => revalidatePath("/integraciones")).catch((e) => console.error("[sync]", e)))
}

export async function connectPortal(portal: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const { studio, user } = await getMember()
  const connector = connectorOf(portal)
  if (!connector) return { error: "Portal desconocido." }
  const username = String(form.get("username") ?? "").trim().slice(0, 200)
  const password = String(form.get("password") ?? "")
  if (!username || !password) return { error: "Completá usuario y contraseña." }
  if (password.length > 500) return { error: "La contraseña es demasiado larga." }
  const options: Record<string, string> = {}
  for (const opt of connector.options ?? []) {
    const value = String(form.get(`opt_${opt.key}`) ?? "")
    if (!opt.choices.some((c) => c.value === value)) return { error: `Elegí «${opt.label}».` }
    options[opt.key] = value
  }

  const [existing] = await sql<{ id: string }>`select id from court_connections where studio_id = ${studio.id} and user_id = ${user.id} and portal = ${portal}`
  const id = existing?.id ?? randomUUID()
  const secret = seal(password, id)
  await sql`
    insert into court_connections (id, studio_id, user_id, portal, username, secret, options)
    values (${id}, ${studio.id}, ${user.id}, ${portal}, ${username}, ${secret}, ${JSON.stringify(options)})
    on conflict (studio_id, user_id, portal) do update set username = excluded.username, secret = excluded.secret,
      options = excluded.options, status = 'pendiente', last_error = null, next_sync_at = now()`
  kick(portal, id)
  revalidatePath("/integraciones")
  return { ok: connector.ready ? "Conectado. La primera sincronización arranca en unos instantes." : "Guardado. Este portal todavía está en calibración: va a sincronizar cuando esté listo." }
}

async function ownConnection(id: string) {
  const { studio, user } = await getMember()
  const [conn] = await sql<{ id: string; portal: string }>`
    select id, portal from court_connections where id = ${id} and studio_id = ${studio.id} and user_id = ${user.id}`
  if (!conn) throw new Error("No encontramos esa conexión.")
  return conn
}

export async function syncNow(id: string) {
  const conn = await ownConnection(id)
  await sql`update court_connections set next_sync_at = now(), status = case when status = 'sincronizando' then status else 'pendiente' end where id = ${id}`
  kick(conn.portal, id)
  revalidatePath("/integraciones")
}

/** Borra la conexión y su clave. Las causas quedan en el estudio (y se vuelven a vincular si se reconecta). */
export async function disconnect(id: string) {
  await ownConnection(id)
  await sql`delete from court_connections where id = ${id}`
  revalidatePath("/integraciones")
}

export async function reportProblem(portal: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const { studio, user } = await getMember()
  const message = String(form.get("message") ?? "").trim().slice(0, 2000)
  if (!message) return { error: "Contanos qué pasa." }
  const [conn] = await sql<{ last_error: string | null }>`
    select last_error from court_connections where studio_id = ${studio.id} and user_id = ${user.id} and portal = ${portal}`
  await sql`insert into problem_reports (studio_id, user_id, portal, message, last_error) values (${studio.id}, ${user.id}, ${portal}, ${message}, ${conn?.last_error ?? null})`
  return { ok: "Recibimos tu reporte. Lo revisamos y te avisamos." }
}

// ---------- Conector MCP: tokens personales ----------

/** Crea un token personal. Se muestra una sola vez: se guarda solo su hash. */
export async function createApiToken(name: string): Promise<{ token?: string; error?: string }> {
  const { studio, user } = await getMember()
  const clean = name.trim().slice(0, 80)
  if (!clean) return { error: "Poné un nombre (por ejemplo, «Claude en mi notebook»)." }
  const [{ count }] = await sql<{ count: string }>`select count(*) from api_tokens where user_id = ${user.id} and studio_id = ${studio.id} and revoked_at is null`
  if (Number(count) >= 10) return { error: "Tenés 10 tokens activos. Revocá alguno." }
  const { newToken, hashToken } = await import("@/lib/mcp")
  const token = newToken()
  await sql`insert into api_tokens (studio_id, user_id, name, token_hash) values (${studio.id}, ${user.id}, ${clean}, ${hashToken(token)})`
  revalidatePath("/integraciones")
  return { token }
}

export async function revokeApiToken(id: string) {
  const { studio, user } = await getMember()
  await sql`update api_tokens set revoked_at = now() where id = ${id} and user_id = ${user.id} and studio_id = ${studio.id}`
  revalidatePath("/integraciones")
}

export async function disconnectGoogleCalendar() {
  const { studio, user } = await getMember()
  const { disconnectCalendar } = await import("@/lib/integrations/google-calendar")
  await disconnectCalendar(studio.id, user.id)
  revalidatePath("/integraciones")
}

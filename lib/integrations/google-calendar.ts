import "server-only"
import { query, sql } from "@/lib/sql"
import { open, seal } from "@/lib/vault"
import { appOrigin, eventFor, type TaskRow } from "./google-event"

// Google Calendar en un solo sentido: las tareas del sistema se copian a un calendario "Estudio" en la cuenta
// de cada abogado asignado. Permiso mínimo: calendar.app.created (solo calendarios que crea esta app).

const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.app.created"]
const API = "https://www.googleapis.com/calendar/v3"
export const calendarEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)

const redirectUri = () => `${appOrigin()}/api/integraciones/google/callback`

export function authUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: redirectUri(), response_type: "code",
    scope: SCOPES.join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

type Tokens = { access_token: string; refresh_token?: string; expires_in: number }

export async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...body }),
  })
  if (!response.ok) throw new Error(`Google rechazó la autorización (${response.status}).`)
  return response.json()
}

/** Termina la conexión: guarda los tokens cifrados y crea el calendario "Estudio". */
export async function connectCalendar(studio: { id: string; name: string }, userId: string, code: string) {
  const tokens = await tokenRequest({ code, redirect_uri: redirectUri(), grant_type: "authorization_code" })
  if (!tokens.refresh_token) throw new Error("Google no entregó acceso permanente. Probá de nuevo.")
  const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } }).then((r) => r.json()).catch(() => ({}))
  const calendar = await fetch(`${API}/calendars`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokens.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ summary: `Estudio · ${studio.name}`, timeZone: "America/Argentina/Buenos_Aires" }),
  })
  if (!calendar.ok) throw new Error(`No se pudo crear el calendario (${calendar.status}).`)
  const { id: calendarId } = await calendar.json()

  const [existing] = await sql<{ id: string }>`select id from user_integrations where studio_id = ${studio.id} and user_id = ${userId} and provider = 'google_calendar'`
  const id = existing?.id ?? crypto.randomUUID()
  const secret = seal(JSON.stringify({ access: tokens.access_token, refresh: tokens.refresh_token }), id)
  await sql`delete from calendar_events where integration_id = ${id}`
  await sql`
    insert into user_integrations (id, studio_id, user_id, provider, account, secret, expires_at, calendar_id)
    values (${id}, ${studio.id}, ${userId}, 'google_calendar', ${info.email ?? null}, ${secret}, now() + make_interval(secs => ${tokens.expires_in - 60}), ${calendarId})
    on conflict (studio_id, user_id, provider) do update set account = excluded.account, secret = excluded.secret,
      expires_at = excluded.expires_at, calendar_id = excluded.calendar_id, status = 'ok', last_error = null`
  return id
}

type Integration = { id: string; secret: string; expires_at: Date; calendar_id: string }

async function accessToken(integration: Integration) {
  const stored = JSON.parse(open(integration.secret, integration.id)) as { access: string; refresh: string }
  if (new Date(integration.expires_at) > new Date()) return stored.access
  const tokens = await tokenRequest({ refresh_token: stored.refresh, grant_type: "refresh_token" })
  const secret = seal(JSON.stringify({ access: tokens.access_token, refresh: tokens.refresh_token ?? stored.refresh }), integration.id)
  await sql`update user_integrations set secret = ${secret}, expires_at = now() + make_interval(secs => ${tokens.expires_in - 60}) where id = ${integration.id}`
  return tokens.access_token
}

async function callApi(integration: Integration, method: string, path: string, body?: unknown) {
  const token = await accessToken(integration)
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (response.status === 404 || response.status === 410) return null // el evento ya no existe en Google
  if (!response.ok) throw new Error(`Google Calendar respondió ${response.status}`)
  return response.status === 204 ? {} : response.json()
}

/**
 * Deja Google igual que el sistema para una tarea: crea o actualiza el evento en el calendario de cada asignado
 * conectado, y lo borra donde ya no corresponde (desasignado o tarea borrada).
 */
export async function syncTask(taskId: string) {
  const [task] = await sql<TaskRow & { studio_id: string }>`
    select t.id, t.studio_id, t.title, t.kind, t.description, t.location, t.starts_at, t.ends_at, t.all_day, m.caption,
      coalesce(st.category in ('completado', 'finalizado'), false) as done
    from tasks t left join matters m on m.id = t.matter_id left join catalog_items st on st.id = t.status_id where t.id = ${taskId}`
  const wanted = task
    ? await sql<Integration>`
        select i.id, i.secret, i.expires_at, i.calendar_id from user_integrations i
        join assignments a on a.entity = 'task' and a.entity_id = ${taskId} and a.user_id = i.user_id
        where i.studio_id = ${task.studio_id} and i.provider = 'google_calendar' and i.status = 'ok'`
    : []
  const existing = await sql<Integration & { event_id: string }>`
    select i.id, i.secret, i.expires_at, i.calendar_id, e.event_id from calendar_events e join user_integrations i on i.id = e.integration_id where e.task_id = ${taskId}`

  for (const integration of wanted) {
    const mapped = existing.find((e) => e.id === integration.id)
    try {
      const body = eventFor(task!)
      const cal = encodeURIComponent(integration.calendar_id)
      const updated = mapped ? await callApi(integration, "PUT", `/calendars/${cal}/events/${encodeURIComponent(mapped.event_id)}`, body) : null
      if (!updated) {
        const created = await callApi(integration, "POST", `/calendars/${cal}/events`, body)
        await sql`insert into calendar_events (task_id, integration_id, event_id) values (${taskId}, ${integration.id}, ${created.id})
          on conflict (task_id, integration_id) do update set event_id = excluded.event_id`
      }
    } catch (error) {
      await sql`update user_integrations set status = 'error', last_error = ${error instanceof Error ? error.message : String(error)} where id = ${integration.id}`
    }
  }
  for (const stale of existing.filter((e) => !wanted.some((w) => w.id === e.id))) {
    await callApi(stale, "DELETE", `/calendars/${encodeURIComponent(stale.calendar_id)}/events/${encodeURIComponent(stale.event_id)}`).catch(() => {})
    await sql`delete from calendar_events where task_id = ${taskId} and integration_id = ${stale.id}`
  }
}

/** Borra los eventos de una tarea antes de borrarla (después ya no quedan los vínculos). */
export async function removeTaskEvents(taskId: string) {
  const existing = await sql<Integration & { event_id: string }>`
    select i.id, i.secret, i.expires_at, i.calendar_id, e.event_id from calendar_events e join user_integrations i on i.id = e.integration_id where e.task_id = ${taskId}`
  for (const e of existing) await callApi(e, "DELETE", `/calendars/${encodeURIComponent(e.calendar_id)}/events/${encodeURIComponent(e.event_id)}`).catch(() => {})
}

/** Al conectar: copia las tareas asignadas de los próximos 6 meses (y la última semana). */
export async function backfill(studioId: string, userId: string) {
  const tasks = await query<{ id: string }>(
    `select t.id from tasks t join assignments a on a.entity = 'task' and a.entity_id = t.id and a.user_id = $2
     where t.studio_id = $1 and t.starts_at > now() - interval '7 days' and t.starts_at < now() + interval '180 days' order by t.starts_at limit 500`,
    [studioId, userId])
  for (const t of tasks) await syncTask(t.id)
}

export async function disconnectCalendar(studioId: string, userId: string) {
  const [integration] = await sql<Integration>`select id, secret, expires_at, calendar_id from user_integrations where studio_id = ${studioId} and user_id = ${userId} and provider = 'google_calendar'`
  if (!integration) return
  // Se borra el calendario "Estudio" de su cuenta (lo creó esta app) y se revoca el acceso.
  await callApi(integration, "DELETE", `/calendars/${encodeURIComponent(integration.calendar_id)}`).catch(() => {})
  const stored = JSON.parse(open(integration.secret, integration.id)) as { refresh: string }
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(stored.refresh)}`, { method: "POST" }).catch(() => {})
  await sql`delete from user_integrations where id = ${integration.id}`
}

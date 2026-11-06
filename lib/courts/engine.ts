import "server-only"
import { randomBytes } from "node:crypto"
import { query, transaction, type Queryable } from "@/lib/sql"
import { open } from "@/lib/vault"
import { planOf } from "@/lib/plans"
import { notify } from "@/lib/notifications"
import { putStored, safeFileName, studioPrefix } from "@/lib/storage"
import { connectorOf } from "./portals"
import { InvalidCredentialsError, NotCalibratedError, type CourtCase } from "./types"
import { courtFileId, nextSyncDelayMinutes, stateChangeNotice } from "./rules"
import { analyzeMatter } from "@/lib/ai/deadlines"

type Connection = { id: string; studio_id: string; user_id: string; portal: string; username: string; secret: string; options: Record<string, string>; last_sync_at: Date | null; plan: string }
type Stats = { cases: number; created: number; linked: number; activities: number; files: number; skipped: number; touched?: Set<string> }

/** Estado de tribunal → ítem del catálogo (se crea la primera vez que el portal lo informa). */
export async function ensureCourtState(tx: Queryable, studioId: string, portal: string, code: string, label: string) {
  await tx.query(
    `insert into catalog_items (studio_id, kind, name, color, source, external_code, sort)
     values ($1, 'estado', $2, '#64748b', $3, $4, 1000)
     on conflict (studio_id, kind, source, external_code) where source is not null do nothing`,
    [studioId, label, portal, code],
  )
  const [row] = await tx.query<{ id: string }>(
    `select id from catalog_items where studio_id = $1 and kind = 'estado' and source = $2 and external_code = $3`, [studioId, portal, code])
  return row.id
}

async function findOrCreateCourt(tx: Queryable, studioId: string, name: string) {
  const [found] = await tx.query<{ id: string }>(`select id from courts where studio_id = $1 and lower(name) = lower($2) limit 1`, [studioId, name])
  if (found) return found.id
  const [row] = await tx.query<{ id: string }>(`insert into courts (studio_id, name) values ($1, $2) returning id`, [studioId, name])
  return row.id
}

async function applyCase(conn: Connection, c: CourtCase, stats: Stats) {
  await transaction(async (tx) => {
    const studioId = conn.studio_id
    const stateId = c.state ? await ensureCourtState(tx, studioId, conn.portal, c.state.code, c.state.label) : null
    const [fuero] = c.fuero ? await tx.query<{ id: string }>(`select id from catalog_items where studio_id = $1 and kind = 'fuero' and lower(name) = lower($2) limit 1`, [studioId, c.fuero]) : []
    const courtId = c.court ? await findOrCreateCourt(tx, studioId, c.court) : null

    // 1) La causa ya vinculada a este portal; 2) una cargada a mano con la misma numeración; 3) nueva.
    let [matter] = await tx.query<{ id: string; caption: string; estado_id: string | null; state_name: string | null; state_source: string | null }>(
      `select m.id, m.caption, m.estado_id, e.name as state_name, e.source as state_source from matters m left join catalog_items e on e.id = m.estado_id
       where m.studio_id = $1 and ((m.portal = $2 and m.external_id = $3) or ($4::text is not null and lower(m.full_number) = lower($4)))
       order by (m.portal = $2 and m.external_id = $3) desc nulls last limit 1`,
      [studioId, conn.portal, c.externalId, c.fullNumber ?? null],
    )
    const isNew = !matter
    if (isNew) {
      const [{ count }] = await tx.query<{ count: string }>(`select count(*) from matters where studio_id = $1 and not archived and deleted_at is null`, [studioId])
      if (Number(count) >= planOf(conn.plan).expedientes) { stats.skipped++; return }
      const [row] = await tx.query<{ id: string }>(
        `insert into matters (studio_id, caption, number, year, full_number, court_url, fuero_id, estado_id, court_id, portal, external_id, connection_id, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id`,
        [studioId, c.caption, c.number ?? null, c.year ?? null, c.fullNumber ?? null, c.url ?? null, fuero?.id ?? null, stateId, courtId, conn.portal, c.externalId, conn.id, conn.user_id],
      )
      await tx.query(`insert into assignments (studio_id, entity, entity_id, user_id) values ($1, 'matter', $2, $3) on conflict do nothing`, [studioId, row.id, conn.user_id])
      matter = { id: row.id, caption: c.caption, estado_id: stateId, state_name: null, state_source: null }
      stats.created++
    } else {
      await tx.query(
        `update matters set portal = $2, external_id = $3, connection_id = $4, court_url = coalesce(court_url, $5),
           full_number = coalesce(full_number, $6), court_id = coalesce(court_id, $7), fuero_id = coalesce(fuero_id, $8),
           estado_id = coalesce($9, estado_id), updated_at = now()
         where id = $1`,
        [matter.id, conn.portal, c.externalId, conn.id, c.url ?? null, c.fullNumber ?? null, courtId, fuero?.id ?? null, stateId],
      )
      if (stateId) {
        const text = stateChangeNotice(matter.estado_id ? { id: matter.estado_id, name: matter.state_name ?? "", source: matter.state_source } : null, stateId, c.state!.label, matter.caption)
        if (text) await notify(tx, studioId, await assignees(tx, matter.id), text, `/expedientes/${matter.id}`)
      }
      stats.linked++
    }

    let fresh = 0
    for (const a of c.activities) {
      const inserted = await tx.query(
        `insert into matter_activities (matter_id, occurred_at, title, body, source, external_id) values ($1, $2, $3, $4, $5, $6)
         on conflict (matter_id, source, external_id) where external_id is not null do nothing returning id`,
        [matter.id, a.date, a.title.slice(0, 300), a.body ?? null, conn.portal, a.externalId],
      )
      if (inserted.length) fresh++
      for (const f of a.files ?? []) {
        const externalId = courtFileId(conn.portal, c.externalId, f.externalId)
        if ((await tx.query(`select 1 from documents where studio_id = $1 and source = 'tribunal' and external_id = $2`, [studioId, externalId])).length) continue
        const data = await f.download()
        const [{ used }] = await tx.query<{ used: string }>(`select coalesce(sum(size), 0) as used from documents where studio_id = $1 and source = 'tribunal'`, [studioId])
        if (Number(used) + data.length > planOf(conn.plan).courtFilesMb * 1024 * 1024) { stats.skipped++; continue }
        const pathname = `${studioPrefix(studioId)}${randomBytes(12).toString("hex")}/${safeFileName(f.name)}`
        await putStored(pathname, data, f.contentType)
        await tx.query(
          `insert into documents (studio_id, name, pathname, size, content_type, entity, entity_id, source, external_id) values ($1, $2, $3, $4, $5, 'matter', $6, 'tribunal', $7)`,
          [studioId, f.name.slice(0, 255), pathname, data.length, f.contentType, matter.id, externalId],
        )
        stats.files++
      }
    }
    stats.activities += fresh
    if (fresh) {
      stats.touched?.add(matter.id)
      await tx.query(`update matters set last_activity_at = (select max(occurred_at) from matter_activities where matter_id = $1) where id = $1`, [matter.id])
      // En el alta inicial no se avisa cada actuación vieja: solo las novedades de causas que ya seguíamos.
      if (!isNew) await notify(tx, studioId, await assignees(tx, matter.id), `${fresh} novedad${fresh === 1 ? "" : "es"} en «${matter.caption}»`, `/expedientes/${matter.id}`)
    }
  })
}

const assignees = async (tx: Queryable, matterId: string) =>
  (await tx.query<{ user_id: string }>(`select user_id from assignments where entity = 'matter' and entity_id = $1`, [matterId])).map((r) => r.user_id)

/**
 * Sincroniza una conexión. Toma la conexión con un update atómico (dos procesos no la corren a la vez;
 * si uno muere a mitad, vuelve a estar disponible a los 30 minutos).
 */
export async function runConnection(connectionId: string, extra: { browser?: () => Promise<unknown> } = {}) {
  const [conn] = await query<Connection>(
    `update court_connections c set status = 'sincronizando', next_sync_at = now() + interval '30 minutes'
     from studios s
     where c.id = $1 and s.id = c.studio_id and s.deleted_at is null and c.status <> 'credenciales'
       and (c.status <> 'sincronizando' or c.next_sync_at <= now())
     returning c.id, c.studio_id, c.user_id, c.portal, c.username, c.secret, c.options, c.last_sync_at, s.plan`,
    [connectionId],
  )
  if (!conn) return null
  const [run] = await query<{ id: string }>(`insert into sync_runs (connection_id) values ($1) returning id`, [conn.id])
  const stats: Stats = { cases: 0, created: 0, linked: 0, activities: 0, files: 0, skipped: 0, touched: new Set() }
  const connector = connectorOf(conn.portal)
  try {
    if (!connector) throw new Error(`Portal desconocido: ${conn.portal}`)
    const credentials = { username: conn.username, password: open(conn.secret, conn.id), options: conn.options ?? {} }
    for await (const c of connector.sync({ credentials, since: conn.last_sync_at, browser: extra.browser, log: (m) => console.log(`[${conn.portal}] ${m}`) })) {
      stats.cases++
      await applyCase(conn, c, stats)
    }
    await query(
      `update court_connections set status = 'ok', last_error = null, last_sync_at = now(), next_sync_at = now() + make_interval(mins => $2) where id = $1`,
      [conn.id, nextSyncDelayMinutes("ok")],
    )
    const { touched, ...summary } = stats
    await query(`update sync_runs set status = 'ok', finished_at = now(), stats = $2 where id = $1`, [run.id, JSON.stringify(summary)])
    // El agente de vencimientos lee las actuaciones nuevas y deja propuestas (si está activo y hay créditos).
    for (const matterId of touched ?? []) await analyzeMatter(conn.studio_id, matterId, null).catch((e) => console.error("[vencimientos]", e))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const badCredentials = error instanceof InvalidCredentialsError
    const delay = nextSyncDelayMinutes(error instanceof NotCalibratedError ? "not-calibrated" : "error")
    await query(
      `update court_connections set status = $2, last_error = $3, next_sync_at = now() + make_interval(mins => $4) where id = $1`,
      [conn.id, badCredentials ? "credenciales" : "error", message.slice(0, 1000), delay],
    )
    await query(`update sync_runs set status = 'error', finished_at = now(), error = $2, stats = $3 where id = $1`, [run.id, message.slice(0, 2000), JSON.stringify({ ...stats, touched: undefined })])
    const [prev] = await query<{ status: string }>(
      `select status from sync_runs where connection_id = $1 and id <> $2 order by started_at desc limit 1`, [conn.id, run.id])
    if (prev?.status !== "error") {
      await notify({ query }, conn.studio_id, [conn.user_id],
        badCredentials ? `${connector?.label ?? conn.portal}: el portal rechazó tu usuario o contraseña. Actualizalos en Integraciones.` : `${connector?.label ?? conn.portal}: no pudimos sincronizar.`,
        "/integraciones", message)
    }
  }
  const { touched: _t, ...result } = stats
  return result
}

/** Para el worker: conexiones que tocan ahora. */
export async function dueConnections(limit = 10) {
  return query<{ id: string; portal: string }>(
    `select id, portal from court_connections where next_sync_at <= now() and status <> 'credenciales' order by next_sync_at limit $1`, [limit])
}

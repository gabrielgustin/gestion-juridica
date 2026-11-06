import "server-only"
import { randomBytes } from "node:crypto"
import type Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { query, sql } from "@/lib/sql"
import { localToIso, ymdOf } from "@/lib/dates"
import { OVERDUE_SQL, TASK_KINDS } from "@/lib/tasks"
import { putStored, safeFileName, studioPrefix } from "@/lib/storage"
import { hasRoomFor } from "@/lib/documents"
import { syncTask } from "@/lib/integrations/google-calendar"

// Herramientas de Mike. Todas filtran por el estudio de quien pregunta: el modelo nunca ve datos de otro estudio.

export type ToolCtx = { studioId: string; userId: string; plan: string }

const uuid = z.string().regex(/^[0-9a-f-]{36}$/i, "id inválido")
const dmy = (d: Date | null) => (d ? ymdOf(d).split("-").reverse().join("/") : null)

const schemas = {
  buscar_expedientes: z.object({
    texto: z.string().max(200).optional(),
    solo_mios: z.boolean().optional(),
    incluir_archivados: z.boolean().optional(),
  }),
  ver_expediente: z.object({ expediente_id: uuid }),
  agenda: z.object({ dias: z.number().int().min(1).max(365).optional(), solo_mios: z.boolean().optional(), solo_retrasadas: z.boolean().optional() }),
  buscar_clientes: z.object({ texto: z.string().min(1).max(200) }),
  crear_tarea: z.object({
    titulo: z.string().min(1).max(300),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    hora: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    tipo: z.enum(TASK_KINDS.map((k) => k.id) as ["tarea", "evento", "audiencia", "vencimiento"]),
    expediente_id: uuid.optional(),
    descripcion: z.string().max(5000).optional(),
  }),
  guardar_escrito: z.object({ titulo: z.string().min(1).max(200), contenido: z.string().min(1).max(200_000), expediente_id: uuid.optional() }),
}
export type ToolName = keyof typeof schemas

export const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "buscar_expedientes",
    description: "Busca expedientes del estudio por carátula, número, numeración o nombre de cliente. Sin texto devuelve los más recientes. Devuelve hasta 25.",
    input_schema: {
      type: "object",
      properties: {
        texto: { type: "string", description: "Texto a buscar" },
        solo_mios: { type: "boolean", description: "Solo los asignados a quien pregunta" },
        incluir_archivados: { type: "boolean" },
      },
    },
  },
  {
    name: "ver_expediente",
    description: "Ficha completa de un expediente: datos, clientes, asignados, últimas actuaciones, tareas pendientes y documentos.",
    input_schema: { type: "object", properties: { expediente_id: { type: "string" } }, required: ["expediente_id"] },
  },
  {
    name: "agenda",
    description: "Tareas, audiencias y vencimientos de los próximos días (por defecto 30), o solo las retrasadas.",
    input_schema: {
      type: "object",
      properties: { dias: { type: "integer" }, solo_mios: { type: "boolean" }, solo_retrasadas: { type: "boolean" } },
    },
  },
  {
    name: "buscar_clientes",
    description: "Busca clientes por nombre, email o CUIT/DNI.",
    input_schema: { type: "object", properties: { texto: { type: "string" } }, required: ["texto"] },
  },
  {
    name: "crear_tarea",
    description: "Agenda una tarea, evento, audiencia o vencimiento. Usala solo si el usuario lo pidió o lo confirmó. Queda asignada a quien pregunta.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        fecha: { type: "string", description: "AAAA-MM-DD" },
        hora: { type: "string", description: "HH:MM (opcional; sin hora = todo el día)" },
        tipo: { type: "string", enum: TASK_KINDS.map((k) => k.id) },
        expediente_id: { type: "string" },
        descripcion: { type: "string" },
      },
      required: ["titulo", "fecha", "tipo"],
    },
  },
  {
    name: "guardar_escrito",
    description: "Guarda un escrito redactado como documento del estudio (abrible en Word), opcionalmente en la carpeta de un expediente. Usala cuando el usuario pida guardarlo.",
    input_schema: {
      type: "object",
      properties: { titulo: { type: "string" }, contenido: { type: "string", description: "Texto completo del escrito" }, expediente_id: { type: "string" } },
      required: ["titulo", "contenido"],
    },
  },
]

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

const handlers: { [K in ToolName]: (input: z.infer<(typeof schemas)[K]>, ctx: ToolCtx) => Promise<unknown> } = {
  async buscar_expedientes(input, ctx) {
    const where = ["m.studio_id = $1", "m.deleted_at is null"]
    const args: unknown[] = [ctx.studioId]
    if (!input.incluir_archivados) where.push("not m.archived")
    if (input.solo_mios) { args.push(ctx.userId); where.push(`exists (select 1 from assignments a where a.entity = 'matter' and a.entity_id = m.id and a.user_id = $${args.length})`) }
    if (input.texto) {
      args.push(`%${input.texto}%`)
      const p = `$${args.length}`
      where.push(`(m.caption ilike ${p} or m.number ilike ${p} or m.full_number ilike ${p} or exists (select 1 from matter_clients mc join clients c on c.id = mc.client_id where mc.matter_id = m.id and c.name ilike ${p}))`)
    }
    const rows = await query<Record<string, any>>(
      `select m.id, m.caption, concat_ws('/', m.number, m.year::text) as numero, m.full_number, e.name as estado, ct.name as juzgado, m.archived, m.last_activity_at
       from matters m left join catalog_items e on e.id = m.estado_id left join courts ct on ct.id = m.court_id
       where ${where.join(" and ")} order by m.updated_at desc limit 25`, args)
    return rows.map((r) => ({ ...r, last_activity_at: dmy(r.last_activity_at) }))
  },

  async ver_expediente({ expediente_id }, ctx) {
    const [m] = await sql<Record<string, any>>`
      select m.id, m.caption, m.number, m.year, m.full_number, m.court_url, m.notes, m.archived, m.portal,
        e.name as estado, s.name as etapa, f.name as fuero, p.name as parte, ct.name as juzgado
      from matters m left join catalog_items e on e.id = m.estado_id left join catalog_items s on s.id = m.etapa_id
      left join catalog_items f on f.id = m.fuero_id left join catalog_items p on p.id = m.parte_id left join courts ct on ct.id = m.court_id
      where m.id = ${expediente_id} and m.studio_id = ${ctx.studioId} and m.deleted_at is null`
    if (!m) return { error: "No existe ese expediente en el estudio." }
    const [clientes, asignados, actuaciones, tareas, documentos] = await Promise.all([
      sql`select c.name, c.email, c.phone from matter_clients mc join clients c on c.id = mc.client_id where mc.matter_id = ${m.id}`,
      sql`select u.name from assignments a join "user" u on u.id = a.user_id where a.entity = 'matter' and a.entity_id = ${m.id}`,
      sql<{ occurred_at: Date; title: string; body: string | null; source: string }>`
        select occurred_at, title, body, source from matter_activities where matter_id = ${m.id} order by occurred_at desc limit 30`,
      sql<{ title: string; kind: string; starts_at: Date; estado: string | null }>`
        select t.title, t.kind, t.starts_at, st.name as estado from tasks t left join catalog_items st on st.id = t.status_id
        where t.matter_id = ${m.id} and coalesce(st.category, '') not in ('completado', 'finalizado') order by t.starts_at limit 30`,
      sql`select name, is_writ, created_at from documents where entity = 'matter' and entity_id = ${m.id} and deleted_at is null order by created_at desc limit 30`,
    ])
    return {
      ...m, clientes, asignados: asignados.map((a) => a.name),
      actuaciones: actuaciones.map((a) => ({ fecha: dmy(a.occurred_at), titulo: a.title, detalle: a.body?.slice(0, 2000), origen: a.source })),
      tareas_pendientes: tareas.map((t) => ({ ...t, starts_at: dmy(t.starts_at) })),
      documentos,
    }
  },

  async agenda(input, ctx) {
    const args: unknown[] = [ctx.studioId]
    const where = ["t.studio_id = $1"]
    if (input.solo_retrasadas) where.push(OVERDUE_SQL)
    else { args.push(input.dias ?? 30); where.push(`t.starts_at >= now() - interval '1 day' and t.starts_at < now() + make_interval(days => $${args.length})`, "coalesce(st.category, '') not in ('completado', 'finalizado')") }
    if (input.solo_mios) { args.push(ctx.userId); where.push(`exists (select 1 from assignments a where a.entity = 'task' and a.entity_id = t.id and a.user_id = $${args.length})`) }
    const rows = await query<Record<string, any>>(
      `select t.id, t.title, t.kind, t.starts_at, t.all_day, st.name as estado, m.caption as expediente
       from tasks t left join catalog_items st on st.id = t.status_id left join matters m on m.id = t.matter_id
       where ${where.join(" and ")} order by t.starts_at limit 50`, args)
    return rows.map((r) => ({ ...r, starts_at: new Date(r.starts_at).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }) }))
  },

  async buscar_clientes({ texto }, ctx) {
    return sql`
      select c.id, c.name, c.email, c.phone, c.tax_id, (select count(*) from matter_clients mc where mc.client_id = c.id) as expedientes
      from clients c where c.studio_id = ${ctx.studioId} and (c.name ilike ${`%${texto}%`} or c.email ilike ${`%${texto}%`} or c.tax_id ilike ${`%${texto}%`})
      order by c.name limit 20`
  },

  async crear_tarea(input, ctx) {
    const startsAt = localToIso(input.fecha, input.hora ?? null)
    if (!startsAt) return { error: "Fecha u hora inválida." }
    if (input.expediente_id && !(await sql`select 1 from matters where id = ${input.expediente_id} and studio_id = ${ctx.studioId}`).length)
      return { error: "No existe ese expediente en el estudio." }
    const [calendar] = await sql<{ id: string }>`select id from catalog_items where studio_id = ${ctx.studioId} and kind = 'calendario' and active order by sort limit 1`
    const [status] = await sql<{ id: string }>`select id from catalog_items where studio_id = ${ctx.studioId} and kind = 'estado_tarea' and category = 'inactivo' and active order by sort limit 1`
    const [task] = await sql<{ id: string }>`
      insert into tasks (studio_id, calendar_id, matter_id, kind, title, description, starts_at, all_day, status_id, remind_minutes, created_by)
      values (${ctx.studioId}, ${calendar?.id ?? null}, ${input.expediente_id ?? null}, ${input.tipo}, ${input.titulo}, ${input.descripcion ?? null},
        ${startsAt}, ${!input.hora}, ${status?.id ?? null}, ${input.tipo === "vencimiento" ? 60 * 24 : null}, ${ctx.userId}) returning id`
    await sql`insert into assignments (studio_id, entity, entity_id, user_id) values (${ctx.studioId}, 'task', ${task.id}, ${ctx.userId})`
    await syncTask(task.id).catch((e) => console.error("[google-calendar]", e))
    return { ok: true, link: `/calendario/${task.id}` }
  },

  async guardar_escrito(input, ctx) {
    if (input.expediente_id && !(await sql`select 1 from matters where id = ${input.expediente_id} and studio_id = ${ctx.studioId}`).length)
      return { error: "No existe ese expediente en el estudio." }
    // shortcut: el escrito se guarda como HTML con extensión .doc (Word lo abre y lo edita); usar una librería .docx si hace falta formato fino.
    const html = `<html><head><meta charset="utf-8"><title>${escapeHtml(input.titulo)}</title></head><body style="font-family:'Times New Roman';font-size:12pt;line-height:1.5">${
      input.contenido.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("")}</body></html>`
    const data = Buffer.from(html, "utf8")
    if (!(await hasRoomFor(ctx.studioId, ctx.plan, data.length))) return { error: "No hay espacio en el plan para guardar el escrito." }
    const name = `${input.titulo.slice(0, 150)}.doc`
    const pathname = `${studioPrefix(ctx.studioId)}${randomBytes(12).toString("hex")}/${safeFileName(name)}`
    await putStored(pathname, data, "application/msword")
    const [doc] = await sql<{ id: string }>`
      insert into documents (studio_id, name, pathname, size, content_type, entity, entity_id, is_writ, uploaded_by)
      values (${ctx.studioId}, ${name}, ${pathname}, ${data.length}, 'application/msword', ${input.expediente_id ? "matter" : null}, ${input.expediente_id ?? null}, true, ${ctx.userId})
      returning id`
    return { ok: true, documento: name, link: `/api/documentos/${doc.id}` }
  },
}

/** Ejecuta una herramienta validando su entrada; los errores vuelven como texto para que el modelo los vea. */
export async function runTool(name: string, input: unknown, ctx: ToolCtx): Promise<{ content: string; isError: boolean }> {
  if (!(name in schemas)) return { content: `Herramienta desconocida: ${name}`, isError: true }
  const parsed = schemas[name as ToolName].safeParse(input)
  if (!parsed.success) return { content: `Entrada inválida: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`, isError: true }
  try {
    const result = await (handlers[name as ToolName] as (i: unknown, c: ToolCtx) => Promise<unknown>)(parsed.data, ctx)
    const isError = Boolean(result && typeof result === "object" && "error" in result)
    return { content: JSON.stringify(result), isError }
  } catch (error) {
    console.error(`[mike] herramienta ${name} falló`, error)
    return { content: "La herramienta falló. Probá de nuevo o con otros datos.", isError: true }
  }
}

export const WRITE_TOOLS = new Set<string>(["crear_tarea", "guardar_escrito"])

"use server"

import { revalidatePath } from "next/cache"
import { after } from "next/server"
import { syncTask } from "@/lib/integrations/google-calendar"
import { redirect } from "next/navigation"
import Anthropic from "@anthropic-ai/sdk"
import { getMember, requireAdmin } from "@/lib/session"
import { sql } from "@/lib/sql"
import { localToIso } from "@/lib/dates"
import { converse, ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, type Attachment } from "@/lib/ai/mike"
import { aiBlocker, isPlatformAdmin } from "@/lib/ai/state"
import { analyzeMatter } from "@/lib/ai/deadlines"
import type { ActionResult } from "@/app/(app)/configuracion/actions"
import { deleteStored, readStored } from "@/lib/storage"
import { isStudioPath } from "@/lib/storage-paths"

/** Envía un mensaje a Mike (con adjuntos opcionales). Crea la conversación si no existe. */
export async function sendMessage(form: FormData): Promise<{ conversationId?: string; error?: string }> {
  const { studio, user } = await getMember()
  const text = String(form.get("text") ?? "").trim().slice(0, 20_000)
  if (!text) return { error: "Escribí tu pregunta." }
  const blocker = await aiBlocker(studio.id)
  if (blocker) return { error: blocker }

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0)
  const blobs = form.getAll("blobs").map((b) => { try { return JSON.parse(String(b)) as { pathname: string; name: string; type: string } } catch { return null } })
  if (files.length + blobs.length > MAX_ATTACHMENTS) return { error: `Hasta ${MAX_ATTACHMENTS} archivos por mensaje.` }
  const attachments: Attachment[] = []
  for (const f of files) attachments.push({ name: f.name, type: f.type, data: Buffer.from(await f.arrayBuffer()) })
  // Adjuntos que el navegador subió a Blob: se leen, se pasan a Mike y se borran.
  for (const b of blobs) {
    if (!b || !isStudioPath(b.pathname, studio.id)) return { error: "Adjunto inválido." }
    const stream = await readStored(b.pathname)
    if (!stream) return { error: `No encontramos ${b.name}.` }
    attachments.push({ name: String(b.name).slice(0, 200), type: b.type, data: Buffer.from(await new Response(stream).arrayBuffer()) })
    await deleteStored(b.pathname).catch(() => {})
  }
  for (const a of attachments) {
    if (!ATTACHMENT_TYPES.includes(a.type)) return { error: `${a.name}: solo PDF o imágenes.` }
    if (a.data.length > MAX_ATTACHMENT_BYTES) return { error: `${a.name} pesa más de 10 MB.` }
  }

  let conversationId = String(form.get("conversationId") ?? "")
  if (conversationId) {
    const [own] = await sql`select 1 from ai_conversations where id = ${conversationId} and user_id = ${user.id} and studio_id = ${studio.id}`
    if (!own) return { error: "No encontramos esa conversación." }
  } else {
    const [row] = await sql<{ id: string }>`insert into ai_conversations (studio_id, user_id, title) values (${studio.id}, ${user.id}, ${text.slice(0, 80)}) returning id`
    conversationId = row.id
  }

  try {
    await converse({ conversationId, studio, userId: user.id, text, attachments })
  } catch (error) {
    console.error("[mike]", error)
    const message = error instanceof Anthropic.RateLimitError ? "Hay mucha demanda en este momento. Probá en un minuto."
      : error instanceof Anthropic.APIError ? "Mike no pudo responder ahora. Probá de nuevo en un rato."
      : "Algo falló al responder. Probá de nuevo."
    return { conversationId, error: message }
  } finally {
    revalidatePath("/mike")
  }
  return { conversationId }
}

export async function deleteConversation(id: string) {
  const { studio, user } = await getMember()
  await sql`delete from ai_conversations where id = ${id} and user_id = ${user.id} and studio_id = ${studio.id}`
  revalidatePath("/mike")
  redirect("/mike")
}

export async function saveAiSettings(_: ActionResult, form: FormData): Promise<ActionResult> {
  const { studio } = await requireAdmin()
  const identity = String(form.get("identity") ?? "").trim().slice(0, 10_000) || null
  const watch = String(form.get("watch") ?? "").trim().slice(0, 5_000) || null
  await sql`insert into ai_settings (studio_id, identity, watch) values (${studio.id}, ${identity}, ${watch})
    on conflict (studio_id) do update set identity = excluded.identity, watch = excluded.watch`
  revalidatePath("/agentes")
  return { ok: "Guardado." }
}

export async function setAgentEnabled(agent: "mike" | "vencimientos", enabled: boolean) {
  const { studio } = await requireAdmin()
  if (agent === "mike") await sql`insert into ai_settings (studio_id, enabled) values (${studio.id}, ${enabled}) on conflict (studio_id) do update set enabled = excluded.enabled`
  else await sql`insert into ai_settings (studio_id, deadline_agent) values (${studio.id}, ${enabled}) on conflict (studio_id) do update set deadline_agent = excluded.deadline_agent`
  revalidatePath("/agentes")
}

export async function addKnowledge(_: ActionResult, form: FormData): Promise<ActionResult> {
  const { studio } = await requireAdmin()
  const kind = form.get("kind") === "jurisprudencia" ? "jurisprudencia" : "conocimiento"
  const title = String(form.get("title") ?? "").trim().slice(0, 200)
  let content = String(form.get("content") ?? "").trim()
  const file = form.get("file")
  if (!content && file instanceof File && file.size > 0) {
    if (!["text/plain", "text/markdown", "text/csv"].includes(file.type) && !file.name.endsWith(".md")) return { error: "Por ahora se cargan textos (.txt o .md) o se pega el contenido." }
    content = (await file.text()).trim()
  }
  if (!title || !content) return { error: "Poné un título y el contenido." }
  await sql`insert into ai_knowledge (studio_id, kind, title, content) values (${studio.id}, ${kind}, ${title}, ${content.slice(0, 200_000)})`
  revalidatePath("/agentes/mike")
  return { ok: "Agregado a la base de conocimiento." }
}

export async function deleteKnowledge(id: string) {
  const { studio } = await requireAdmin()
  await sql`delete from ai_knowledge where id = ${id} and studio_id = ${studio.id}`
  revalidatePath("/agentes/mike")
}

/** Carga de créditos: solo administradores de la plataforma (quien le vende el sistema al estudio). */
export async function rechargeCredits(_: ActionResult, form: FormData): Promise<ActionResult> {
  const { studio, user } = await getMember()
  if (!isPlatformAdmin(user.email)) return { error: "Solo el proveedor del sistema puede cargar créditos." }
  const amount = Number(String(form.get("amount") ?? "").replace(",", "."))
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) return { error: "Monto inválido." }
  const detail = String(form.get("detail") ?? "").trim().slice(0, 200) || "Recarga de créditos"
  await sql`insert into ai_ledger (studio_id, user_id, kind, amount, detail) values (${studio.id}, ${user.id}, 'recarga', ${amount}, ${detail})`
  revalidatePath("/configuracion/uso")
  return { ok: `Se cargaron $${amount.toLocaleString("es-AR")}.` }
}

async function ownSuggestion(id: string) {
  const { studio, user } = await getMember()
  const [s] = await sql<{ id: string; matter_id: string; title: string; due_date: string; rationale: string | null; status: string }>`
    select id, matter_id, title, to_char(due_date, 'YYYY-MM-DD') as due_date, rationale, status from ai_suggestions where id = ${id} and studio_id = ${studio.id}`
  // shortcut: estos dos casos (propuesta borrada o ya resuelta por otro) llegan al usuario como error genérico en producción.
  if (!s) throw new Error("No encontramos esa propuesta.")
  if (s.status !== "pendiente") throw new Error("Esa propuesta ya se resolvió.")
  return { s, studio, user }
}

/** Acepta una propuesta: crea el vencimiento (todo el día, recordatorio 1 día antes) asignado a los del expediente. */
export async function acceptSuggestion(id: string, dueDate?: string) {
  const { s, studio, user } = await ownSuggestion(id)
  const date = dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : s.due_date
  const startsAt = localToIso(date)
  if (!startsAt) return { error: "Fecha inválida." }
  const [calendar] = await sql<{ id: string }>`select id from catalog_items where studio_id = ${studio.id} and kind = 'calendario' and active order by sort limit 1`
  const [status] = await sql<{ id: string }>`select id from catalog_items where studio_id = ${studio.id} and kind = 'estado_tarea' and category = 'inactivo' and active order by sort limit 1`
  const [task] = await sql<{ id: string }>`
    insert into tasks (studio_id, calendar_id, matter_id, kind, title, description, starts_at, all_day, status_id, remind_minutes, created_by)
    values (${studio.id}, ${calendar?.id ?? null}, ${s.matter_id}, 'vencimiento', ${s.title}, ${s.rationale}, ${startsAt}, true, ${status?.id ?? null}, ${60 * 24}, ${user.id}) returning id`
  await sql`insert into assignments (studio_id, entity, entity_id, user_id)
    select ${studio.id}, 'task', ${task.id}, user_id from assignments where entity = 'matter' and entity_id = ${s.matter_id}
    union select ${studio.id}, 'task', ${task.id}, ${user.id} on conflict do nothing`
  await sql`update ai_suggestions set status = 'aceptada', task_id = ${task.id} where id = ${id}`
  after(() => syncTask(task.id).catch((e) => console.error("[google-calendar]", e)))
  revalidatePath("/agentes/vencimientos")
  revalidatePath(`/expedientes/${s.matter_id}`)
  revalidatePath("/calendario")
}

export async function dismissSuggestion(id: string) {
  const { s } = await ownSuggestion(id)
  await sql`update ai_suggestions set status = 'descartada' where id = ${id}`
  revalidatePath("/agentes/vencimientos")
  revalidatePath(`/expedientes/${s.matter_id}`)
}

/** "Buscar plazos" a mano en un expediente (por ejemplo, con actuaciones cargadas a mano). */
export async function analyzeMatterNow(matterId: string): Promise<{ error?: string; ok?: string }> {
  const { studio, user } = await getMember()
  const [own] = await sql`select 1 from matters where id = ${matterId} and studio_id = ${studio.id}`
  if (!own) return { error: "No encontramos ese expediente." }
  const blocker = await aiBlocker(studio.id)
  if (blocker) return { error: blocker }
  const n = await analyzeMatter(studio.id, matterId, user.id)
  revalidatePath(`/expedientes/${matterId}`)
  return { ok: n ? `${n} vencimiento(s) propuesto(s).` : "No se detectaron plazos nuevos." }
}

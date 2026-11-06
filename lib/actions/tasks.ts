"use server"

import { revalidatePath } from "next/cache"
import { after } from "next/server"
import { removeTaskEvents, syncTask } from "@/lib/integrations/google-calendar"
import { redirect } from "next/navigation"
import { getMember } from "@/lib/session"
import { sql, transaction } from "@/lib/sql"
import { formIds, formText, setLinks } from "@/lib/entities"
import { localToIso } from "@/lib/dates"
import { REMINDERS, TASK_KINDS } from "@/lib/tasks"
import { notify } from "@/lib/notifications"
import type { ActionResult } from "@/app/(app)/configuracion/actions"

function refresh(id?: string, matterId?: string | null) {
  revalidatePath("/calendario")
  if (id) revalidatePath(`/calendario/${id}`)
  if (matterId) revalidatePath(`/expedientes/${matterId}`)
  revalidatePath("/", "layout") // contador de notificaciones
}

export async function saveTask(id: string | null, _: ActionResult, form: FormData): Promise<ActionResult> {
  const { studio, user } = await getMember()
  const title = formText(form, "title", 300)
  if (!title) return { error: "Poné un título." }
  const kind = String(form.get("kind") ?? "tarea")
  if (!TASK_KINDS.some((k) => k.id === kind)) return { error: "Tipo inválido." }
  const allDay = form.get("all_day") === "1"
  const startsAt = localToIso(String(form.get("start_date") ?? ""), allDay ? null : formText(form, "start_time", 5))
  if (!startsAt) return { error: "Revisá la fecha y la hora de inicio." }
  const endDate = formText(form, "end_date", 10)
  const endsAt = endDate ? localToIso(endDate, allDay ? "23:59" : formText(form, "end_time", 5)) : null
  if (endDate && !endsAt) return { error: "Revisá la fecha y la hora de fin." }
  if (endsAt && endsAt < startsAt) return { error: "El fin no puede ser antes del inicio." }
  const remindText = formText(form, "remind_minutes", 10)
  const remind = remindText === null ? null : Number(remindText)
  if (!REMINDERS.some((r) => r.minutes === remind)) return { error: "Recordatorio inválido." }

  const assignees = formIds(form, "assignees")
  let taskId = id
  let matterId: string | null = null
  try {
    taskId = await transaction(async (tx) => {
      const check = async (sqlText: string, value: string | null, message: string) => {
        if (!value) return null
        if (!(await tx.query(sqlText, [value, studio.id])).length) throw new Error(message)
        return value
      }
      const calendarId = await check(`select 1 from catalog_items where id = $1 and studio_id = $2 and kind = 'calendario'`, formText(form, "calendar_id"), "El calendario ya no existe.")
      const statusId = await check(`select 1 from catalog_items where id = $1 and studio_id = $2 and kind = 'estado_tarea'`, formText(form, "status_id"), "El estado ya no existe.")
      matterId = await check(`select 1 from matters where id = $1 and studio_id = $2`, formText(form, "matter_id"), "El expediente ya no existe.")
      const values = [calendarId, matterId, kind, title, formText(form, "description", 10000), formText(form, "location", 300), startsAt, endsAt, allDay, statusId, remind]

      let previous: string[] = []
      let savedId = id
      if (id) {
        // Si cambia la fecha o el recordatorio, el recordatorio se vuelve a programar.
        const rows = await tx.query(
          `update tasks set calendar_id = $1, matter_id = $2, kind = $3, title = $4, description = $5, location = $6, starts_at = $7,
             ends_at = $8, all_day = $9, status_id = $10,
             reminded_at = case when starts_at is distinct from $7 or remind_minutes is distinct from $11 then null else reminded_at end,
             remind_minutes = $11, updated_at = now()
           where id = $12 and studio_id = $13 returning id`,
          [...values, id, studio.id],
        )
        if (!rows.length) throw new Error("No encontramos esa tarea.")
        previous = (await tx.query<{ user_id: string }>(`select user_id from assignments where entity = 'task' and entity_id = $1`, [id])).map((r) => r.user_id)
      } else {
        const [row] = await tx.query<{ id: string }>(
          `insert into tasks (calendar_id, matter_id, kind, title, description, location, starts_at, ends_at, all_day, status_id, remind_minutes, studio_id, created_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id`,
          [...values, studio.id, user.id],
        )
        savedId = row.id
      }
      await setLinks(tx, studio.id, "task", savedId!, assignees, formIds(form, "tags"))
      const added = assignees.filter((u) => u !== user.id && !previous.includes(u))
      await notify(tx, studio.id, added, `${user.name} te asignó: ${title}`, `/calendario/${savedId}`)
      return savedId!
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo guardar." }
  }

  // Google Calendar de los asignados, sin demorar la respuesta.
  after(() => syncTask(taskId!).catch((e) => console.error("[google-calendar]", e)))
  refresh(taskId!, matterId)
  if (!id) redirect(`/calendario/${taskId}`)
  return { ok: "Guardado." }
}

/** Cambia el estado (Kanban). `null` la deja sin estado (alerta). */
export async function setTaskStatus(id: string, statusId: string | null) {
  const { studio } = await getMember()
  if (statusId) {
    const [ok] = await sql`select 1 from catalog_items where id = ${statusId} and studio_id = ${studio.id} and kind = 'estado_tarea'`
    if (!ok) throw new Error("Estado inválido.")
  }
  await sql`update tasks set status_id = ${statusId}, updated_at = now() where id = ${id} and studio_id = ${studio.id}`
  after(() => syncTask(id).catch((e) => console.error("[google-calendar]", e)))
  refresh(id)
}

export async function deleteTask(id: string) {
  const { studio } = await getMember()
  if ((await sql`select 1 from tasks where id = ${id} and studio_id = ${studio.id}`).length) await removeTaskEvents(id).catch(() => {})
  const [row] = await sql<{ matter_id: string | null }>`delete from tasks where id = ${id} and studio_id = ${studio.id} returning matter_id`
  await sql`update documents set entity = null, entity_id = null where entity = 'task' and entity_id = ${id}`
  await sql`delete from assignments where entity = 'task' and entity_id = ${id}`
  await sql`delete from taggings where entity = 'task' and entity_id = ${id}`
  refresh(undefined, row?.matter_id)
  redirect("/calendario")
}

export async function markAllNotificationsRead() {
  const { user, studio } = await getMember()
  await sql`update notifications set read_at = now() where user_id = ${user.id} and studio_id = ${studio.id} and read_at is null`
  revalidatePath("/", "layout")
}

import { getMember } from "@/lib/session"
import { sql } from "@/lib/sql"
import { catalogOptions, memberOptions, type Links, type Option } from "@/lib/entities"
import { hmOf, todayYmd, ymdOf } from "@/lib/dates"
import { REMINDERS, TASK_KINDS } from "@/lib/tasks"
import { saveTask } from "@/lib/actions/tasks"
import { ActionForm } from "@/components/action-form"
import { MultiPick } from "@/components/multi-pick"

type Task = Record<string, any>

export async function TaskForm({ task, links, defaults }: { task?: Task; links?: Links; defaults?: { date?: string; matterId?: string } }) {
  const { studio, user } = await getMember()
  const [calendars, statuses, tags, members, matters] = await Promise.all([
    catalogOptions(studio.id, "calendario"),
    sql<Option & { category: string }>`select id, name, color, category from catalog_items where studio_id = ${studio.id} and kind = 'estado_tarea' and active order by sort, name`,
    catalogOptions(studio.id, "etiqueta"),
    memberOptions(studio.id),
    sql<Option>`select id, caption as name from matters where studio_id = ${studio.id} and deleted_at is null and (not archived or id = ${task?.matter_id ?? defaults?.matterId ?? null}) order by updated_at desc limit 500`,
  ])
  const id = task?.id ?? null
  const startDate = task ? ymdOf(task.starts_at) : defaults?.date ?? todayYmd()
  const startTime = task && !task.all_day ? hmOf(task.starts_at) : "09:00"
  const endDate = task?.ends_at ? ymdOf(task.ends_at) : ""
  const endTime = task?.ends_at && !task.all_day ? hmOf(task.ends_at) : ""
  const defaultStatus = task ? task.status_id : statuses.find((s) => s.category === "inactivo")?.id

  return (
    <ActionForm action={saveTask.bind(null, id)} submit={id ? "Guardar cambios" : "Crear"} className="card max-w-3xl space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="sm:col-span-3">
          <label className="label" htmlFor="title">Título *</label>
          <input id="title" name="title" required maxLength={300} defaultValue={task?.title} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="kind">Tipo</label>
          <select id="kind" name="kind" defaultValue={task?.kind ?? "tarea"} className="input">
            {TASK_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="start_date">Fecha *</label>
          <input id="start_date" name="start_date" type="date" required defaultValue={startDate} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="start_time">Hora</label>
          <input id="start_time" name="start_time" type="time" defaultValue={startTime} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="end_date">Hasta (fecha)</label>
          <input id="end_date" name="end_date" type="date" defaultValue={endDate} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="end_time">Hasta (hora)</label>
          <input id="end_time" name="end_time" type="time" defaultValue={endTime} className="input" />
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-4">
          <input type="checkbox" name="all_day" value="1" defaultChecked={task?.all_day} /> Todo el día (se ignoran las horas)
        </label>

        <div>
          <label className="label" htmlFor="calendar_id">Calendario</label>
          <select id="calendar_id" name="calendar_id" defaultValue={task?.calendar_id ?? calendars[0]?.id ?? ""} className="input">
            <option value="">—</option>
            {calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="status_id">Estado</label>
          <select id="status_id" name="status_id" defaultValue={defaultStatus ?? ""} className="input">
            <option value="">Sin estado (alerta)</option>
            {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="remind_minutes">Recordatorio</label>
          <select id="remind_minutes" name="remind_minutes" defaultValue={task?.remind_minutes ?? ""} className="input">
            {REMINDERS.map((r) => <option key={r.label} value={r.minutes ?? ""}>{r.label}</option>)}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="matter_id">Expediente</label>
          <select id="matter_id" name="matter_id" defaultValue={task?.matter_id ?? defaults?.matterId ?? ""} className="input">
            <option value="">—</option>
            {matters.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="location">Lugar</label>
          <input id="location" name="location" maxLength={300} defaultValue={task?.location ?? ""} className="input" />
        </div>
        <div className="sm:col-span-2"><MultiPick name="assignees" label="Asignados" options={members} defaultValue={links ? links.assignees.map((a) => a.id) : [user.id]} /></div>
        <div className="sm:col-span-2"><MultiPick name="tags" label="Etiquetas" options={tags} defaultValue={links?.tags.map((t) => t.id)} /></div>
        <div className="sm:col-span-4">
          <label className="label" htmlFor="description">Descripción</label>
          <textarea id="description" name="description" rows={3} defaultValue={task?.description ?? ""} className="input" />
        </div>
      </div>
    </ActionForm>
  )
}

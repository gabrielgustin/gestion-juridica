import "server-only"
import { query } from "@/lib/sql"
import { OVERDUE_SQL } from "@/lib/tasks"

export type TaskRow = {
  id: string; title: string; kind: string; starts_at: Date; ends_at: Date | null; all_day: boolean
  status_id: string | null; status_name: string | null; status_color: string | null; category: string | null
  calendar_name: string | null; calendar_color: string | null; matter_id: string | null; matter_caption: string | null
  location: string | null; overdue: boolean; assignees: string | null
}

export type TaskFilters = {
  studioId: string
  userId: string
  from?: string | null       // ISO
  to?: string | null         // ISO (exclusivo)
  calendars?: string[]
  status?: string            // categoría, 'retrasado' o 'alerta'
  mine?: boolean
  excludeFinal?: boolean
  matterId?: string
  limit?: number
}

export async function loadTasks(f: TaskFilters): Promise<TaskRow[]> {
  const where = ["t.studio_id = $1"]
  const args: unknown[] = [f.studioId]
  const add = (value: unknown) => { args.push(value); return `$${args.length}` }
  if (f.from) where.push(`coalesce(t.ends_at, t.starts_at) >= ${add(f.from)}`)
  if (f.to) where.push(`t.starts_at < ${add(f.to)}`)
  if (f.calendars?.length) where.push(`t.calendar_id = any(${add(f.calendars)}::uuid[])`)
  if (f.mine) where.push(`exists (select 1 from assignments a where a.entity = 'task' and a.entity_id = t.id and a.user_id = ${add(f.userId)})`)
  if (f.matterId) where.push(`t.matter_id = ${add(f.matterId)}`)
  if (f.excludeFinal) where.push(`coalesce(st.category, '') <> 'finalizado'`)
  if (f.status === "retrasado") where.push(OVERDUE_SQL)
  else if (f.status === "alerta") where.push("t.status_id is null")
  else if (f.status) where.push(`st.category = ${add(f.status)}`)

  return query<TaskRow>(
    `select t.id, t.title, t.kind, t.starts_at, t.ends_at, t.all_day, t.status_id, t.location,
            st.name as status_name, st.color as status_color, st.category,
            cal.name as calendar_name, cal.color as calendar_color, t.matter_id, m.caption as matter_caption,
            ${OVERDUE_SQL} as overdue,
            (select string_agg(u.name, ', ' order by u.name) from assignments a join "user" u on u.id = a.user_id
             where a.entity = 'task' and a.entity_id = t.id) as assignees
     from tasks t
     left join catalog_items st on st.id = t.status_id
     left join catalog_items cal on cal.id = t.calendar_id
     left join matters m on m.id = t.matter_id
     where ${where.join(" and ")}
     order by t.starts_at, t.title
     limit ${Math.min(f.limit ?? 1000, 2000)}`,
    args,
  )
}

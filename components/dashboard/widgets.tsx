import Link from "next/link"
import { sql } from "@/lib/sql"
import { addDays, localToIso, todayYmd, ymdOf, hmOf } from "@/lib/dates"
import { loadTasks } from "@/lib/task-queries"
import { REMINDERS } from "@/lib/tasks"
import type { WidgetId } from "@/lib/dashboard"
import { TaskLine } from "@/components/tasks/task-pill"

type Ctx = { studioId: string; userId: string }
const dmy = (d: Date) => ymdOf(d).split("-").reverse().join("/")

function Card({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <section className="card flex min-w-0 flex-col p-4" aria-label={title}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-medium">{title}</h2>
        {href && <Link href={href} className="text-sm text-brand hover:underline">Ver todo</Link>}
      </div>
      {children}
    </section>
  )
}
const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-ink-soft">{children}</p>

async function Agenda({ studioId, userId }: Ctx) {
  const today = todayYmd()
  const tasks = await loadTasks({ studioId, userId, mine: true, from: localToIso(today), to: localToIso(addDays(today, 7)), limit: 8 })
  return (
    <Card title="Mi agenda" href="/calendario?vista=agenda&mios=1">
      {tasks.length ? <ul className="-mx-3 divide-y divide-line">{tasks.map((t) => <TaskLine key={t.id} task={t} />)}</ul> : <Empty>No tenés eventos próximos.</Empty>}
    </Card>
  )
}

async function Deadlines({ studioId }: Ctx) {
  const rows = await sql<{ id: string; title: string; starts_at: Date; kind: string; caption: string | null }>`
    select t.id, t.title, t.starts_at, t.kind, m.caption from tasks t
    left join catalog_items st on st.id = t.status_id left join matters m on m.id = t.matter_id
    where t.studio_id = ${studioId} and t.kind in ('vencimiento', 'audiencia')
      and t.starts_at >= now() - interval '1 day' and t.starts_at < now() + interval '30 days'
      and coalesce(st.category, '') not in ('completado', 'finalizado')
    order by t.starts_at limit 8`
  return (
    <Card title="Vencimientos" href="/calendario?vista=agenda">
      {rows.length ? (
        <ul className="divide-y divide-line text-sm">
          {rows.map((r) => (
            <li key={r.id} className="py-2">
              <div className="flex justify-between gap-2">
                <Link href={`/calendario/${r.id}`} className="font-medium hover:underline">{r.title}</Link>
                <span className="shrink-0 text-ink-soft">{dmy(r.starts_at)}</span>
              </div>
              <div className="truncate text-xs text-ink-soft">{r.kind === "audiencia" ? "Audiencia" : "Vencimiento"}{r.caption ? ` · ${r.caption}` : ""}</div>
            </li>
          ))}
        </ul>
      ) : <Empty>No tenés vencimientos próximos.</Empty>}
    </Card>
  )
}

async function Reminders({ studioId, userId }: Ctx) {
  const rows = await sql<{ id: string; title: string; starts_at: Date; remind_minutes: number }>`
    select t.id, t.title, t.starts_at, t.remind_minutes from tasks t
    join assignments a on a.entity = 'task' and a.entity_id = t.id and a.user_id = ${userId}
    where t.studio_id = ${studioId} and t.remind_minutes is not null and t.reminded_at is null and t.starts_at > now()
    order by t.starts_at - make_interval(mins => t.remind_minutes) limit 6`
  return (
    <Card title="Recordatorios">
      {rows.length ? (
        <ul className="divide-y divide-line text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex justify-between gap-2 py-2">
              <Link href={`/calendario/${r.id}`} className="hover:underline">{r.title}</Link>
              <span className="shrink-0 text-xs text-ink-soft">{REMINDERS.find((x) => x.minutes === r.remind_minutes)?.label} · {dmy(r.starts_at)} {hmOf(r.starts_at)}</span>
            </li>
          ))}
        </ul>
      ) : <Empty>No tenés recordatorios pendientes.</Empty>}
    </Card>
  )
}

async function Notifications({ studioId, userId }: Ctx) {
  const rows = await sql<{ id: string; title: string; link: string | null; created_at: Date }>`
    select id, title, link, created_at from notifications where studio_id = ${studioId} and user_id = ${userId} and read_at is null
    order by created_at desc limit 5`
  return (
    <Card title="Notificaciones" href="/notificaciones">
      {rows.length ? (
        <ul className="divide-y divide-line text-sm">
          {rows.map((n) => <li key={n.id} className="py-2">{n.link ? <Link href={n.link} className="hover:underline">{n.title}</Link> : n.title}</li>)}
        </ul>
      ) : <Empty>No tenés notificaciones.</Empty>}
    </Card>
  )
}

async function ByStatus({ studioId }: Ctx) {
  const rows = await sql<{ id: string | null; name: string | null; color: string | null; n: string }>`
    select e.id, e.name, e.color, count(*) as n from matters m left join catalog_items e on e.id = m.estado_id
    where m.studio_id = ${studioId} and not m.archived and m.deleted_at is null
    group by e.id, e.name, e.color order by count(*) desc`
  const max = Math.max(1, ...rows.map((r) => Number(r.n)))
  return (
    <Card title="Expedientes por estado" href="/expedientes">
      {rows.length ? (
        <ul className="space-y-2 text-sm">
          {rows.map((r) => (
            <li key={r.id ?? "none"}>
              <Link href={r.id ? `/expedientes?estado=${r.id}` : "/expedientes"} className="flex justify-between hover:underline">
                <span>{r.name ?? "Sin estado"}</span><span className="text-ink-soft">{Number(r.n)}</span>
              </Link>
              <div className="h-1.5 rounded bg-line"><div className="h-full rounded" style={{ width: `${(Number(r.n) / max) * 100}%`, background: r.color ?? "#94a3b8" }} /></div>
            </li>
          ))}
        </ul>
      ) : <Empty>Sin expedientes activos.</Empty>}
    </Card>
  )
}

async function RecentDocs({ studioId }: Ctx) {
  const rows = await sql<{ id: string; name: string; created_at: Date }>`
    select id, name, created_at from documents where studio_id = ${studioId} and deleted_at is null order by created_at desc limit 6`
  return (
    <Card title="Documentos recientes" href="/documentos">
      {rows.length ? (
        <ul className="divide-y divide-line text-sm">
          {rows.map((d) => (
            <li key={d.id} className="flex justify-between gap-2 py-2">
              <a href={`/api/documentos/${d.id}`} target="_blank" rel="noopener" className="truncate hover:underline">{d.name}</a>
              <span className="shrink-0 text-xs text-ink-soft">{dmy(d.created_at)}</span>
            </li>
          ))}
        </ul>
      ) : <Empty>Todavía no hay documentos.</Empty>}
    </Card>
  )
}

async function Activity({ studioId }: Ctx) {
  const rows = await sql<{ id: string; title: string; occurred_at: Date; matter_id: string; caption: string }>`
    select a.id, a.title, a.occurred_at, m.id as matter_id, m.caption from matter_activities a join matters m on m.id = a.matter_id
    where m.studio_id = ${studioId} and m.deleted_at is null order by a.occurred_at desc, a.created_at desc limit 8`
  return (
    <Card title="Última actividad" href="/calendario?vista=movimientos">
      {rows.length ? (
        <ul className="divide-y divide-line text-sm">
          {rows.map((r) => (
            <li key={r.id} className="py-2">
              <div className="flex justify-between gap-2"><span>{r.title}</span><span className="shrink-0 text-xs text-ink-soft">{dmy(r.occurred_at)}</span></div>
              <Link href={`/expedientes/${r.matter_id}`} className="block truncate text-xs text-ink-soft hover:underline">{r.caption}</Link>
            </li>
          ))}
        </ul>
      ) : <Empty>Todavía no hay actuaciones.</Empty>}
    </Card>
  )
}

export const WIDGET_COMPONENTS: Record<WidgetId, (ctx: Ctx) => Promise<React.ReactNode>> = {
  agenda: Agenda, vencimientos: Deadlines, recordatorios: Reminders, notificaciones: Notifications,
  estados: ByStatus, documentos: RecentDocs, actividad: Activity,
}

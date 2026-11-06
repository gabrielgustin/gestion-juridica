import Link from "next/link"
import { getMember } from "@/lib/session"
import { sql } from "@/lib/sql"
import { catalogOptions } from "@/lib/entities"
import { addDays, addMonths, formatDay, formatMonth, hmOf, isYmd, localToIso, monthGrid, startOfMonth, startOfWeek, todayYmd, ymdOf } from "@/lib/dates"
import { many, one, withParams, type Params } from "@/lib/list-params"
import { loadTasks, type TaskRow } from "@/lib/task-queries"
import { STATUS_FILTERS, TASK_KINDS } from "@/lib/tasks"
import { TASK_CATEGORIES } from "@/lib/catalogs"
import { TaskLine, TaskPill } from "@/components/tasks/task-pill"
import { Kanban } from "@/components/tasks/kanban"
import { Chip } from "@/components/chips"

const VIEWS = [
  { id: "calendario", label: "Calendario" }, { id: "agenda", label: "Agenda" }, { id: "movimientos", label: "Movimientos" },
  { id: "tabla", label: "Tabla" }, { id: "kanban", label: "Kanban" },
] as const
const RANGES = [{ id: "mes", label: "Mes" }, { id: "semana", label: "Semana" }, { id: "dia", label: "Día" }] as const
const WEEKDAYS = ["DO", "LU", "MA", "MI", "JU", "VI", "SA"]

const byDay = (tasks: TaskRow[]) => {
  const map = new Map<string, TaskRow[]>()
  for (const t of tasks) {
    // Una tarea de varios días aparece en cada uno (hasta 31).
    const first = ymdOf(t.starts_at)
    const last = t.ends_at ? ymdOf(t.ends_at) : first
    for (let d = first, i = 0; d <= last && i < 31; d = addDays(d, 1), i++) map.set(d, [...(map.get(d) ?? []), t])
  }
  return map
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { studio, user } = await getMember()
  const params = await searchParams
  const view = VIEWS.some((v) => v.id === one(params.vista)) ? one(params.vista) : "calendario"
  const range = RANGES.some((r) => r.id === one(params.rango)) ? one(params.rango) : "mes"
  const today = todayYmd()
  const anchor = isYmd(one(params.fecha)) ? one(params.fecha) : today
  const calendars = await catalogOptions(studio.id, "calendario")
  const selectedCals = many(params.cal).filter((id) => calendars.some((c) => c.id === id))
  const status = STATUS_FILTERS.some((s) => s.id === one(params.estado)) ? one(params.estado) : ""
  const mine = one(params.mios) === "1"
  const base = { studioId: studio.id, userId: user.id, calendars: selectedCals, status, mine }

  // Rango de fechas según la vista.
  let from = anchor, to = addDays(anchor, 1), title = formatDay(anchor), prev = addDays(anchor, -1), next = addDays(anchor, 1)
  if (view === "calendario" && range === "mes" || view === "tabla") {
    const grid = monthGrid(anchor)
    from = view === "tabla" ? startOfMonth(anchor) : grid[0][0]
    to = view === "tabla" ? addMonths(anchor, 1) : addDays(grid.at(-1)![6], 1)
    title = formatMonth(anchor); prev = addMonths(anchor, -1); next = addMonths(anchor, 1)
  } else if (view === "calendario" && range === "semana") {
    from = startOfWeek(anchor); to = addDays(from, 7)
    title = `Semana del ${formatDay(from, { day: "numeric", month: "long" })}`; prev = addDays(anchor, -7); next = addDays(anchor, 7)
  } else if (view === "agenda" || view === "movimientos") {
    from = view === "agenda" ? anchor : addDays(anchor, -30); to = view === "agenda" ? addDays(anchor, 60) : addDays(anchor, 1)
    title = view === "agenda" ? `Desde el ${formatDay(anchor, { day: "numeric", month: "long" })}` : "Últimos 30 días"
    prev = addDays(anchor, -30); next = addDays(anchor, 30)
  }

  const tasks = view === "movimientos" ? []
    : view === "kanban" ? await loadTasks({ ...base, excludeFinal: true, limit: 500 })
    : await loadTasks({ ...base, from: localToIso(from), to: localToIso(to) })
  const overdue = view === "agenda" && status !== "retrasado" ? await loadTasks({ ...base, status: "retrasado", to: localToIso(anchor), limit: 100 }) : []
  const days = byDay(tasks)
  const link = (changes: Record<string, string | null>) => withParams("/calendario", params, changes)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl first-letter:uppercase">{view === "kanban" ? "Tablero" : title}</h1>
        <Link href={`/calendario/nuevo?fecha=${anchor}`} className="btn">+ Crear</Link>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-line" aria-label="Vistas">
        {VIEWS.map((v) => (
          <Link key={v.id} href={link({ vista: v.id === "calendario" ? null : v.id })}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${view === v.id ? "border-brand font-medium" : "border-transparent text-ink-soft hover:text-ink"}`}>
            {v.label}
          </Link>
        ))}
      </nav>

      <div className="flex flex-col gap-4 lg:flex-row">
        <aside className="shrink-0 lg:w-56">
          <form action="/calendario" className="card space-y-3 p-3 text-sm">
            {view !== "calendario" && <input type="hidden" name="vista" value={view} />}
            {range !== "mes" && <input type="hidden" name="rango" value={range} />}
            <input type="hidden" name="fecha" value={anchor} />
            <fieldset>
              <legend className="label">Calendarios</legend>
              {calendars.map((c) => (
                <label key={c.id} className="flex items-center gap-2 py-0.5">
                  <input type="checkbox" name="cal" value={c.id} defaultChecked={selectedCals.includes(c.id)} />
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} aria-hidden /> {c.name}
                </label>
              ))}
              <Link href="/configuracion/calendarios" className="text-xs text-brand hover:underline">Agregar calendario</Link>
            </fieldset>
            <div>
              <label className="label" htmlFor="estado">Estado</label>
              <select id="estado" name="estado" defaultValue={status} className="input">
                {STATUS_FILTERS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2"><input type="checkbox" name="mios" value="1" defaultChecked={mine} /> Asignados a mí</label>
            <button className="btn-ghost w-full">Aplicar</button>
          </form>
        </aside>

        <div className="min-w-0 flex-1 space-y-3">
          {view !== "kanban" && (
            <div className="flex flex-wrap items-center gap-2">
              <Link href={link({ fecha: prev })} className="btn-ghost" aria-label="Anterior">‹</Link>
              <Link href={link({ fecha: today })} className="btn-ghost">Hoy</Link>
              <Link href={link({ fecha: next })} className="btn-ghost" aria-label="Siguiente">›</Link>
              {view === "calendario" && (
                <div className="ml-auto flex gap-1">
                  {RANGES.map((r) => (
                    <Link key={r.id} href={link({ rango: r.id === "mes" ? null : r.id })}
                      className={range === r.id ? "btn" : "btn-ghost"}>{r.label}</Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {view === "calendario" && range === "mes" && (
            <div className="card overflow-x-auto">
              <div className="grid min-w-[42rem] grid-cols-7 border-b border-line text-center text-xs text-ink-soft">
                {WEEKDAYS.map((d) => <div key={d} className="p-2">{d}</div>)}
              </div>
              {monthGrid(anchor).map((week) => (
                <div key={week[0]} className="grid min-w-[42rem] grid-cols-7 border-b border-line last:border-0">
                  {week.map((d) => {
                    const list = days.get(d) ?? []
                    return (
                      <div key={d} className={`min-h-24 border-r border-line p-1 last:border-0 ${d.slice(0, 7) !== anchor.slice(0, 7) ? "bg-paper/60 text-ink-soft" : ""}`}>
                        <Link href={link({ rango: "dia", fecha: d })}
                          className={`mb-1 inline-grid h-6 w-6 place-items-center rounded-full text-xs ${d === today ? "bg-brand text-white" : "hover:bg-line"}`}>
                          {Number(d.slice(8))}
                        </Link>
                        <div className="space-y-0.5">
                          {list.slice(0, 3).map((t) => <TaskPill key={t.id} task={t} />)}
                          {list.length > 3 && <Link href={link({ rango: "dia", fecha: d })} className="block text-xs text-brand">+{list.length - 3} más</Link>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

          {view === "calendario" && range === "semana" && (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
              {Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((d) => (
                <div key={d} className="card min-h-40 p-2">
                  <Link href={link({ rango: "dia", fecha: d })} className={`text-xs ${d === today ? "font-bold text-brand" : "text-ink-soft"}`}>
                    {WEEKDAYS[i(d)]} {Number(d.slice(8))}
                  </Link>
                  <div className="mt-1 space-y-1">{(days.get(d) ?? []).map((t) => <TaskPill key={t.id} task={t} />)}</div>
                </div>
              ))}
            </div>
          )}

          {(view === "calendario" && range === "dia") && <DayList tasks={days.get(anchor) ?? []} />}

          {view === "agenda" && (
            <div className="space-y-4">
              {overdue.length > 0 && (
                <section>
                  <h2 className="label text-danger">Retrasadas</h2>
                  <ul className="card divide-y divide-line">{overdue.map((t) => <TaskLine key={t.id} task={t} />)}</ul>
                </section>
              )}
              {[...days.entries()].filter(([d]) => d >= from).sort(([a], [b]) => a.localeCompare(b)).map(([d, list]) => (
                <section key={d}>
                  <h2 className="label first-letter:uppercase">{d === today ? "Hoy · " : ""}{formatDay(d)}</h2>
                  <ul className="card divide-y divide-line">{list.map((t) => <TaskLine key={t.id} task={t} />)}</ul>
                </section>
              ))}
              {days.size === 0 && overdue.length === 0 && <p className="text-ink-soft">No hay eventos en esta selección.</p>}
            </div>
          )}

          {view === "movimientos" && <Movements studioId={studio.id} userId={user.id} mine={mine} from={from} to={to} />}

          {view === "tabla" && (
            <div className="card overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-soft">
                  <tr>{["Fecha", "Título", "Tipo", "Estado", "Calendario", "Expediente", "Asignados"].map((h) => <th key={h} className="p-3">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {tasks.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-ink-soft">No hay eventos en esta selección.</td></tr>}
                  {tasks.map((t) => (
                    <tr key={t.id} className="hover:bg-paper">
                      <td className="p-3 whitespace-nowrap">{ymdOf(t.starts_at).split("-").reverse().join("/")} {t.all_day ? "" : hmOf(t.starts_at)}</td>
                      <td className="p-3 font-medium"><Link href={`/calendario/${t.id}`} className="hover:underline">{t.title}</Link></td>
                      <td className="p-3">{TASK_KINDS.find((k) => k.id === t.kind)?.label}</td>
                      <td className="p-3">
                        {t.overdue ? <Chip name="Retrasada" color="#b91c1c" /> : t.status_name ? <Chip name={t.status_name} color={t.status_color} /> : <Chip name="Alerta" color="#d97706" />}
                      </td>
                      <td className="p-3">{t.calendar_name ?? "—"}</td>
                      <td className="p-3">{t.matter_id ? <Link href={`/expedientes/${t.matter_id}`} className="hover:underline">{t.matter_caption}</Link> : "—"}</td>
                      <td className="p-3">{t.assignees ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {view === "kanban" && <KanbanView studioId={studio.id} tasks={tasks} />}
        </div>
      </div>
    </div>
  )
}

const i = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay()

function DayList({ tasks }: { tasks: TaskRow[] }) {
  if (!tasks.length) return <p className="text-ink-soft">No hay eventos este día.</p>
  return <ul className="card divide-y divide-line">{tasks.map((t) => <TaskLine key={t.id} task={t} />)}</ul>
}

async function Movements({ studioId, userId, mine, from, to }: { studioId: string; userId: string; mine: boolean; from: string; to: string }) {
  const rows = await sql<{ id: string; occurred_at: Date; title: string; source: string; matter_id: string; caption: string }>`
    select a.id, a.occurred_at, a.title, a.source, m.id as matter_id, m.caption
    from matter_activities a join matters m on m.id = a.matter_id
    where m.studio_id = ${studioId} and m.deleted_at is null
      and a.occurred_at >= ${localToIso(from)} and a.occurred_at < ${localToIso(to)}
      and (${!mine} or exists (select 1 from assignments s where s.entity = 'matter' and s.entity_id = m.id and s.user_id = ${userId}))
    order by a.occurred_at desc limit 300`
  if (!rows.length) return <p className="text-ink-soft">Sin movimientos en los expedientes en este período.</p>
  return (
    <ul className="card divide-y divide-line">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap gap-3 p-3 text-sm">
          <span className="w-24 shrink-0 text-ink-soft">{ymdOf(r.occurred_at).split("-").reverse().join("/")}</span>
          <span className="min-w-0 flex-1">{r.title}</span>
          <Link href={`/expedientes/${r.matter_id}`} className="max-w-xs truncate text-brand hover:underline">{r.caption}</Link>
          <span className="text-xs text-ink-soft">{r.source === "manual" ? "Manual" : r.source.toUpperCase()}</span>
        </li>
      ))}
    </ul>
  )
}

async function KanbanView({ studioId, tasks }: { studioId: string; tasks: TaskRow[] }) {
  const statuses = await sql<{ id: string; name: string; category: string }>`
    select id, name, category from catalog_items where studio_id = ${studioId} and kind = 'estado_tarea' and active order by sort, name`
  const columns = [
    { id: "alerta", label: "Alertas", statuses: [] as { id: string; name: string }[] },
    ...TASK_CATEGORIES.map((c) => ({ id: c.id, label: c.label, statuses: statuses.filter((s) => s.category === c.id) })),
  ]
  const cards = tasks.map((t) => ({
    id: t.id, title: t.title, status_id: t.status_id, overdue: t.overdue, matter: t.matter_caption, color: t.calendar_color,
    when: `${ymdOf(t.starts_at).split("-").reverse().join("/")}${t.all_day ? "" : ` ${hmOf(t.starts_at)}`}`,
  }))
  return <Kanban columns={columns} cards={cards} statusCategory={Object.fromEntries(statuses.map((s) => [s.id, s.category]))} />
}

import Link from "next/link"
import { hmOf } from "@/lib/dates"
import type { TaskRow } from "@/lib/task-queries"

/** Una tarea en el calendario: color del calendario, hora y marca de retrasada/alerta. */
export function TaskPill({ task, showTime = true }: { task: TaskRow; showTime?: boolean }) {
  const done = task.category === "completado" || task.category === "finalizado"
  return (
    <Link href={`/calendario/${task.id}`} title={task.title}
      className={`block truncate rounded border-l-4 bg-white px-1.5 py-0.5 text-xs hover:bg-brand-soft ${done ? "line-through opacity-60" : ""} ${task.overdue ? "text-danger" : ""}`}
      style={{ borderColor: task.calendar_color ?? "#64748b" }}>
      {showTime && !task.all_day && <span className="mr-1 text-ink-soft">{hmOf(task.starts_at)}</span>}
      {!task.status_id && <span aria-label="Alerta" className="mr-1">⚠</span>}
      {task.title}
    </Link>
  )
}

export function TaskLine({ task }: { task: TaskRow }) {
  return (
    <li className="flex flex-wrap items-center gap-3 p-3 text-sm">
      <span className="w-20 shrink-0 text-ink-soft">{task.all_day ? "Todo el día" : hmOf(task.starts_at)}</span>
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: task.calendar_color ?? "#64748b" }} aria-hidden />
      <Link href={`/calendario/${task.id}`} className="min-w-[10rem] flex-1 font-medium hover:underline">{task.title}</Link>
      {task.matter_caption && <Link href={`/expedientes/${task.matter_id}`} className="max-w-xs truncate text-ink-soft hover:underline">{task.matter_caption}</Link>}
      {task.overdue ? <span className="text-xs font-medium text-danger">Retrasada</span>
        : !task.status_id ? <span className="text-xs font-medium text-amber-700">Alerta</span>
        : <span className="text-xs text-ink-soft">{task.status_name}</span>}
    </li>
  )
}

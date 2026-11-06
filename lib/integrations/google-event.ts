import { addDays, ymdOf } from "@/lib/dates"
import { TASK_KINDS } from "@/lib/tasks"

export const appOrigin = () =>
  process.env.BETTER_AUTH_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:4700")

export type TaskRow = { id: string; title: string; kind: string; description: string | null; location: string | null; starts_at: Date; ends_at: Date | null; all_day: boolean; caption: string | null; done: boolean }

/** Evento de Google para una tarea. Todo el día usa fechas (el fin es exclusivo); con hora, una hora por defecto. */
export function eventFor(task: TaskRow) {
  const kind = TASK_KINDS.find((k) => k.id === task.kind)?.label ?? "Tarea"
  const description = [task.caption ? `Expediente: ${task.caption}` : null, task.description, `${appOrigin()}/calendario/${task.id}`].filter(Boolean).join("\n\n")
  const base = { summary: `${task.done ? "✓ " : ""}${kind === "Tarea" ? "" : `${kind}: `}${task.title}`, description, location: task.location ?? undefined }
  if (task.all_day) {
    const start = ymdOf(task.starts_at)
    const end = addDays(task.ends_at ? ymdOf(task.ends_at) : start, 1)
    return { ...base, start: { date: start }, end: { date: end } }
  }
  const end = task.ends_at ?? new Date(new Date(task.starts_at).getTime() + 60 * 60 * 1000)
  return {
    ...base,
    start: { dateTime: new Date(task.starts_at).toISOString(), timeZone: "America/Argentina/Buenos_Aires" },
    end: { dateTime: new Date(end).toISOString(), timeZone: "America/Argentina/Buenos_Aires" },
  }
}

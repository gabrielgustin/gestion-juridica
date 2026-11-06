// Tareas y eventos del calendario: tipos, recordatorios y la regla de "retrasada".

export const TASK_KINDS = [
  { id: "tarea", label: "Tarea" },
  { id: "evento", label: "Evento" },
  { id: "audiencia", label: "Audiencia" },
  { id: "vencimiento", label: "Vencimiento" },
] as const
export type TaskKind = (typeof TASK_KINDS)[number]["id"]

export const REMINDERS = [
  { minutes: null, label: "Sin recordatorio" },
  { minutes: 0, label: "A la hora" },
  { minutes: 15, label: "15 minutos antes" },
  { minutes: 60, label: "1 hora antes" },
  { minutes: 60 * 24, label: "1 día antes" },
  { minutes: 60 * 24 * 2, label: "2 días antes" },
  { minutes: 60 * 24 * 7, label: "1 semana antes" },
] as const

/**
 * SQL de "retrasada" para una tarea `t` unida a su estado `st`: tiene estado, ya pasó su hora
 * y no está en Completados ni Finalizados. Un evento sin estado es una alerta: nunca se retrasa.
 */
export const OVERDUE_SQL = `(t.status_id is not null and coalesce(t.ends_at, t.starts_at) < now() and coalesce(st.category, 'inactivo') not in ('completado', 'finalizado'))`

export const STATUS_FILTERS = [
  { id: "", label: "Todas" },
  { id: "inactivo", label: "Inactivos" },
  { id: "activo", label: "Activos" },
  { id: "completado", label: "Completados" },
  { id: "finalizado", label: "Finalizados" },
  { id: "retrasado", label: "Retrasados" },
  { id: "alerta", label: "Alertas (sin estado)" },
] as const

export const isOverdue = (task: { status_id: string | null; starts_at: Date | string; ends_at: Date | string | null; category: string | null }, now = new Date()) =>
  Boolean(task.status_id) && new Date(task.ends_at ?? task.starts_at) < now && !["completado", "finalizado"].includes(task.category ?? "inactivo")

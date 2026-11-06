// Widgets del panel de inicio: cuáles hay, el orden de fábrica y cómo se sanea lo que elige cada usuario.

export const WIDGETS = [
  { id: "agenda", label: "Mi agenda", hint: "Tus tareas y eventos de los próximos 7 días" },
  { id: "vencimientos", label: "Vencimientos", hint: "Vencimientos y audiencias de los próximos 30 días" },
  { id: "recordatorios", label: "Recordatorios", hint: "Tus próximos recordatorios" },
  { id: "notificaciones", label: "Notificaciones", hint: "Lo último sin leer" },
  { id: "estados", label: "Expedientes por estado", hint: "Cuántas causas activas hay en cada estado" },
  { id: "documentos", label: "Documentos recientes", hint: "Lo último que se subió" },
  { id: "actividad", label: "Última actividad", hint: "Las últimas actuaciones de los expedientes" },
] as const
export type WidgetId = (typeof WIDGETS)[number]["id"]

export const DEFAULT_WIDGETS: WidgetId[] = WIDGETS.map((w) => w.id)

/** Deja solo ids conocidos, sin repetir, en el orden recibido. `null` = los de fábrica. */
export function cleanWidgets(input: unknown): WidgetId[] {
  if (!Array.isArray(input)) return DEFAULT_WIDGETS
  const known = new Set<string>(DEFAULT_WIDGETS)
  return [...new Set(input.filter((id): id is WidgetId => typeof id === "string" && known.has(id)))]
}

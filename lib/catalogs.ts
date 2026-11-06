// Catálogos del estudio: qué tipos hay, cómo se llaman en pantalla y con qué arranca un estudio nuevo.

export const TASK_CATEGORIES = [
  { id: "inactivo", label: "Inactivos", hint: "Todavía no arrancó (ej. Pendiente)" },
  { id: "activo", label: "Activos", hint: "En curso (ej. En progreso, En revisión)" },
  { id: "completado", label: "Completados", hint: "Tarea hecha (ej. Realizado)" },
  { id: "finalizado", label: "Finalizados", hint: "Archivada o cerrada" },
] as const
export type TaskCategory = (typeof TASK_CATEGORIES)[number]["id"]

export const CATALOGS = {
  estado: { slug: "estados", label: "Estados", group: "Expedientes", hint: "Los que elegís a mano en una causa, para los matices que el tribunal no informa. Archivar no es un estado: es un interruptor de cada expediente." },
  etapa: { slug: "etapas", label: "Etapas", group: "Expedientes", hint: "En qué momento procesal está la causa." },
  fuero: { slug: "fueros", label: "Fueros", group: "Expedientes", hint: "Fueros con los que trabaja el estudio." },
  parte: { slug: "partes", label: "Partes", group: "Expedientes", hint: "Qué rol tiene el cliente en la causa." },
  calendario: { slug: "calendarios", label: "Calendarios", group: "Calendario", hint: "Agendas separadas (por ejemplo, una por abogado o por área). Cada tarea o evento va en una." },
  estado_tarea: { slug: "estados-tarea", label: "Estados de tarea", group: "Calendario", hint: "La categoría define el significado: una tarea vencida que no está en Completados ni Finalizados figura como retrasada. Un evento sin estado es una alerta." },
  tipo_cliente: { slug: "tipos-cliente", label: "Tipos de cliente", group: "Clientes", hint: "Cómo clasificás a tus clientes." },
  tipo_juzgado: { slug: "tipos-juzgado", label: "Tipos de juzgado", group: "Juzgados", hint: "Cómo clasificás a los juzgados." },
  etiqueta: { slug: "etiquetas", label: "Etiquetas", group: "Etiquetas", hint: "Etiquetas libres para expedientes, clientes y juzgados." },
} as const
export type CatalogKind = keyof typeof CATALOGS

export const kindFromSlug = (slug: string) =>
  (Object.keys(CATALOGS) as CatalogKind[]).find((kind) => CATALOGS[kind].slug === slug)

type Seed = { name: string; color: string; category?: TaskCategory }
const c = (color: string, ...names: string[]): Seed[] => names.map((name) => ({ name, color }))

export const DEFAULT_CATALOGS: Record<CatalogKind, Seed[]> = {
  estado: [...c("#2563eb", "En trámite"), ...c("#d97706", "En espera")],
  etapa: [
    ...c("#0ea5e9", "Inicio"), ...c("#8b5cf6", "Prueba"), ...c("#14b8a6", "Alegatos"), ...c("#f59e0b", "Sentencia"),
    ...c("#ef4444", "Recursos"), ...c("#22c55e", "Ejecución"), ...c("#64748b", "Conciliado"),
  ],
  fuero: c("#475569", "Civil", "Comercial", "Laboral", "Penal", "Contencioso Administrativo", "Familia", "Seguridad Social"),
  parte: [...c("#2563eb", "Actora"), ...c("#dc2626", "Demandada"), ...c("#64748b", "Tercero")],
  calendario: c("#7a2e3a", "General"),
  estado_tarea: [
    { name: "Pendiente", color: "#94a3b8", category: "inactivo" },
    { name: "En curso", color: "#2563eb", category: "activo" },
    { name: "Hecha", color: "#16a34a", category: "completado" },
  ],
  tipo_cliente: c("#475569", "Cliente", "Empresa", "Proveedor", "Otro"),
  tipo_juzgado: c("#475569", "Juzgado", "Cámara", "Tribunal oral", "Fiscalía", "Defensoría", "Mediación"),
  etiqueta: [],
}

export const COLOR_RE = /^#[0-9a-f]{6}$/i

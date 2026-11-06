import Link from "next/link"
import { CheckCircle2, Circle } from "lucide-react"
import { getMember } from "@/lib/session"
import { query, sql } from "@/lib/sql"
import { cleanWidgets } from "@/lib/dashboard"
import { OVERDUE_SQL } from "@/lib/tasks"
import { WIDGET_COMPONENTS } from "@/components/dashboard/widgets"
import { Customize, HideOnboarding } from "@/components/dashboard/customize"
import { Sparkles } from "lucide-react"

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("es-AR", { hour: "numeric", hourCycle: "h23", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date()))
  return hour < 12 ? "Buen día" : hour < 20 ? "Buenas tardes" : "Buenas noches"
}

export default async function InicioPage() {
  const { user, studio, role } = await getMember()
  const [settings] = await sql<{ widgets: string[] | null; hide_onboarding: boolean }>`
    select widgets, hide_onboarding from user_settings where studio_id = ${studio.id} and user_id = ${user.id}`
  const widgets = cleanWidgets(settings?.widgets ?? null)

  const [c] = await query<Record<string, string | boolean>>(
    `select
      (select count(*) from matters where studio_id = $1 and not archived and deleted_at is null) as activos,
      (select count(*) from matters m join assignments a on a.entity = 'matter' and a.entity_id = m.id and a.user_id = $2
        where m.studio_id = $1 and not m.archived and m.deleted_at is null) as mios,
      (select count(*) from tasks t left join catalog_items st on st.id = t.status_id
        where t.studio_id = $1 and t.starts_at >= now() and t.starts_at < now() + interval '7 days'
          and coalesce(st.category, '') not in ('completado', 'finalizado')) as semana,
      (select count(*) from tasks t left join catalog_items st on st.id = t.status_id where t.studio_id = $1 and ${OVERDUE_SQL}) as retrasadas,
      (select name <> $3 or logo is not null from studios where id = $1) as paso_estudio,
      (select count(*) > 1 from members where studio_id = $1) or exists (select 1 from invitations where studio_id = $1) as paso_equipo,
      exists (select 1 from matters where studio_id = $1) as paso_expediente,
      exists (select 1 from tasks where studio_id = $1) as paso_tarea,
      exists (select 1 from documents where studio_id = $1) as paso_documento`,
    [studio.id, user.id, `Estudio de ${user.name || user.email.split("@")[0]}`],
  )

  const steps = [
    { done: c.paso_estudio, label: "Poné el nombre y el logo del estudio", href: "/configuracion/estudio", admin: true },
    { done: c.paso_equipo, label: "Invitá a tu equipo", href: "/configuracion/usuarios", admin: true },
    { done: c.paso_expediente, label: "Cargá tu primer expediente", href: "/expedientes/nuevo" },
    { done: c.paso_tarea, label: "Agendá una tarea o un vencimiento", href: "/calendario/nuevo" },
    { done: c.paso_documento, label: "Subí un documento", href: "/documentos" },
  ].filter((s) => !s.admin || role === "admin")
  const doneCount = steps.filter((s) => s.done).length
  const showOnboarding = !settings?.hide_onboarding && doneCount < steps.length

  const counters = [
    { label: "Expedientes activos", value: c.activos, href: "/expedientes" },
    { label: "Míos", value: c.mios, href: "/expedientes?mios=1" },
    { label: "Esta semana", value: c.semana, hint: "próximos 7 días", href: "/calendario?vista=agenda" },
    { label: "Retrasadas", value: c.retrasadas, href: "/calendario?vista=tabla&estado=retrasado", alert: Number(c.retrasadas) > 0 },
  ]
  const ctx = { studioId: studio.id, userId: user.id }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="font-serif text-3xl">{greeting()}, {user.name.split(" ")[0]}</h1>
        <Customize selected={widgets} />
      </div>

      <form action="/mike" className="card flex items-center gap-2 p-3">
        <Sparkles className="shrink-0 text-brand" size={18} aria-hidden />
        <input name="q" required maxLength={20000} placeholder="Preguntale a Mike: una causa, un plazo, un escrito…" aria-label="Preguntale a Mike" className="min-w-0 flex-1 px-1 text-sm outline-none" />
        <button className="btn">Preguntar</button>
      </form>

      {showOnboarding && (
        <section className="card p-5" aria-labelledby="primeros-pasos">
          <div className="flex items-center justify-between">
            <h2 id="primeros-pasos" className="font-medium">Configurá tu área de trabajo · {doneCount} de {steps.length} listos</h2>
            <HideOnboarding />
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {steps.map((s) => (
              <li key={s.href}>
                <Link href={s.href} className={`flex items-center gap-2 rounded-md border border-line p-3 text-sm hover:bg-paper ${s.done ? "text-ink-soft line-through" : ""}`}>
                  {s.done ? <CheckCircle2 size={18} className="text-ok" aria-label="Hecho" /> : <Circle size={18} className="text-ink-soft" aria-label="Pendiente" />}
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {counters.map((k) => (
          <Link key={k.label} href={k.href} className="card p-4 hover:border-brand">
            <div className="label">{k.label}</div>
            <div className={`text-3xl font-medium ${k.alert ? "text-danger" : ""}`}>{Number(k.value)}</div>
            {k.hint && <div className="text-xs text-ink-soft">{k.hint}</div>}
          </Link>
        ))}
      </div>

      {widgets.length === 0 && <p className="text-sm text-ink-soft">Ocultaste todos los paneles. Volvé a elegirlos en «Personalizar».</p>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {widgets.map((id) => {
          const Widget = WIDGET_COMPONENTS[id]
          return <Widget key={id} {...ctx} />
        })}
      </div>
    </div>
  )
}

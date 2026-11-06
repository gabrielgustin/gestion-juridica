import Link from "next/link"
import { notFound } from "next/navigation"
import { getMember } from "@/lib/session"
import { sql } from "@/lib/sql"
import { loadLinks } from "@/lib/entities"
import { addActivity } from "@/lib/actions/matters"
import { MatterForm } from "@/components/matters/matter-form"
import { MatterActions, DeleteActivityButton } from "@/components/matters/matter-actions"
import { ActionForm } from "@/components/action-form"
import { Chip } from "@/components/chips"
import { loadTasks } from "@/lib/task-queries"
import { TaskLine } from "@/components/tasks/task-pill"
import { EntityDocuments } from "@/components/documents/entity-documents"
import { SuggestionCard, type Suggestion } from "@/components/mike/suggestions"
import { AnalyzeMatterButton } from "@/components/mike/analyze-button"

export default async function MatterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const { studio, user } = await getMember()
  const [matter] = await sql<Record<string, any>>`
    select m.*, e.name as estado, e.color as estado_color, s.name as etapa, s.color as etapa_color
    from matters m left join catalog_items e on e.id = m.estado_id left join catalog_items s on s.id = m.etapa_id
    where m.id = ${id} and m.studio_id = ${studio.id}`
  if (!matter) notFound()
  const [links, clientRows, activities] = await Promise.all([
    loadLinks("matter", [id]),
    sql<{ client_id: string }>`select client_id from matter_clients where matter_id = ${id}`,
    sql<{ id: string; occurred_at: Date; title: string; body: string | null; source: string; author: string | null }>`
      select a.id, a.occurred_at, a.title, a.body, a.source, u.name as author
      from matter_activities a left join "user" u on u.id = a.created_by
      where a.matter_id = ${id} order by a.occurred_at desc, a.created_at desc limit 200`,
  ])
  const today = new Date().toISOString().slice(0, 10)
  const suggestions = await sql<Suggestion>`
    select s.id, s.title, to_char(s.due_date, 'YYYY-MM-DD') as due_date, s.rationale, s.matter_id, ${matter.caption}::text as caption, a.title as activity
    from ai_suggestions s left join matter_activities a on a.id = s.activity_id
    where s.matter_id = ${id} and s.status = 'pendiente' order by s.due_date`
  const agenda = await loadTasks({ studioId: studio.id, userId: user.id, matterId: id, excludeFinal: true, limit: 50 })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/expedientes" className="text-sm text-ink-soft hover:underline">← Expedientes</Link>
          <h1 className="font-serif text-3xl">{matter.caption}</h1>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {matter.estado && <Chip name={matter.estado} color={matter.estado_color} />}
            {matter.etapa && <Chip name={matter.etapa} color={matter.etapa_color} />}
            {matter.archived && <Chip name="Archivado" />}
            {matter.deleted_at && <Chip name="En la papelera" color="#b91c1c" />}
            {matter.court_url && <a href={matter.court_url} target="_blank" rel="noopener noreferrer" className="text-brand underline">Ver en el tribunal ↗</a>}
          </div>
        </div>
        <MatterActions id={id} archived={matter.archived} trashed={Boolean(matter.deleted_at)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,48rem)_1fr]">
        <div className="space-y-6">
          <MatterForm matter={matter} links={links.get(id)} clientIds={clientRows.map((r) => r.client_id)} />
          <EntityDocuments entity="matter" id={id} />
        </div>

        <div className="space-y-6">
        <section className="card p-5" aria-labelledby="agenda">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="agenda" className="font-medium">Agenda</h2>
            <Link href={`/calendario/nuevo?expediente=${id}`} className="text-sm text-brand hover:underline">+ Tarea o vencimiento</Link>
          </div>
          {suggestions.length > 0 && (
            <div className="mb-3">
              <p className="mb-2 text-sm font-medium">El agente propone {suggestions.length === 1 ? "este vencimiento" : "estos vencimientos"}:</p>
              <ul className="space-y-2">{suggestions.map((s) => <SuggestionCard key={s.id} s={s} showMatter={false} />)}</ul>
            </div>
          )}
          {agenda.length === 0 ? <p className="text-sm text-ink-soft">Sin tareas pendientes.</p>
            : <ul className="divide-y divide-line">{agenda.map((t) => <TaskLine key={t.id} task={t} />)}</ul>}
        </section>
        <section className="card p-5" aria-labelledby="actuaciones">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 id="actuaciones" className="font-medium">Actuaciones</h2>
            <AnalyzeMatterButton matterId={id} />
          </div>
          <ActionForm action={addActivity.bind(null, id)} submit="Agregar" className="mb-4 space-y-2 border-b border-line pb-4">
            <div className="flex gap-2">
              <input name="occurred_at" type="date" defaultValue={today} aria-label="Fecha" className="input w-auto" />
              <input name="title" required maxLength={300} placeholder="Ej. Se presentó la demanda" aria-label="Título" className="input flex-1" />
            </div>
            <textarea name="body" rows={2} placeholder="Detalle (opcional)" aria-label="Detalle" className="input" />
          </ActionForm>
          {activities.length === 0 && <p className="text-sm text-ink-soft">Todavía no hay actuaciones.</p>}
          <ol className="space-y-3">
            {activities.map((a) => (
              <li key={a.id} className="border-l-2 border-line pl-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs text-ink-soft">
                    {new Date(a.occurred_at).toLocaleDateString("es-AR")} · {a.source === "manual" ? (a.author ?? "Manual") : a.source.toUpperCase()}
                  </div>
                  {a.source === "manual" && <DeleteActivityButton matterId={id} activityId={a.id} />}
                </div>
                <div className="text-sm font-medium">{a.title}</div>
                {a.body && <p className="whitespace-pre-wrap text-sm text-ink-soft">{a.body}</p>}
              </li>
            ))}
          </ol>
        </section>
        </div>
      </div>
    </div>
  )
}

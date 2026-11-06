import Link from "next/link"
import { getMember } from "@/lib/session"
import { sql } from "@/lib/sql"
import { SuggestionCard, type Suggestion } from "@/components/mike/suggestions"

export default async function DeadlineAgentPage() {
  const { studio } = await getMember()
  const pending = await sql<Suggestion>`
    select s.id, s.title, to_char(s.due_date, 'YYYY-MM-DD') as due_date, s.rationale, s.matter_id, m.caption, a.title as activity
    from ai_suggestions s join matters m on m.id = s.matter_id left join matter_activities a on a.id = s.activity_id
    where s.studio_id = ${studio.id} and s.status = 'pendiente' and m.deleted_at is null order by s.due_date`
  const recent = await sql<{ id: string; title: string; status: string; caption: string; task_id: string | null }>`
    select s.id, s.title, s.status, m.caption, s.task_id from ai_suggestions s join matters m on m.id = s.matter_id
    where s.studio_id = ${studio.id} and s.status <> 'pendiente' order by s.created_at desc limit 20`

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/agentes" className="text-sm text-ink-soft hover:underline">← Agentes de IA</Link>
        <h1 className="font-serif text-3xl">Agente de vencimientos</h1>
        <p className="text-sm text-ink-soft">Analiza las actuaciones nuevas de tus causas y propone vencimientos. Revisá la fecha (es una estimación) y agendala, o descartala.</p>
      </div>
      {pending.length === 0 ? <p className="text-ink-soft">No hay propuestas pendientes. Está al día.</p>
        : <ul className="space-y-3">{pending.map((s) => <SuggestionCard key={s.id} s={s} />)}</ul>}
      {recent.length > 0 && (
        <section>
          <h2 className="label">Resueltas recientemente</h2>
          <ul className="card divide-y divide-line text-sm">
            {recent.map((r) => (
              <li key={r.id} className="flex justify-between gap-3 p-3">
                <span>{r.title} · <span className="text-ink-soft">{r.caption}</span></span>
                {r.task_id ? <Link href={`/calendario/${r.task_id}`} className="text-ok hover:underline">Agendado</Link> : <span className="text-ink-soft">Descartado</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

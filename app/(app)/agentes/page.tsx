import Link from "next/link"
import { getMember } from "@/lib/session"
import { sql } from "@/lib/sql"
import { aiBlocker, aiSettings } from "@/lib/ai/state"
import { AgentToggle } from "@/components/mike/agent-toggle"

export default async function AgentsPage() {
  const { studio, role } = await getMember()
  const settings = await aiSettings(studio.id)
  const blocker = await aiBlocker(studio.id)
  const [{ pending }] = await sql<{ pending: string }>`select count(*) as pending from ai_suggestions where studio_id = ${studio.id} and status = 'pendiente'`
  const admin = role === "admin"

  const agents = [
    {
      id: "mike" as const, name: "Mike, el asistente del estudio", enabled: settings.enabled, href: "/agentes/mike", open: "/mike",
      text: "Preguntale por el panorama de tus causas, pedile que redacte un escrito o que te arme la agenda. Acá ajustás todo lo que sabe: su identidad, la base de conocimiento, la jurisprudencia y qué vigila.",
    },
    {
      id: "vencimientos" as const, name: "Agente de vencimientos", enabled: settings.deadline_agent, href: "/agentes/vencimientos", open: "/agentes/vencimientos",
      text: "Lee las actuaciones nuevas que llegan de los tribunales y detecta plazos y vencimientos. Propone; vos revisás y decidís.",
      extra: Number(pending) ? `${pending} propuesta(s) para revisar` : "Al día",
    },
  ]

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Agentes de IA</h1>
        <p className="text-sm text-ink-soft">Asistentes que trabajan sobre tus causas. Ellos detectan y proponen; vos revisás y decidís.</p>
      </div>
      {blocker && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{blocker}</p>}
      {agents.map((a) => (
        <section key={a.id} className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium">{a.name}</h2>
              <p className="mt-1 text-sm text-ink-soft">{a.text}</p>
              {a.extra && <p className="mt-2 text-sm font-medium">{a.extra}</p>}
            </div>
            <AgentToggle agent={a.id} enabled={a.enabled} canEdit={admin} />
          </div>
          <div className="mt-3 flex gap-2">
            <Link href={a.open} className="btn">Abrir</Link>
            {a.id === "mike" && admin && <Link href={a.href} className="btn-ghost">Configurar</Link>}
          </div>
        </section>
      ))}
    </div>
  )
}

import Link from "next/link"
import { Sparkles } from "lucide-react"
import { getMember } from "@/lib/session"
import { sql } from "@/lib/sql"
import { one, type Params } from "@/lib/list-params"
import { aiBlocker } from "@/lib/ai/state"
import { blobEnabled } from "@/lib/storage"
import { transcript } from "@/lib/ai/mike"
import { Composer } from "@/components/mike/composer"
import { DeleteConversationButton } from "@/components/mike/delete-conversation"

// Una respuesta con varias consultas puede tardar: se le da margen a la función.
export const maxDuration = 300

const TOOL_LABELS: Record<string, string> = {
  buscar_expedientes: "buscó expedientes", ver_expediente: "leyó un expediente", agenda: "revisó la agenda",
  buscar_clientes: "buscó clientes", crear_tarea: "agendó una tarea", guardar_escrito: "guardó un escrito",
}

export default async function MikePage({ searchParams }: { searchParams: Promise<Params> }) {
  const { studio, user } = await getMember()
  const params = await searchParams
  const conversations = await sql<{ id: string; title: string; updated_at: Date }>`
    select id, title, updated_at from ai_conversations where studio_id = ${studio.id} and user_id = ${user.id} order by updated_at desc limit 50`
  const current = conversations.find((c) => c.id === one(params.c))
  const messages = current ? await transcript(current.id) : []
  const blocker = await aiBlocker(studio.id)
  const ask = one(params.q).slice(0, 20_000)

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <aside className="shrink-0 lg:w-60">
        <Link href="/mike" className="btn mb-3 w-full">+ Nueva conversación</Link>
        <nav className="card divide-y divide-line" aria-label="Conversaciones">
          {conversations.length === 0 && <p className="p-3 text-sm text-ink-soft">Todavía no hablaste con Mike.</p>}
          {conversations.map((c) => (
            <Link key={c.id} href={`/mike?c=${c.id}`} className={`block truncate px-3 py-2 text-sm ${c.id === current?.id ? "bg-brand-soft font-medium text-brand" : "hover:bg-paper"}`}>
              {c.title}
            </Link>
          ))}
        </nav>
      </aside>

      <section className="min-w-0 flex-1 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 font-serif text-3xl"><Sparkles className="text-brand" aria-hidden /> {current?.title ?? "Mike"}</h1>
          {current && <DeleteConversationButton id={current.id} />}
        </div>
        {!current && <p className="text-ink-soft">Preguntale por el panorama de tus causas, pedile que redacte un escrito o que te arme la agenda de la semana.</p>}

        <ol className="space-y-3" aria-live="polite">
          {messages.map((m) => (
            <li key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
              <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-brand text-white" : "card"}`}>
                {m.attachments?.length ? <div className="mb-1 text-xs opacity-80">📎 {m.attachments.join(", ")}</div> : null}
                {m.tools?.length ? <div className="mb-1 text-xs text-ink-soft">Mike {[...new Set(m.tools.map((t) => TOOL_LABELS[t] ?? t))].join(", ")}.</div> : null}
                {m.text}
              </div>
            </li>
          ))}
        </ol>

        <Composer key={current?.id ?? "nueva"} conversationId={current?.id} initial={!current ? ask : undefined} autoSend={!current && Boolean(ask)} disabledReason={blocker} studioId={studio.id} blob={blobEnabled} />
        <p className="text-xs text-ink-soft">Mike puede equivocarse: verificá plazos, citas y datos antes de presentar un escrito.</p>
      </section>
    </div>
  )
}

import Link from "next/link"
import { requireAdmin } from "@/lib/session"
import { sql } from "@/lib/sql"
import { aiSettings } from "@/lib/ai/state"
import { addKnowledge, saveAiSettings } from "@/lib/actions/mike"
import { ActionForm } from "@/components/action-form"
import { DeleteKnowledgeButton } from "@/components/mike/delete-knowledge"

export default async function MikeSettingsPage() {
  const { studio } = await requireAdmin()
  const settings = await aiSettings(studio.id)
  const knowledge = await sql<{ id: string; kind: string; title: string; size: number; created_at: Date }>`
    select id, kind, title, length(content) as size, created_at from ai_knowledge where studio_id = ${studio.id} order by kind, created_at desc`

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/agentes" className="text-sm text-ink-soft hover:underline">← Agentes de IA</Link>
        <h1 className="font-serif text-3xl">Mike de tu estudio</h1>
      </div>

      <ActionForm action={saveAiSettings} submit="Guardar" className="card space-y-4 p-5">
        <div>
          <label className="label" htmlFor="identity">Identidad y criterios</label>
          <textarea id="identity" name="identity" rows={6} maxLength={10_000} defaultValue={settings.identity ?? ""} className="input"
            placeholder="Ej.: Somos un estudio laboralista que representa trabajadores en Córdoba Capital y el interior. Firmamos como Dra. … Preferimos escritos concisos…" />
        </div>
        <div>
          <label className="label" htmlFor="watch">Qué vigilar</label>
          <textarea id="watch" name="watch" rows={3} maxLength={5_000} defaultValue={settings.watch ?? ""} className="input"
            placeholder="Ej.: Avisar si una causa lleva más de 6 meses sin movimiento; priorizar audiencias de conciliación." />
        </div>
      </ActionForm>

      <section className="card space-y-4 p-5" aria-labelledby="kb">
        <div>
          <h2 id="kb" className="text-lg font-medium">Base de conocimiento y jurisprudencia</h2>
          <p className="text-sm text-ink-soft">Modelos de escritos, criterios internos y fallos que Mike tiene que conocer. Se le pasan como contexto en cada consulta.</p>
        </div>
        <ActionForm action={addKnowledge} submit="Agregar" className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="title">Título</label>
              <input id="title" name="title" required maxLength={200} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="kind">Tipo</label>
              <select id="kind" name="kind" className="input"><option value="conocimiento">Conocimiento</option><option value="jurisprudencia">Jurisprudencia</option></select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="content">Contenido</label>
            <textarea id="content" name="content" rows={5} className="input" placeholder="Pegá el texto, o subí un archivo .txt / .md abajo." />
          </div>
          <input type="file" name="file" accept=".txt,.md,text/plain,text/markdown" aria-label="Archivo de texto" className="text-sm" />
        </ActionForm>
        <ul className="divide-y divide-line">
          {knowledge.length === 0 && <li className="py-2 text-sm text-ink-soft">Todavía no cargaste nada.</li>}
          {knowledge.map((k) => (
            <li key={k.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="rounded bg-paper px-1.5 text-xs">{k.kind === "jurisprudencia" ? "Jurisprudencia" : "Conocimiento"}</span>
              <span className="flex-1">{k.title}</span>
              <span className="text-xs text-ink-soft">{Math.ceil(Number(k.size) / 1000)} mil caracteres</span>
              <DeleteKnowledgeButton id={k.id} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { acceptSuggestion, dismissSuggestion } from "@/lib/actions/mike"

export type Suggestion = { id: string; title: string; due_date: string; rationale: string | null; matter_id: string; caption: string; activity: string | null }

/** Una propuesta del agente: se puede corregir la fecha antes de aceptarla. */
export function SuggestionCard({ s, showMatter = true }: { s: Suggestion; showMatter?: boolean }) {
  const [date, setDate] = useState(s.due_date)
  const [pending, start] = useTransition()
  const [error, setError] = useState("")
  const run = (fn: () => Promise<{ error?: string } | void>) => start(async () => {
    try { setError((await fn())?.error ?? "") } catch { setError("No se pudo. Recargá la página: puede que ya la haya resuelto otra persona.") }
  })
  return (
    <li className="card space-y-2 p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-medium">{s.title}</div>
          {showMatter && <Link href={`/expedientes/${s.matter_id}`} className="text-ink-soft hover:underline">{s.caption}</Link>}
        </div>
        <label className="flex items-center gap-2 text-xs">Vence
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input w-auto py-1" />
        </label>
      </div>
      {s.activity && <p className="text-xs text-ink-soft">Por la actuación: {s.activity}</p>}
      {s.rationale && <p className="text-ink-soft">{s.rationale}</p>}
      <div className="flex gap-2">
        <button className="btn" disabled={pending} onClick={() => run(() => acceptSuggestion(s.id, date))}>Agendar vencimiento</button>
        <button className="btn-ghost" disabled={pending} onClick={() => run(() => dismissSuggestion(s.id))}>Descartar</button>
      </div>
      {error && <p role="alert" className="text-danger">{error}</p>}
    </li>
  )
}

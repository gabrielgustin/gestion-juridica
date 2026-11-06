"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { setTaskStatus } from "@/lib/actions/tasks"

type Card = { id: string; title: string; when: string; status_id: string | null; overdue: boolean; matter: string | null; color: string | null }
type Column = { id: string; label: string; statuses: { id: string; name: string }[] }

/** Tablero por categoría de estado. Arrastrar una tarjeta (o usar su menú) le cambia el estado. */
export function Kanban({ columns, cards, statusCategory }: { columns: Column[]; cards: Card[]; statusCategory: Record<string, string> }) {
  const [items, setItems] = useState(cards)
  const [error, setError] = useState("")
  const [, start] = useTransition()
  const allStatuses = columns.flatMap((c) => c.statuses)

  const move = (cardId: string, statusId: string | null) => {
    setItems((list) => list.map((c) => (c.id === cardId ? { ...c, status_id: statusId } : c)))
    start(async () => {
      try { await setTaskStatus(cardId, statusId); setError("") } catch (e) { setError(e instanceof Error ? e.message : "No se pudo mover.") }
    })
  }
  const columnOf = (card: Card) => (card.status_id ? statusCategory[card.status_id] ?? "inactivo" : "alerta")

  return (
    <div>
      {error && <p role="alert" className="mb-2 text-sm text-danger">{error}</p>}
      <div className="grid gap-3 md:grid-cols-5">
        {columns.map((col) => {
          const target = col.id === "alerta" ? null : col.statuses[0]?.id
          const canDrop = col.id === "alerta" || Boolean(target)
          return (
            <section key={col.id} aria-label={col.label} className="min-h-40 rounded-lg bg-line/40 p-2"
              onDragOver={(e) => canDrop && e.preventDefault()}
              onDrop={(e) => { const id = e.dataTransfer.getData("text/plain"); if (id && canDrop) move(id, target ?? null) }}>
              <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-ink-soft">
                {col.label} · {items.filter((c) => columnOf(c) === col.id).length}
              </h2>
              <ul className="space-y-2">
                {items.filter((c) => columnOf(c) === col.id).map((card) => (
                  <li key={card.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", card.id)}
                    className="card cursor-grab border-l-4 p-2 text-sm" style={{ borderLeftColor: card.color ?? "#64748b" }}>
                    <Link href={`/calendario/${card.id}`} className="font-medium hover:underline">{card.title}</Link>
                    <div className={`text-xs ${card.overdue ? "text-danger" : "text-ink-soft"}`}>{card.when}{card.overdue ? " · Retrasada" : ""}</div>
                    {card.matter && <div className="truncate text-xs text-ink-soft">{card.matter}</div>}
                    <select aria-label={`Estado de ${card.title}`} value={card.status_id ?? ""} onChange={(e) => move(card.id, e.target.value || null)}
                      className="mt-1 w-full rounded border border-line bg-white px-1 py-0.5 text-xs">
                      <option value="">Sin estado (alerta)</option>
                      {allStatuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}

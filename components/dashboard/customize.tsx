"use client"

import { useState, useTransition } from "react"
import { ArrowDown, ArrowUp } from "lucide-react"
import { DEFAULT_WIDGETS, WIDGETS, type WidgetId } from "@/lib/dashboard"
import { saveWidgets, setOnboardingHidden } from "@/lib/actions/dashboard"

/** "Personalizar": elegir qué paneles ver y en qué orden. */
export function Customize({ selected }: { selected: WidgetId[] }) {
  const [open, setOpen] = useState(false)
  const [order, setOrder] = useState<WidgetId[]>([...selected, ...DEFAULT_WIDGETS.filter((id) => !selected.includes(id))])
  const [on, setOn] = useState<Set<WidgetId>>(new Set(selected))
  const [pending, start] = useTransition()

  const move = (index: number, delta: number) => setOrder((list) => {
    const next = [...list]
    const [item] = next.splice(index, 1)
    next.splice(index + delta, 0, item)
    return next
  })
  const save = (list: WidgetId[]) => start(async () => { await saveWidgets(list); setOpen(false) })

  return (
    <div className="relative">
      <button type="button" className="btn-ghost" aria-expanded={open} onClick={() => setOpen(!open)}>Personalizar</button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 w-[calc(100vw-2rem)] max-w-80 sm:left-auto sm:right-0 rounded-lg border border-line bg-white p-3 shadow-lg">
          <p className="mb-2 text-sm text-ink-soft">Elegí qué paneles ver y ordenalos.</p>
          <ul className="space-y-1">
            {order.map((id, i) => {
              const w = WIDGETS.find((x) => x.id === id)!
              return (
                <li key={id} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-paper">
                  <label className="flex min-w-0 flex-1 items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-0.5" checked={on.has(id)}
                      onChange={(e) => setOn((s) => { const n = new Set(s); if (e.target.checked) n.add(id); else n.delete(id); return n })} />
                    <span><span className="font-medium">{w.label}</span><span className="block text-xs text-ink-soft">{w.hint}</span></span>
                  </label>
                  <button type="button" aria-label={`Subir ${w.label}`} disabled={i === 0} className="rounded p-1 hover:bg-line disabled:opacity-30" onClick={() => move(i, -1)}><ArrowUp size={14} /></button>
                  <button type="button" aria-label={`Bajar ${w.label}`} disabled={i === order.length - 1} className="rounded p-1 hover:bg-line disabled:opacity-30" onClick={() => move(i, 1)}><ArrowDown size={14} /></button>
                </li>
              )
            })}
          </ul>
          <div className="mt-3 flex justify-between gap-2">
            <button type="button" className="text-sm text-ink-soft hover:underline" disabled={pending} onClick={() => save(DEFAULT_WIDGETS)}>Restablecer</button>
            <button type="button" className="btn" disabled={pending} onClick={() => save(order.filter((id) => on.has(id)))}>Guardar</button>
          </div>
        </div>
      )}
    </div>
  )
}

export function HideOnboarding() {
  const [pending, start] = useTransition()
  return (
    <button type="button" className="text-sm text-ink-soft hover:underline" disabled={pending} onClick={() => start(() => setOnboardingHidden(true))}>
      Ocultar por ahora
    </button>
  )
}

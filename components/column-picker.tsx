"use client"

import { useEffect, useState } from "react"

/**
 * "Editar columnas": oculta columnas de la tabla `tableId` (celdas con data-col) y lo recuerda en este navegador.
 */
export function ColumnPicker({ tableId, columns }: { tableId: string; columns: { key: string; label: string }[] }) {
  const storageKey = `cols:${tableId}`
  const [hidden, setHidden] = useState<string[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try { setHidden(JSON.parse(localStorage.getItem(storageKey) ?? "[]")) } catch {}
  }, [storageKey])

  const toggle = (key: string) => {
    const next = hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key]
    setHidden(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch {}
  }

  return (
    <div className="relative">
      <style>{hidden.map((k) => `#${tableId} [data-col="${k}"]{display:none}`).join("")}</style>
      <button type="button" className="btn-ghost" aria-expanded={open} onClick={() => setOpen(!open)}>Editar columnas</button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 w-52 sm:left-auto sm:right-0 rounded-md border border-line bg-white p-2 shadow">
          {columns.map((c) => (
            <label key={c.key} className="flex items-center gap-2 px-1 py-1 text-sm">
              <input type="checkbox" checked={!hidden.includes(c.key)} onChange={() => toggle(c.key)} /> {c.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

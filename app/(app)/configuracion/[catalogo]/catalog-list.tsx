"use client"

import { useState, useTransition } from "react"
import type { CatalogKind, TaskCategory } from "@/lib/catalogs"
import { ActionForm } from "@/components/action-form"
import { addCatalogItem, deleteCatalogItem, updateCatalogItem, type ActionResult } from "../actions"

export type Item = { id: string; name: string; color: string; active: boolean; category: TaskCategory | null; source?: string | null }

function Row({ item, canEdit, locked }: { item: Item; canEdit: boolean; locked?: boolean }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState("")
  const save = (fn: () => Promise<ActionResult | void>) => start(async () => setError((await fn())?.error ?? ""))

  return (
    <li className={`flex flex-wrap items-center gap-3 p-3 ${item.active ? "" : "opacity-60"}`}>
      <input type="color" aria-label={`Color de ${item.name}`} defaultValue={item.color} disabled={!canEdit || pending}
        className="h-8 w-8 cursor-pointer rounded border border-line"
        onBlur={(e) => e.target.value !== item.color && save(() => updateCatalogItem(item.id, { color: e.target.value }))} />
      <input aria-label="Nombre" defaultValue={item.name} disabled={!canEdit || pending} maxLength={80} className="input min-w-0 flex-1"
        onBlur={(e) => {
          const name = e.target.value.trim()
          if (!name) e.target.value = item.name
          else if (name !== item.name) save(() => updateCatalogItem(item.id, { name }))
        }} />
      {canEdit && !locked && (
        <>
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" role="switch" checked={item.active} disabled={pending}
              onChange={(e) => save(() => updateCatalogItem(item.id, { active: e.target.checked }))} />
            Activo
          </label>
          <button className="text-sm text-danger hover:underline" disabled={pending}
            onClick={() => confirm(`¿Borrar «${item.name}»?`) && save(() => deleteCatalogItem(item.id))}>Borrar</button>
        </>
      )}
      {error && <p role="alert" className="w-full text-sm text-danger">{error}</p>}
    </li>
  )
}

export function CatalogList({ kind, category, items, canEdit, locked }: { kind: CatalogKind; category?: TaskCategory; items: Item[]; canEdit: boolean; locked?: boolean }) {
  return (
    <div className="card">
      {items.length === 0 && <p className="p-3 text-sm text-ink-soft">Sin elementos.</p>}
      <ul className="divide-y divide-line">{items.map((item) => <Row key={item.id} item={item} canEdit={canEdit} locked={locked} />)}</ul>
      {canEdit && !locked && (
        <ActionForm action={addCatalogItem} submit="+ Agregar" className="flex flex-wrap items-center gap-3 border-t border-line p-3">
          <input type="hidden" name="kind" value={kind} />
          {category && <input type="hidden" name="category" value={category} />}
          <input type="color" name="color" defaultValue="#64748b" aria-label="Color" className="h-8 w-8 cursor-pointer rounded border border-line" />
          <input name="name" placeholder="Nuevo" aria-label="Nombre nuevo" required maxLength={80} className="input min-w-0 flex-1" />
        </ActionForm>
      )}
    </div>
  )
}

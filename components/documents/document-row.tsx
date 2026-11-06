"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { FileText, Star } from "lucide-react"
import { formatSize } from "@/lib/storage-paths"
import { moveDocument, purgeDocument, renameDocument, restoreDocument, setWrit, toggleStar, trashDocument } from "@/lib/actions/documents"

export type DocRow = {
  id: string; name: string; size: number; content_type: string | null; created_at: string; is_writ: boolean; starred: boolean
  deleted: boolean; entity: string | null; entity_id: string | null; folder_name: string | null; folder_path: string | null; uploader: string | null; provider?: string | null
}

export function DocumentRow({ doc, folders }: { doc: DocRow; folders: { value: string; label: string }[] }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState("")
  const [moving, setMoving] = useState(false)
  const run = (fn: () => Promise<{ error?: string } | void>) => start(async () => {
    setError("")
    try { setError((await fn())?.error ?? "") } catch { setError("No se pudo completar.") }
  })

  return (
    <li className="flex flex-wrap items-center gap-3 p-3 text-sm">
      <FileText size={18} className="shrink-0 text-ink-soft" aria-hidden />
      <div className="min-w-0 flex-1">
        <a href={`/api/documentos/${doc.id}`} target="_blank" rel="noopener" className="font-medium hover:underline">{doc.name}</a>
        {doc.provider && <span className="ml-2 rounded bg-paper px-1.5 text-xs text-ink-soft">{doc.provider === "dropbox" ? "Dropbox" : "Google Drive"}</span>}
        {doc.is_writ && <span className="ml-2 rounded bg-brand-soft px-1.5 text-xs text-brand">Escrito</span>}
        <div className="text-xs text-ink-soft">
          {doc.provider === "drive" || doc.provider === "dropbox" ? "Vinculado" : formatSize(doc.size)} · {new Date(doc.created_at).toLocaleDateString("es-AR")}{doc.uploader ? ` · ${doc.uploader}` : ""}
          {doc.folder_name && <> · <Link href={doc.folder_path!} className="hover:underline">{doc.folder_name}</Link></>}
        </div>
        {moving && (
          <select autoFocus aria-label="Mover a" className="input mt-1 w-auto" defaultValue={doc.entity ? `${doc.entity}:${doc.entity_id}` : ""}
            onChange={(e) => { const [entity, id] = e.target.value.split(":"); setMoving(false); run(() => moveDocument(doc.id, entity || null, id || null)) }}>
            <option value="">Sin vincular</option>
            {folders.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        )}
        {error && <p role="alert" className="text-danger">{error}</p>}
      </div>
      {doc.deleted ? (
        <div className="flex gap-2">
          <button className="btn-ghost" disabled={pending} onClick={() => run(() => restoreDocument(doc.id))}>Restaurar</button>
          <button className="btn-ghost text-danger" disabled={pending} onClick={() => confirm("Se borra el archivo para siempre. ¿Seguir?") && run(() => purgeDocument(doc.id))}>Borrar</button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          <button className="rounded p-1.5 hover:bg-paper" disabled={pending} aria-pressed={doc.starred} aria-label={doc.starred ? "Quitar de destacados" : "Destacar"} onClick={() => run(() => toggleStar(doc.id))}>
            <Star size={16} className={doc.starred ? "fill-amber-400 text-amber-500" : "text-ink-soft"} />
          </button>
          {(!doc.provider || doc.provider === "gdrive") && <a className="btn-ghost px-2 py-1" href={`/api/documentos/${doc.id}?descargar=1`}>Descargar</a>}
          <details className="relative">
            <summary className="btn-ghost cursor-pointer list-none px-2 py-1">Más</summary>
            <div className="absolute right-0 z-20 mt-1 flex w-44 flex-col rounded-md border border-line bg-white p-1 shadow">
              <button className="rounded px-2 py-1 text-left hover:bg-paper" onClick={() => { const n = prompt("Nuevo nombre", doc.name); if (n) run(() => renameDocument(doc.id, n)) }}>Renombrar</button>
              <button className="rounded px-2 py-1 text-left hover:bg-paper" onClick={() => setMoving(true)}>Mover a…</button>
              <button className="rounded px-2 py-1 text-left hover:bg-paper" onClick={() => run(() => setWrit(doc.id, !doc.is_writ))}>{doc.is_writ ? "No es un escrito" : "Marcar como escrito"}</button>
              <button className="rounded px-2 py-1 text-left text-danger hover:bg-paper" onClick={() => run(() => trashDocument(doc.id))}>Mandar a la papelera</button>
            </div>
          </details>
        </div>
      )}
    </li>
  )
}

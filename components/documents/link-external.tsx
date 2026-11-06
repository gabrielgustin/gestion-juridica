"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Link2 } from "lucide-react"
import { linkExternalDocuments } from "@/lib/actions/documents"

const DROPBOX_KEY = process.env.NEXT_PUBLIC_DROPBOX_APP_KEY

/** Cargar el selector oficial de Dropbox (Chooser) solo cuando se usa. */
function loadDropbox(): Promise<any> {
  const w = window as any
  if (w.Dropbox) return Promise.resolve(w.Dropbox)
  return new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = "https://www.dropbox.com/static/api/2/dropins.js"
    script.id = "dropboxjs"
    script.dataset.appKey = DROPBOX_KEY!
    script.onload = () => resolve(w.Dropbox)
    script.onerror = reject
    document.head.appendChild(script)
  })
}

/** Vincular archivos de Google Drive o Dropbox: pegando el link, o eligiéndolos con el selector de Dropbox. */
export function LinkExternal({ entity, entityId }: { entity?: string; entityId?: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState("")
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const [pending, start] = useTransition()

  const save = (links: { url: string; name?: string }[]) => start(async () => {
    setError("")
    try {
      const result = await linkExternalDocuments({ links, entity, entityId })
      if (result?.error) { setError(result.error); return }
      setUrl(""); setName(""); setOpen(false)
      router.refresh()
    } catch {
      setError("No se pudo vincular.")
    }
  })

  async function chooseDropbox() {
    try {
      const Dropbox = await loadDropbox()
      Dropbox.choose({ linkType: "preview", multiselect: true, success: (files: { link: string; name: string }[]) => save(files.map((f) => ({ url: f.link, name: f.name }))) })
    } catch {
      setError("No se pudo abrir Dropbox.")
    }
  }

  return (
    <div className="text-sm">
      <div className="flex flex-wrap gap-3">
        <button type="button" className="inline-flex items-center gap-1 text-brand hover:underline" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Link2 size={14} aria-hidden /> Vincular de Google Drive o Dropbox
        </button>
        {DROPBOX_KEY && <button type="button" className="text-brand hover:underline" disabled={pending} onClick={chooseDropbox}>Elegir en Dropbox</button>}
      </div>
      {open && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} type="url" placeholder="https://drive.google.com/… o https://www.dropbox.com/…" aria-label="Link del archivo" className="input min-w-64 flex-1" />
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={255} placeholder="Nombre (opcional)" aria-label="Nombre" className="input w-48" />
          <button type="button" className="btn" disabled={pending || !url} onClick={() => save([{ url, name }])}>Vincular</button>
        </div>
      )}
      {error && <p role="alert" className="mt-1 text-danger">{error}</p>}
    </div>
  )
}

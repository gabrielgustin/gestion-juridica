"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Upload } from "lucide-react"
import { registerDocument } from "@/lib/actions/documents"
import { registerDriveDocument, startDriveUpload } from "@/lib/actions/drive"
import { ALLOWED_TYPES, MAX_FILE_BYTES, safeFileName, studioPrefix } from "@/lib/storage-paths"

const randomFolder = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("")

/** Subida de documentos (arrastrar o elegir). Con Blob sube directo desde el navegador; en local, por /api/documentos/subir. */
export function Uploader({ studioId, blob, drive, entity, entityId, isWrit, compact }: {
  studioId: string; blob: boolean; drive?: boolean; entity?: string; entityId?: string; isWrit?: boolean; compact?: boolean
}) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const [over, setOver] = useState(false)

  async function uploadOne(file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) throw new Error(`Tipo de archivo no permitido: ${file.name}`)
    if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} pesa más de 100 MB.`)
    if (drive) return uploadToDrive(file)
    const pathname = `${studioPrefix(studioId)}${randomFolder()}/${safeFileName(file.name)}`
    if (blob) {
      const { upload } = await import("@vercel/blob/client")
      await upload(pathname, file, { access: "private", handleUploadUrl: "/api/documentos/token", contentType: file.type })
    } else {
      const form = new FormData()
      form.set("file", file)
      form.set("pathname", pathname)
      const response = await fetch("/api/documentos/subir", { method: "POST", body: form })
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? `No se pudo subir ${file.name}.`)
    }
    const result = await registerDocument({ pathname, name: file.name, contentType: file.type, entity, entityId, isWrit })
    if (result?.error) throw new Error(result.error)
  }

  /** Drive: el servidor abre la subida y el navegador manda el archivo directo a Google. */
  async function uploadToDrive(file: File) {
    const started = await startDriveUpload({ name: file.name, contentType: file.type, size: file.size, entity, entityId })
    if (!started.url) throw new Error(started.error ?? `No se pudo subir ${file.name}.`)
    const response = await fetch(started.url, { method: "PUT", headers: { "Content-Type": file.type }, body: file })
    if (!response.ok) throw new Error(`Google Drive no aceptó ${file.name}.`)
    const { id } = await response.json()
    const result = await registerDriveDocument({ fileId: id, entity, entityId, isWrit })
    if (result?.error) throw new Error(result.error)
  }

  async function handle(files: FileList | null) {
    if (!files?.length) return
    setError("")
    const list = Array.from(files)
    for (const [i, file] of list.entries()) {
      setBusy(`Subiendo ${i + 1} de ${list.length}…`)
      try { await uploadOne(file) } catch (e) { setError(e instanceof Error ? e.message : `No se pudo subir ${file.name}.`) }
    }
    setBusy("")
    if (input.current) input.current.value = ""
    router.refresh()
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void handle(e.dataTransfer.files) }}
        className={`flex items-center justify-center gap-2 rounded-lg border-2 border-dashed text-sm ${compact ? "p-3" : "p-6"} ${over ? "border-brand bg-brand-soft" : "border-line"}`}>
        <Upload size={16} aria-hidden />
        {busy || <>Arrastrá archivos acá o <button type="button" className="text-brand underline" onClick={() => input.current?.click()}>elegilos</button></>}
        <input ref={input} type="file" multiple hidden accept={ALLOWED_TYPES.join(",")} onChange={(e) => void handle(e.target.files)} />
      </div>
      {error && <p role="alert" className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  )
}

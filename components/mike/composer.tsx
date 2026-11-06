"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Mic, MicOff, Paperclip, Send, X } from "lucide-react"
import { sendMessage } from "@/lib/actions/mike"
import { safeFileName, studioPrefix } from "@/lib/storage-paths"

const TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"]
const MAX_BYTES = 10 * 1024 * 1024
const MAX_FILES = 4

/** Caja para escribirle a Mike: adjuntos (arrastrar o elegir), dictado por voz y Enter para enviar. */
export function Composer({ conversationId, initial, autoSend, disabledReason, compact, studioId, blob }: {
  conversationId?: string; initial?: string; autoSend?: boolean; disabledReason?: string | null; compact?: boolean; studioId: string; blob: boolean
}) {
  const router = useRouter()
  const [text, setText] = useState(initial ?? "")
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState("")
  const [pending, start] = useTransition()
  const [sent, setSent] = useState("")
  const [listening, setListening] = useState(false)
  const recognition = useRef<any>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const autoSent = useRef(false)

  function addFiles(list: FileList | null) {
    setError("")
    const next = [...files]
    for (const f of Array.from(list ?? [])) {
      if (!TYPES.includes(f.type)) { setError(`${f.name}: solo PDF o imágenes.`); continue }
      if (f.size > MAX_BYTES) { setError(`${f.name} pesa más de 10 MB.`); continue }
      if (next.length >= MAX_FILES) { setError(`Hasta ${MAX_FILES} archivos por mensaje.`); break }
      next.push(f)
    }
    setFiles(next)
  }

  function submit(value = text) {
    if (!value.trim() || pending || disabledReason) return
    const form = new FormData()
    form.set("text", value)
    if (conversationId) form.set("conversationId", conversationId)
    const toSend = files
    setSent(value)
    setText("")
    setFiles([])
    setError("")
    start(async () => {
      try {
        for (const f of toSend) {
          if (!blob) { form.append("files", f); continue }
          // En producción el archivo va directo a Blob (privado) y el servidor lo toma desde ahí.
          const rand = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("")
          const pathname = `${studioPrefix(studioId)}chat-${rand}/${safeFileName(f.name)}`
          const { upload } = await import("@vercel/blob/client")
          await upload(pathname, f, { access: "private", handleUploadUrl: "/api/documentos/token", contentType: f.type })
          form.append("blobs", JSON.stringify({ pathname, name: f.name, type: f.type }))
        }
      } catch {
        setSent(""); setText(value); setFiles(toSend); setError("No se pudieron subir los adjuntos.")
        return
      }
      const result = await sendMessage(form)
      setSent("")
      if (result.error) { setError(result.error); if (!result.conversationId) setText(value) }
      if (result.conversationId && result.conversationId !== conversationId) router.push(`/mike?c=${result.conversationId}`)
      else router.refresh()
    })
  }

  useEffect(() => {
    if (autoSend && initial && !autoSent.current) { autoSent.current = true; submit(initial) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleDictation() {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SR) { setError("Tu navegador no permite dictar. Probá con Chrome."); return }
    if (listening) { recognition.current?.stop(); return }
    const r = new SR()
    r.lang = "es-AR"
    r.continuous = true
    r.interimResults = false
    r.onresult = (e: any) => {
      const said = Array.from(e.results).slice(e.resultIndex).map((res: any) => res[0].transcript).join(" ")
      setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}${said.trim()}`)
    }
    r.onend = () => setListening(false)
    r.onerror = () => setListening(false)
    recognition.current = r
    r.start()
    setListening(true)
  }

  return (
    <div>
      {sent && (
        <div className="mb-3 space-y-2">
          <div className="ml-auto max-w-[85%] rounded-lg bg-brand px-3 py-2 text-sm whitespace-pre-wrap text-white">{sent}</div>
          <div className="text-sm text-ink-soft" role="status">Mike está pensando…</div>
        </div>
      )}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files) }}
        className="rounded-lg border border-line bg-white p-2 focus-within:border-brand">
        {files.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {files.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded bg-paper px-2 py-0.5 text-xs">
                {f.name}
                <button type="button" aria-label={`Quitar ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}><X size={12} /></button>
              </span>
            ))}
          </div>
        )}
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={compact ? 2 : 3} maxLength={20_000}
          placeholder={disabledReason ?? "Preguntale lo que necesites: una causa, un plazo, un escrito."} disabled={Boolean(disabledReason)}
          aria-label="Mensaje para Mike" className="w-full resize-none px-1 text-sm outline-none disabled:bg-white"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit() } }} />
        <div className="flex items-center gap-1">
          <button type="button" className="rounded p-1.5 text-ink-soft hover:bg-paper" aria-label="Adjuntar" title="PDF o imágenes · hasta 10 MB · 4 por mensaje"
            disabled={Boolean(disabledReason)} onClick={() => fileInput.current?.click()}><Paperclip size={16} /></button>
          <input ref={fileInput} type="file" multiple hidden accept={TYPES.join(",")} onChange={(e) => { addFiles(e.target.files); e.target.value = "" }} />
          <button type="button" className={`rounded p-1.5 hover:bg-paper ${listening ? "text-danger" : "text-ink-soft"}`} aria-pressed={listening}
            aria-label={listening ? "Dejar de dictar" : "Dictar"} disabled={Boolean(disabledReason)} onClick={toggleDictation}>
            {listening ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
          <span className="ml-2 hidden text-xs text-ink-soft sm:inline">Enter para enviar · Shift+Enter para un salto de línea</span>
          <button type="button" className="btn ml-auto px-3 py-1.5" disabled={pending || !text.trim() || Boolean(disabledReason)} onClick={() => submit()} aria-label="Enviar">
            <Send size={14} />
          </button>
        </div>
      </div>
      {error && <p role="alert" className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  )
}

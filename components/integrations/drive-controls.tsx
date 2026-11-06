"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { disconnectDriveNow, syncDriveNow } from "@/lib/actions/drive"

export function DriveControls({ canDisconnect }: { canDisconnect: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [message, setMessage] = useState("")
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn-ghost" disabled={pending} onClick={() => start(async () => {
        setMessage("")
        const result = await syncDriveNow().catch(() => ({ error: "No se pudo sincronizar." }))
        setMessage("error" in result && result.error ? result.error : `Listo: ${"count" in result ? result.count : 0} archivo(s) en la carpeta.`)
        router.refresh()
      })}>{pending ? "Sincronizando…" : "Sincronizar ahora"}</button>
      {canDisconnect && (
        <button className="btn-ghost text-danger" disabled={pending}
          onClick={() => confirm("Se desconecta Drive de la app. Tus archivos siguen en tu Drive, pero dejan de verse acá. ¿Seguir?") && start(() => disconnectDriveNow())}>
          Desconectar
        </button>
      )}
      {message && <span role="status" className="text-sm text-ink-soft">{message}</span>}
    </div>
  )
}

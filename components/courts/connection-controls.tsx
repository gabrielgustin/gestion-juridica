"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { disconnect, syncNow } from "@/lib/actions/courts"

export function ConnectionControls({ id, syncing }: { id: string; syncing: boolean }) {
  const [pending, start] = useTransition()
  const router = useRouter()
  return (
    <div className="flex flex-wrap gap-2">
      <button className="btn-ghost" disabled={pending || syncing} onClick={() => start(async () => { await syncNow(id); setTimeout(() => router.refresh(), 2500) })}>
        {syncing ? "Sincronizando…" : "Sincronizar ahora"}
      </button>
      <button className="btn-ghost text-danger" disabled={pending}
        onClick={() => confirm("Se borra la conexión y tu contraseña guardada. Las causas quedan en el estudio. ¿Seguir?") && start(() => disconnect(id))}>
        Desconectar
      </button>
    </div>
  )
}

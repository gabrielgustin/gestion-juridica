"use client"

import { useTransition } from "react"
import { disconnectGoogleCalendar } from "@/lib/actions/courts"

export function DisconnectGoogle() {
  const [pending, start] = useTransition()
  return (
    <button className="btn-ghost text-danger" disabled={pending}
      onClick={() => confirm("Se borra el calendario «Estudio» de tu cuenta de Google y se revoca el acceso. ¿Seguir?") && start(() => disconnectGoogleCalendar())}>
      Desconectar
    </button>
  )
}

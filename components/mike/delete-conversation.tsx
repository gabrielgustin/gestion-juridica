"use client"

import { useTransition } from "react"
import { deleteConversation } from "@/lib/actions/mike"

export function DeleteConversationButton({ id }: { id: string }) {
  const [pending, start] = useTransition()
  return (
    <button className="btn-ghost text-danger" disabled={pending} onClick={() => confirm("¿Borrar esta conversación?") && start(() => deleteConversation(id))}>
      Borrar
    </button>
  )
}

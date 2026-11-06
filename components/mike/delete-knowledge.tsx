"use client"

import { useTransition } from "react"
import { deleteKnowledge } from "@/lib/actions/mike"

export function DeleteKnowledgeButton({ id }: { id: string }) {
  const [pending, start] = useTransition()
  return (
    <button className="text-xs text-danger hover:underline" disabled={pending} onClick={() => confirm("¿Quitar de la base de conocimiento?") && start(() => deleteKnowledge(id))}>
      Quitar
    </button>
  )
}

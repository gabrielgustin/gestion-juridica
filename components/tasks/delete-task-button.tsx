"use client"

import { useTransition } from "react"
import { deleteTask } from "@/lib/actions/tasks"

export function DeleteTaskButton({ id }: { id: string }) {
  const [pending, start] = useTransition()
  return (
    <button className="btn-ghost text-danger" disabled={pending} onClick={() => confirm("¿Borrar esta tarea?") && start(() => deleteTask(id))}>
      Borrar
    </button>
  )
}

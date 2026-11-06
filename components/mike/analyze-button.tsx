"use client"

import { useState, useTransition } from "react"
import { analyzeMatterNow } from "@/lib/actions/mike"

export function AnalyzeMatterButton({ matterId }: { matterId: string }) {
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<{ error?: string; ok?: string }>()
  return (
    <span className="inline-flex items-center gap-2">
      <button className="text-sm text-brand hover:underline disabled:opacity-50" disabled={pending}
        onClick={() => start(async () => setMessage(await analyzeMatterNow(matterId)))}>
        {pending ? "Buscando plazos…" : "Buscar plazos con IA"}
      </button>
      {message?.error && <span role="alert" className="text-xs text-danger">{message.error}</span>}
      {message?.ok && <span role="status" className="text-xs text-ok">{message.ok}</span>}
    </span>
  )
}

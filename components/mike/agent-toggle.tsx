"use client"

import { useTransition } from "react"
import { setAgentEnabled } from "@/lib/actions/mike"

export function AgentToggle({ agent, enabled, canEdit }: { agent: "mike" | "vencimientos"; enabled: boolean; canEdit: boolean }) {
  const [pending, start] = useTransition()
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" role="switch" checked={enabled} disabled={!canEdit || pending}
        onChange={(e) => start(() => setAgentEnabled(agent, e.target.checked))} />
      {enabled ? "Activo" : "Inactivo"}
    </label>
  )
}

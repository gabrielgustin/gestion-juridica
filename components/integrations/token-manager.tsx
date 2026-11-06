"use client"

import { useState, useTransition } from "react"
import { createApiToken, revokeApiToken } from "@/lib/actions/courts"

type Token = { id: string; name: string; created_at: string; last_used_at: string | null }

export function TokenManager({ tokens, endpoint }: { tokens: Token[]; endpoint: string }) {
  const [name, setName] = useState("")
  const [created, setCreated] = useState("")
  const [error, setError] = useState("")
  const [pending, start] = useTransition()

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Nombre del token (ej. Claude en mi notebook)" aria-label="Nombre del token" className="input min-w-56 flex-1" />
        <button className="btn" disabled={pending || !name.trim()} onClick={() => start(async () => {
          const r = await createApiToken(name)
          setError(r.error ?? ""); setCreated(r.token ?? ""); if (r.token) setName("")
        })}>Crear token</button>
      </div>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {created && (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="font-medium">Copiá el token ahora: no se vuelve a mostrar.</p>
          <code className="block rounded bg-white p-2 break-all">{created}</code>
          <p>En Claude Code:</p>
          <code className="block rounded bg-white p-2 break-all">{`claude mcp add --transport http estudio ${endpoint} --header "Authorization: Bearer ${created}"`}</code>
          <button className="btn-ghost" onClick={() => navigator.clipboard?.writeText(created)}>Copiar token</button>
        </div>
      )}
      {tokens.length > 0 && (
        <ul className="divide-y divide-line rounded-md border border-line">
          {tokens.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 p-2">
              <span className="flex-1">{t.name}</span>
              <span className="text-xs text-ink-soft">Último uso: {t.last_used_at ? new Date(t.last_used_at).toLocaleString("es-AR") : "nunca"}</span>
              <button className="text-xs text-danger hover:underline" disabled={pending}
                onClick={() => confirm(`¿Revocar «${t.name}»? Deja de funcionar al instante.`) && start(() => revokeApiToken(t.id))}>Revocar</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

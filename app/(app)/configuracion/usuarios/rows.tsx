"use client"

import { useState, useTransition } from "react"
import { ROLES, type Role } from "@/lib/onboarding"
import { revokeInvite, setMemberActive, setMemberRole } from "../actions"

function useSafeAction() {
  const [pending, start] = useTransition()
  const [error, setError] = useState("")
  const run = (fn: () => Promise<{ error?: string } | void>) =>
    start(async () => {
      setError("")
      try { setError((await fn())?.error ?? "") } catch { setError("No se pudo guardar.") }
    })
  return { pending, error, run }
}

const roleLabel = (r: Role) => ROLES.find((x) => x.id === r)?.label ?? r

export function MemberRow({ member, isSelf, canEdit }: {
  member: { user_id: string; name: string; email: string; role: Role; active: boolean }
  isSelf: boolean
  canEdit: boolean
}) {
  const { pending, error, run } = useSafeAction()
  const editable = canEdit && !isSelf
  return (
    <div className={`flex flex-wrap items-center gap-3 p-4 ${member.active ? "" : "opacity-60"}`}>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{member.name}{isSelf && <span className="text-ink-soft"> · vos</span>}</div>
        <div className="truncate text-sm text-ink-soft">{member.email}</div>
        {error && <div role="alert" className="text-sm text-danger">{error}</div>}
      </div>
      {editable ? (
        <select aria-label={`Rol de ${member.name}`} className="input w-auto" value={member.role} disabled={pending}
          onChange={(e) => run(() => setMemberRole(member.user_id, e.target.value as Role))}>
          {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      ) : <span className="text-sm">{roleLabel(member.role)}</span>}
      {editable ? (
        <button className="btn-ghost" disabled={pending} onClick={() => run(() => setMemberActive(member.user_id, !member.active))}>
          {member.active ? "Desactivar" : "Activar"}
        </button>
      ) : <span className="text-sm text-ink-soft">{member.active ? "Activo" : "Inactivo"}</span>}
    </div>
  )
}

export function InviteRow({ invite, canEdit }: { invite: { id: string; email: string; role: Role }; canEdit: boolean }) {
  const { pending, run } = useSafeAction()
  return (
    <div className="flex flex-wrap items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        <div className="truncate">{invite.email}</div>
        <div className="text-sm text-ink-soft">Invitación pendiente · {roleLabel(invite.role)}</div>
      </div>
      {canEdit && <button className="btn-ghost" disabled={pending} onClick={() => run(() => revokeInvite(invite.id))}>Cancelar invitación</button>}
    </div>
  )
}

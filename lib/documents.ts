import "server-only"
import { headers } from "next/headers"
import { getAuth } from "@/lib/auth"
import { query, sql } from "@/lib/sql"
import { planOf } from "@/lib/plans"
import type { Member } from "@/lib/session"
import type { Role } from "@/lib/onboarding"

export type DocEntity = "matter" | "client" | "court" | "task"
export const DOC_ENTITIES: Record<DocEntity, { table: string; label: string; plural: string; nameCol: string; path: string }> = {
  matter: { table: "matters", label: "Expediente", plural: "Expedientes", nameCol: "caption", path: "/expedientes" },
  client: { table: "clients", label: "Cliente", plural: "Clientes", nameCol: "name", path: "/clientes" },
  court: { table: "courts", label: "Juzgado", plural: "Juzgados", nameCol: "name", path: "/juzgados" },
  task: { table: "tasks", label: "Tarea", plural: "Tareas", nameCol: "title", path: "/calendario" },
}
export const isDocEntity = (value: unknown): value is DocEntity => typeof value === "string" && value in DOC_ENTITIES

/** Para route handlers: el miembro activo o null (sin redirigir). */
export async function memberOrNull(): Promise<Pick<Member, "studio" | "user"> | null> {
  const session = await (await getAuth()).api.getSession({ headers: await headers() })
  if (!session) return null
  const [row] = await sql<{ id: string; name: string; logo: string | null; plan: string; role: Role }>`
    select s.id, s.name, s.logo, s.plan, m.role from members m join studios s on s.id = m.studio_id
    where m.user_id = ${session.user.id} and m.active and s.deleted_at is null limit 1`
  if (!row) return null
  return {
    studio: { id: row.id, name: row.name, logo: row.logo, plan: row.plan },
    user: { id: session.user.id, name: session.user.name, email: session.user.email },
  }
}

/** Bytes usados por los documentos subidos (incluye la papelera: siguen ocupando lugar hasta borrarlos). */
export async function storageUsed(studioId: string, source: "upload" | "tribunal" = "upload") {
  const [{ total }] = await sql<{ total: string }>`select coalesce(sum(size), 0) as total from documents where studio_id = ${studioId} and source = ${source}`
  return Number(total)
}

export async function hasRoomFor(studioId: string, plan: string, bytes: number) {
  return (await storageUsed(studioId)) + bytes <= planOf(plan).storageMb * 1024 * 1024
}

/** La entidad existe y es del estudio. */
export async function ownsEntity(studioId: string, entity: DocEntity, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false
  return (await query(`select 1 from ${DOC_ENTITIES[entity].table} where id = $1 and studio_id = $2`, [id, studioId])).length > 0
}

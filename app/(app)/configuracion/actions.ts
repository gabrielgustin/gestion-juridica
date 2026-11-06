"use server"

import { randomBytes } from "node:crypto"
import { resolveTxt } from "node:dns/promises"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { sql } from "@/lib/sql"
import { requireAdmin } from "@/lib/session"
import { CATALOGS, COLOR_RE, TASK_CATEGORIES, type CatalogKind } from "@/lib/catalogs"
import { DOMAIN_RE, PUBLIC_EMAIL_DOMAINS, type Role } from "@/lib/onboarding"
import { linkMail, sendMail } from "@/lib/mail"
import { planOf } from "@/lib/plans"

export type ActionResult = { error?: string; ok?: string } | undefined

const role = z.enum(["admin", "abogado", "asistente"])
const kind = z.enum(Object.keys(CATALOGS) as [CatalogKind, ...CatalogKind[]])
const category = z.enum(TASK_CATEGORIES.map((c) => c.id) as ["inactivo", "activo", "completado", "finalizado"])
const color = z.string().regex(COLOR_RE)
const MAX_LOGO = 2 * 1024 * 1024

// ---------- Estudio ----------

export async function updateStudio(_: ActionResult, form: FormData): Promise<ActionResult> {
  const { studio } = await requireAdmin()
  const name = String(form.get("name") ?? "").trim()
  if (!name || name.length > 120) return { error: "Poné un nombre de hasta 120 caracteres." }

  const logo = form.get("logo")
  let logoData: string | undefined
  if (logo instanceof File && logo.size > 0) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(logo.type)) return { error: "El logo tiene que ser PNG, JPG o WebP." }
    if (logo.size > MAX_LOGO) return { error: "El logo pesa más de 2 MB." }
    // shortcut: el logo (máx. 2 MB) se guarda como data URL en la base; pasarlo a Blob si se suman más imágenes de marca.
    logoData = `data:${logo.type};base64,${Buffer.from(await logo.arrayBuffer()).toString("base64")}`
  }
  if (form.get("removeLogo") === "1") logoData = ""

  if (logoData === undefined) await sql`update studios set name = ${name} where id = ${studio.id}`
  else await sql`update studios set name = ${name}, logo = ${logoData || null} where id = ${studio.id}`
  revalidatePath("/", "layout")
  return { ok: "Guardado." }
}

export async function deleteStudio(_: ActionResult, form: FormData): Promise<ActionResult> {
  const { studio } = await requireAdmin()
  if (String(form.get("confirm") ?? "").trim() !== studio.name) return { error: "Escribí el nombre exacto del estudio para confirmar." }
  // Baja lógica: no se borra nada, se puede recuperar poniendo deleted_at en null.
  await sql`update studios set deleted_at = now() where id = ${studio.id}`
  redirect("/sin-acceso")
}

// ---------- Usuarios ----------

export async function inviteUser(_: ActionResult, form: FormData): Promise<ActionResult> {
  const { studio, user } = await requireAdmin()
  const parsed = z.object({ email: z.string().trim().toLowerCase().email(), role }).safeParse({ email: form.get("email"), role: form.get("role") })
  if (!parsed.success) return { error: "Revisá el email y el rol." }
  const { email, role: inviteRole } = parsed.data

  const [existing] = await sql<{ user_id: string }>`
    select m.user_id from members m join "user" u on u.id = m.user_id where m.studio_id = ${studio.id} and lower(u.email) = ${email}`
  if (existing) return { error: "Esa persona ya es parte del estudio." }
  const [{ count }] = await sql<{ count: string }>`
    select (select count(*) from members where studio_id = ${studio.id} and active)
         + (select count(*) from invitations where studio_id = ${studio.id} and email <> ${email}) as count`
  if (Number(count) >= planOf(studio.plan).users) return { error: "Llegaste al límite de usuarios de tu plan." }

  await sql`insert into invitations (studio_id, email, role) values (${studio.id}, ${email}, ${inviteRole})
    on conflict (studio_id, email) do update set role = excluded.role`
  const origin = process.env.BETTER_AUTH_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:4700")
  await sendMail(email, `${user.name} te invitó a ${studio.name}`,
    linkMail(`${user.name} te sumó a <b>${studio.name}</b>. Entrá con Google o con este mismo email.`, `${origin}/login`, "Entrar al estudio"))
  revalidatePath("/configuracion/usuarios")
  return { ok: `Invitación enviada a ${email}.` }
}

export async function revokeInvite(id: string) {
  const { studio } = await requireAdmin()
  await sql`delete from invitations where id = ${id} and studio_id = ${studio.id}`
  revalidatePath("/configuracion/usuarios")
}

async function hasAnotherAdmin(studioId: string, userId: string) {
  const [{ count }] = await sql<{ count: string }>`
    select count(*) from members where studio_id = ${studioId} and role = 'admin' and active and user_id <> ${userId}`
  return Number(count) > 0
}
const LAST_ADMIN = { error: "El estudio necesita al menos un administrador activo." }

export async function setMemberRole(userId: string, newRole: Role) {
  const { studio, user } = await requireAdmin()
  role.parse(newRole)
  if (userId === user.id) return { error: "No podés cambiar tu propio rol." }
  if (newRole !== "admin" && !(await hasAnotherAdmin(studio.id, userId))) return LAST_ADMIN
  await sql`update members set role = ${newRole} where studio_id = ${studio.id} and user_id = ${userId}`
  revalidatePath("/configuracion/usuarios")
}

export async function setMemberActive(userId: string, active: boolean) {
  const { studio, user } = await requireAdmin()
  if (userId === user.id) return { error: "No podés desactivarte a vos mismo." }
  if (!active && !(await hasAnotherAdmin(studio.id, userId))) return LAST_ADMIN
  await sql`update members set active = ${active} where studio_id = ${studio.id} and user_id = ${userId}`
  // Cierra las sesiones abiertas de quien se desactiva.
  if (!active) await sql`delete from "session" where "userId" = ${userId}`
  revalidatePath("/configuracion/usuarios")
}

// ---------- Dominios ----------

export async function addDomain(_: ActionResult, form: FormData): Promise<ActionResult> {
  const { studio } = await requireAdmin()
  const domain = String(form.get("domain") ?? "").trim().toLowerCase().replace(/^@/, "")
  if (!DOMAIN_RE.test(domain)) return { error: "Ese dominio no es válido (ej. miestudio.com.ar)." }
  if (PUBLIC_EMAIL_DOMAINS.has(domain)) return { error: "Los dominios de correo públicos no se pueden reclamar." }
  const token = `estudio-verificacion=${randomBytes(12).toString("hex")}`
  const rows = await sql`insert into domains (studio_id, domain, token) values (${studio.id}, ${domain}, ${token}) on conflict (domain) do nothing returning id`
  if (!rows.length) return { error: "Ese dominio ya está registrado." }
  revalidatePath("/configuracion/dominios")
  return { ok: "Agregado. Cargá el registro TXT y tocá Verificar." }
}

export async function verifyDomain(id: string): Promise<ActionResult> {
  const { studio } = await requireAdmin()
  const [row] = await sql<{ domain: string; token: string }>`select domain, token from domains where id = ${id} and studio_id = ${studio.id}`
  if (!row) return { error: "No encontramos ese dominio." }
  const records = await resolveTxt(row.domain).catch(() => [] as string[][])
  if (!records.some((parts) => parts.join("") === row.token)) return { error: "Todavía no vemos el registro TXT. El DNS puede tardar hasta unas horas." }
  await sql`update domains set verified_at = now() where id = ${id}`
  revalidatePath("/configuracion/dominios")
  return { ok: "Dominio verificado." }
}

export async function removeDomain(id: string) {
  const { studio } = await requireAdmin()
  await sql`delete from domains where id = ${id} and studio_id = ${studio.id}`
  revalidatePath("/configuracion/dominios")
}

// ---------- Catálogos ----------

const revalidateCatalog = (k: CatalogKind) => revalidatePath(`/configuracion/${CATALOGS[k].slug}`)

export async function addCatalogItem(_: ActionResult, form: FormData): Promise<ActionResult> {
  const { studio } = await requireAdmin()
  const parsed = z.object({
    kind,
    name: z.string().trim().min(1).max(80),
    color,
    category: category.optional(),
  }).safeParse({ kind: form.get("kind"), name: form.get("name"), color: form.get("color"), category: form.get("category") || undefined })
  if (!parsed.success) return { error: "Poné un nombre." }
  const { kind: k, name, color: c, category: cat } = parsed.data
  if (k === "estado_tarea" && !cat) return { error: "Elegí la categoría." }
  const rows = await sql`
    insert into catalog_items (studio_id, kind, name, color, category, sort)
    values (${studio.id}, ${k}, ${name}, ${c}, ${cat ?? null},
      (select coalesce(max(sort), -1) + 1 from catalog_items where studio_id = ${studio.id} and kind = ${k}))
    on conflict (studio_id, kind, name) where source is null do nothing returning id`
  if (!rows.length) return { error: "Ya existe uno con ese nombre." }
  revalidateCatalog(k)
  return { ok: "Agregado." }
}

const patch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  color: color.optional(),
  active: z.boolean().optional(),
  category: category.optional(),
})

export async function updateCatalogItem(id: string, changes: z.infer<typeof patch>) {
  const { studio } = await requireAdmin()
  const parsed = patch.safeParse(changes)
  if (!parsed.success) return { error: "Valor inválido." }
  const { name, color: c, active, category: cat } = parsed.data
  try {
    const [row] = await sql<{ kind: CatalogKind }>`
      update catalog_items set
        name = coalesce(${name ?? null}, name),
        color = coalesce(${c ?? null}, color),
        active = coalesce(${active ?? null}::boolean, active),
        category = case when kind = 'estado_tarea' then coalesce(${cat ?? null}, category) else category end
      where id = ${id} and studio_id = ${studio.id} returning kind`
    if (row) revalidateCatalog(row.kind)
  } catch {
    return { error: "Ya existe uno con ese nombre." }
  }
}

export async function deleteCatalogItem(id: string) {
  const { studio } = await requireAdmin()
  const [own] = await sql<{ source: string | null }>`select source from catalog_items where id = ${id} and studio_id = ${studio.id}`
  if (own?.source) return { error: "Los estados que informa un tribunal no se borran: podés renombrarlos o cambiarles el color." }
  const [usage] = await sql<{ n: string }>`
    select (select count(*) from matters where ${id} in (fuero_id, estado_id, etapa_id, parte_id))
         + (select count(*) from clients where type_id = ${id})
         + (select count(*) from courts where type_id = ${id})
         + (select count(*) from taggings where tag_id = ${id})
         + (select count(*) from tasks where ${id} in (calendar_id, status_id)) as n`
  if (Number(usage.n) > 0) return { error: `Lo usan ${usage.n} registro(s). Desactivalo en lugar de borrarlo.` }
  const [row] = await sql<{ kind: CatalogKind }>`delete from catalog_items where id = ${id} and studio_id = ${studio.id} returning kind`
  if (row) revalidateCatalog(row.kind)
}

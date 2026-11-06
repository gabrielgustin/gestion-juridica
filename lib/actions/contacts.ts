"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { getMember } from "@/lib/session"
import { query, sql, transaction } from "@/lib/sql"
import { CONTACTS, type ContactEntity } from "@/lib/contacts"
import { formIds, formText, setLinks } from "@/lib/entities"
import type { ActionResult } from "@/app/(app)/configuracion/actions"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Alta o edición de un cliente o juzgado (según `entity`). Con `id` edita. */
export async function saveContact(entity: ContactEntity, id: string | null, _: ActionResult, form: FormData): Promise<ActionResult> {
  const { studio } = await getMember()
  const config = CONTACTS[entity]
  const name = formText(form, "name", 200)
  if (!name) return { error: "El nombre es obligatorio." }
  const values: Record<string, string | null> = {}
  for (const field of config.fields) values[field.key] = formText(form, field.key, field.type === "textarea" ? 5000 : 300)
  if (values.email && !EMAIL_RE.test(values.email)) return { error: "El email no es válido." }
  const typeId = formText(form, "type_id")
  const active = form.get("active") !== "0"

  const savedId = await transaction(async (tx) => {
    // El tipo tiene que ser un ítem del catálogo de este estudio.
    const [type] = typeId
      ? await tx.query<{ id: string }>(`select id from catalog_items where id = $1 and studio_id = $2 and kind = $3`, [typeId, studio.id, config.typeKind])
      : []
    const keys = config.fields.map((f) => f.key)
    const params = [name, type?.id ?? null, active, ...keys.map((k) => values[k])]
    let rowId = id
    if (id) {
      const set = ["name", "type_id", "active", ...keys].map((k, i) => `${k} = $${i + 1}`).join(", ")
      const rows = await tx.query(`update ${config.table} set ${set} where id = $${params.length + 1} and studio_id = $${params.length + 2} returning id`, [...params, id, studio.id])
      if (!rows.length) throw new Error("No encontramos ese registro.")
    } else {
      const cols = ["studio_id", "name", "type_id", "active", ...keys]
      const [row] = await tx.query<{ id: string }>(
        `insert into ${config.table} (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
        [studio.id, ...params],
      )
      rowId = row.id
    }
    await setLinks(tx, studio.id, entity, rowId!, formIds(form, "assignees"), formIds(form, "tags"))
    return rowId!
  })

  revalidatePath(config.path)
  if (!id) redirect(`${config.path}/${savedId}`)
  revalidatePath(`${config.path}/${id}`)
  return { ok: "Guardado." }
}

export async function deleteContact(entity: ContactEntity, id: string): Promise<ActionResult> {
  const { studio } = await getMember()
  const config = CONTACTS[entity]
  const [usage] = await query<{ n: string }>(`select ${config.mattersCount.replaceAll("x.id", "$1::uuid")} as n`, [id])
  if (Number(usage.n) > 0) return { error: `Tiene ${usage.n} expediente(s) vinculados. Desactivalo en lugar de borrarlo.` }
  const deleted = await query(`delete from ${config.table} where id = $1 and studio_id = $2 returning id`, [id, studio.id])
  if (!deleted.length) return { error: "No encontramos ese registro." }
  await sql`update documents set entity = null, entity_id = null where entity = ${entity} and entity_id = ${id}`
  await sql`delete from assignments where entity = ${entity} and entity_id = ${id}`
  await sql`delete from taggings where entity = ${entity} and entity_id = ${id}`
  revalidatePath(config.path)
  redirect(config.path)
}

import Link from "next/link"
import { notFound } from "next/navigation"
import { getMember } from "@/lib/session"
import { query, sql } from "@/lib/sql"
import { CONTACTS, type ContactEntity } from "@/lib/contacts"
import { loadLinks } from "@/lib/entities"
import { ContactForm } from "./contact-form"
import { DeleteContactButton } from "./delete-button"
import { EntityDocuments } from "@/components/documents/entity-documents"

export async function ContactDetail({ entity, id }: { entity: ContactEntity; id: string }) {
  const { studio } = await getMember()
  const config = CONTACTS[entity]
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const [record] = await query(`select * from ${config.table} where id = $1 and studio_id = $2`, [id, studio.id])
  if (!record) notFound()
  const links = (await loadLinks(entity, [id])).get(id)!
  const matters = entity === "client"
    ? await sql<{ id: string; caption: string; archived: boolean }>`
        select m.id, m.caption, m.archived from matters m join matter_clients mc on mc.matter_id = m.id
        where mc.client_id = ${id} and m.deleted_at is null order by m.updated_at desc`
    : await sql<{ id: string; caption: string; archived: boolean }>`
        select id, caption, archived from matters where court_id = ${id} and deleted_at is null order by updated_at desc`

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={config.path} className="text-sm text-ink-soft hover:underline">← {config.plural}</Link>
          <h1 className="font-serif text-3xl">{record.name}</h1>
        </div>
        <DeleteContactButton entity={entity} id={id} />
      </div>
      <ContactForm entity={entity} record={record} links={links} />
      <EntityDocuments entity={entity} id={id} />
      <div className="card max-w-3xl p-5">
        <h2 className="mb-2 font-medium">Expedientes ({matters.length})</h2>
        {matters.length === 0 && <p className="text-sm text-ink-soft">Sin expedientes vinculados.</p>}
        <ul className="divide-y divide-line">
          {matters.map((m) => (
            <li key={m.id} className="py-2 text-sm">
              <Link href={`/expedientes/${m.id}`} className="hover:underline">{m.caption}</Link>
              {m.archived && <span className="ml-2 text-xs text-ink-soft">Archivado</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

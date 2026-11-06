import Link from "next/link"
import { Folder } from "lucide-react"
import { getMember } from "@/lib/session"
import { query } from "@/lib/sql"
import { DOC_ENTITIES, isDocEntity, storageUsed, type DocEntity } from "@/lib/documents"
import { blobEnabled } from "@/lib/storage"
import { planOf } from "@/lib/plans"
import { one, type Params } from "@/lib/list-params"
import { DocumentList, type DocView } from "@/components/documents/document-list"
import { Uploader } from "@/components/documents/uploader"
import { LinkExternal } from "@/components/documents/link-external"
import { formatSize } from "@/lib/storage-paths"

const VIEWS: { id: DocView; label: string }[] = [
  { id: "recientes", label: "Inicio" }, { id: "escritos", label: "Escritos" }, { id: "sin-vincular", label: "Sin vincular" },
  { id: "destacados", label: "Destacados" }, { id: "papelera", label: "Papelera" },
]

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { studio, user } = await getMember()
  const params = await searchParams
  const folderEntity = isDocEntity(one(params.carpeta)) ? (one(params.carpeta) as DocEntity) : null
  const folderId = /^[0-9a-f-]{36}$/i.test(one(params.id)) ? one(params.id) : null
  const view: DocView = folderEntity ? "carpeta" : (VIEWS.find((v) => v.id === one(params.vista))?.id ?? "recientes")
  const q = one(params.q).trim().slice(0, 100)

  const counts = await query<{ entity: DocEntity; n: string }>(
    `select entity, count(distinct entity_id) as n from documents where studio_id = $1 and deleted_at is null and entity is not null group by entity`, [studio.id])
  const folderCount = (e: DocEntity) => Number(counts.find((c) => c.entity === e)?.n ?? 0)
  const used = await storageUsed(studio.id)
  const total = planOf(studio.plan).storageMb * 1024 * 1024

  let title = VIEWS.find((v) => v.id === view)?.label ?? "Documentos"
  let folders: { id: string; name: string; n: string }[] = []
  if (folderEntity && !folderId) {
    const meta = DOC_ENTITIES[folderEntity]
    title = meta.plural
    folders = await query(
      `select x.id, x.${meta.nameCol} as name, count(d.id) as n from ${meta.table} x
       join documents d on d.entity = $2 and d.entity_id = x.id and d.deleted_at is null
       where x.studio_id = $1 group by x.id order by max(d.created_at) desc limit 300`,
      [studio.id, folderEntity],
    )
  } else if (folderEntity && folderId) {
    const meta = DOC_ENTITIES[folderEntity]
    const [row] = await query<{ name: string }>(`select ${meta.nameCol} as name from ${meta.table} where id = $1 and studio_id = $2`, [folderId, studio.id])
    title = row?.name ?? "Carpeta"
  }

  const navLink = (href: string, label: string, active: boolean, extra?: string) => (
    <Link href={href} className={`flex justify-between rounded px-2 py-1.5 text-sm ${active ? "bg-brand-soft font-medium text-brand" : "hover:bg-paper"}`}>
      <span>{label}</span>{extra && <span className="text-xs text-ink-soft">{extra}</span>}
    </Link>
  )

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <aside className="shrink-0 space-y-4 lg:w-56">
        <nav className="card p-2" aria-label="Documentos">
          {VIEWS.slice(0, 1).map((v) => navLink("/documentos", v.label, view === "recientes"))}
          <div className="label mt-3 px-2">Carpetas</div>
          {(Object.keys(DOC_ENTITIES) as DocEntity[]).map((e) =>
            navLink(`/documentos?carpeta=${e}`, DOC_ENTITIES[e].plural, folderEntity === e, `${folderCount(e)}`))}
          <div className="label mt-3 px-2">Vistas</div>
          {VIEWS.slice(1).map((v) => navLink(`/documentos?vista=${v.id}`, v.label, view === v.id))}
        </nav>
        <div className="card p-3 text-sm">
          <div className="label">Almacenamiento</div>
          <div>{formatSize(used)} de {formatSize(total)}</div>
          <div className="mt-1 h-1.5 rounded bg-line" role="progressbar" aria-label="Almacenamiento usado" aria-valuenow={Math.round((used / total) * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded bg-brand" style={{ width: `${Math.min(100, (used / total) * 100)}%` }} />
          </div>
        </div>
      </aside>

      <section className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            {folderEntity && folderId && <Link href={`/documentos?carpeta=${folderEntity}`} className="text-sm text-ink-soft hover:underline">← {DOC_ENTITIES[folderEntity].plural}</Link>}
            <h1 className="font-serif text-3xl">{title}</h1>
          </div>
          {folderEntity && folderId && <Link href={`${DOC_ENTITIES[folderEntity].path}/${folderId}`} className="btn-ghost">Abrir {DOC_ENTITIES[folderEntity].label.toLowerCase()}</Link>}
        </div>

        {view !== "papelera" && view !== "destacados" && !(folderEntity && !folderId) && (
          <div className="space-y-2">
            <Uploader studioId={studio.id} blob={blobEnabled} entity={folderEntity ?? undefined} entityId={folderId ?? undefined} isWrit={view === "escritos"} />
            <LinkExternal entity={folderEntity ?? undefined} entityId={folderId ?? undefined} />
          </div>
        )}
        {view === "papelera" && <p className="text-sm text-ink-soft">Los documentos de la papelera siguen ocupando espacio hasta que los borres.</p>}

        {folderEntity && !folderId ? (
          <div className="card">
            {folders.length === 0 && <p className="p-4 text-sm text-ink-soft">Sin carpetas: se crean solas al subir documentos a un {DOC_ENTITIES[folderEntity].label.toLowerCase()}.</p>}
            <ul className="divide-y divide-line">
              {folders.map((f) => (
                <li key={f.id}>
                  <Link href={`/documentos?carpeta=${folderEntity}&id=${f.id}`} className="flex items-center gap-3 p-3 text-sm hover:bg-paper">
                    <Folder size={18} className="text-ink-soft" aria-hidden /><span className="flex-1">{f.name}</span>
                    <span className="text-xs text-ink-soft">{Number(f.n)} archivo{Number(f.n) === 1 ? "" : "s"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            <form action="/documentos" className="flex gap-2">
              {Object.entries(params).filter(([k]) => k !== "q").map(([k, v]) => <input key={k} type="hidden" name={k} value={one(v)} />)}
              <input name="q" defaultValue={q} placeholder="Buscar por nombre" aria-label="Buscar documentos" className="input max-w-sm" />
            </form>
            <div className="card">
              <DocumentList studioId={studio.id} userId={user.id} view={view} entity={folderEntity ?? undefined} entityId={folderId ?? undefined} q={q}
                empty={view === "papelera" ? "La papelera está vacía." : view === "destacados" ? "Todavía no destacaste documentos." : undefined} />
            </div>
          </>
        )}
      </section>
    </div>
  )
}

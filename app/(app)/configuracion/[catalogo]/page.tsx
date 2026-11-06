import { notFound } from "next/navigation"
import { getMember } from "@/lib/session"
import { sql, transaction } from "@/lib/sql"
import { CONNECTORS } from "@/lib/courts/portals"
import { ensureCourtState } from "@/lib/courts/engine"
import { CATALOGS, TASK_CATEGORIES, kindFromSlug } from "@/lib/catalogs"
import { CatalogList, type Item } from "./catalog-list"

export default async function CatalogPage({ params }: { params: Promise<{ catalogo: string }> }) {
  const kind = kindFromSlug((await params).catalogo)
  if (!kind) notFound()
  const { studio, role } = await getMember()
  // Los estados que informa cada tribunal aparecen desde el principio, para poder ajustarlos antes de conectar.
  if (kind === "estado") await transaction(async (tx) => {
    for (const portal of CONNECTORS) for (const st of portal.knownStates) await ensureCourtState(tx, studio.id, portal.id, st.code, st.label)
  })
  const items = await sql<Item>`
    select id, name, color, active, category, source from catalog_items where studio_id = ${studio.id} and kind = ${kind} order by sort, name`
  const meta = CATALOGS[kind]
  const canEdit = role === "admin"

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="text-lg font-medium">{meta.label}</h2>
        <p className="text-sm text-ink-soft">{meta.hint}</p>
      </div>
      {kind === "estado_tarea"
        ? TASK_CATEGORIES.map((cat) => (
            <div key={cat.id}>
              <h3 className="font-medium">{cat.label}</h3>
              <p className="mb-2 text-xs text-ink-soft">{cat.hint}</p>
              <CatalogList kind={kind} category={cat.id} items={items.filter((i) => i.category === cat.id)} canEdit={canEdit} />
            </div>
          ))
        : <CatalogList kind={kind} items={items.filter((i) => !i.source)} canEdit={canEdit} />}
      {kind === "estado" && (
        <div className="space-y-4">
          <div>
            <h3 className="font-medium">Los que informan los tribunales</h3>
            <p className="text-sm text-ink-soft">
              Llegan solos con cada sincronización: los define el portal, no el estudio. No se crean ni se borran, pero podés cambiarles
              el color y ponerles un nombre más claro; lo que informa el tribunal se sigue guardando tal cual. Cuando un tribunal informa
              un estado nuevo, reemplaza al que hubiera (incluso uno puesto a mano) y se avisa a los asignados.
            </p>
          </div>
          {CONNECTORS.map((portal) => {
            const own = items.filter((i) => i.source === portal.id)
            return own.length ? (
              <div key={portal.id}>
                <h4 className="label">{portal.label}</h4>
                <CatalogList kind={kind} items={own} canEdit={canEdit} locked />
              </div>
            ) : null
          })}
        </div>
      )}
    </div>
  )
}

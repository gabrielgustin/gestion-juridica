import Link from "next/link"
import { getMember } from "@/lib/session"
import { blobEnabled } from "@/lib/storage"
import { connectionOf } from "@/lib/integrations/drive"
import type { DocEntity } from "@/lib/documents"
import { DocumentList } from "./document-list"
import { Uploader } from "./uploader"
import { LinkExternal } from "./link-external"

/** Sección "Documentos" dentro de la ficha de un expediente, cliente, juzgado o tarea. */
export async function EntityDocuments({ entity, id }: { entity: DocEntity; id: string }) {
  const { studio, user } = await getMember()
  const driveOn = Boolean(await connectionOf(studio.id))
  return (
    <section className="card max-w-3xl p-5" aria-labelledby={`docs-${id}`}>
      <div className="mb-3 flex items-center justify-between">
        <h2 id={`docs-${id}`} className="font-medium">Documentos</h2>
        <Link href={`/documentos?carpeta=${entity}&id=${id}`} className="text-sm text-brand hover:underline">Abrir carpeta</Link>
      </div>
      <Uploader studioId={studio.id} blob={blobEnabled} drive={driveOn} entity={entity} entityId={id} compact />
      <div className="mt-2"><LinkExternal entity={entity} entityId={id} /></div>
      <div className="-mx-3 mt-2">
        <DocumentList studioId={studio.id} userId={user.id} view="carpeta" entity={entity} entityId={id} empty="Sin documentos." />
      </div>
    </section>
  )
}

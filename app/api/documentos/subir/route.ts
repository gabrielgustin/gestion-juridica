import { NextResponse } from "next/server"
import { hasRoomFor, memberOrNull } from "@/lib/documents"
import { blobEnabled, saveLocal } from "@/lib/storage"
import { ALLOWED_TYPES, MAX_FILE_BYTES, isStudioPath } from "@/lib/storage-paths"

// Solo en local (sin Blob): guarda el archivo en ./data/uploads. En producción se sube directo a Blob.
export async function POST(request: Request) {
  if (blobEnabled) return NextResponse.json({ error: "No disponible" }, { status: 404 })
  const member = await memberOrNull()
  if (!member) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const form = await request.formData()
  const file = form.get("file")
  const pathname = String(form.get("pathname") ?? "")
  if (!(file instanceof File)) return NextResponse.json({ error: "Falta el archivo." }, { status: 400 })
  if (!isStudioPath(pathname, member.studio.id)) return NextResponse.json({ error: "Ruta de archivo inválida." }, { status: 400 })
  if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: `Tipo de archivo no permitido: ${file.name}` }, { status: 400 })
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: `${file.name} pesa más de 100 MB.` }, { status: 400 })
  if (!(await hasRoomFor(member.studio.id, member.studio.plan, file.size))) return NextResponse.json({ error: "Te quedaste sin espacio en el plan." }, { status: 400 })
  await saveLocal(pathname, Buffer.from(await file.arrayBuffer()))
  return NextResponse.json({ pathname })
}

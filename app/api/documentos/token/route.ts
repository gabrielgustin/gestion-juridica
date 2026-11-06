import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { NextResponse } from "next/server"
import { hasRoomFor, memberOrNull } from "@/lib/documents"
import { ALLOWED_TYPES, MAX_FILE_BYTES, isStudioPath } from "@/lib/storage-paths"

// Token corto para que el navegador suba directo a Blob (evita el límite de ~4,5 MB de las funciones).
// El registro del documento lo hace después la server action registerDocument, que vuelve a validar todo.
export async function POST(request: Request) {
  const member = await memberOrNull()
  if (!member) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const body = (await request.json()) as HandleUploadBody
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!isStudioPath(pathname, member.studio.id)) throw new Error("Ruta de archivo inválida.")
        if (!(await hasRoomFor(member.studio.id, member.studio.plan, 0))) throw new Error("Te quedaste sin espacio en el plan.")
        return { allowedContentTypes: ALLOWED_TYPES, maximumSizeInBytes: MAX_FILE_BYTES, addRandomSuffix: false }
      },
      onUploadCompleted: async () => {},
    })
    return NextResponse.json(json)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo preparar la subida." }, { status: 400 })
  }
}

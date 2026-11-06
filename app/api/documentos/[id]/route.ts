import { NextResponse } from "next/server"
import { memberOrNull } from "@/lib/documents"
import { sql } from "@/lib/sql"
import { readStored } from "@/lib/storage"

// Tipos que el navegador puede mostrar sin riesgo; el resto siempre se descarga.
const INLINE = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain"])

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await memberOrNull()
  if (!member) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "No encontrado" }, { status: 404 })
  const [doc] = await sql<{ name: string; pathname: string | null; content_type: string | null; external_url: string | null }>`
    select name, pathname, content_type, external_url from documents where id = ${id} and studio_id = ${member.studio.id}`
  if (!doc) return NextResponse.json({ error: "No encontrado" }, { status: 404 })
  // Archivo vinculado de Drive o Dropbox: se abre en su servicio (la URL se validó al vincularlo).
  if (doc.external_url) return NextResponse.redirect(doc.external_url)
  const stream = await readStored(doc.pathname!)
  if (!stream) return NextResponse.json({ error: "El archivo ya no está disponible." }, { status: 410 })

  const type = doc.content_type ?? "application/octet-stream"
  const inline = INLINE.has(type) && !new URL(request.url).searchParams.has("descargar")
  return new Response(stream, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    },
  })
}

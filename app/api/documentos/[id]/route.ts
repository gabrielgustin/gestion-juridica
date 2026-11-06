import { NextResponse } from "next/server"
import { memberOrNull } from "@/lib/documents"
import { sql } from "@/lib/sql"
import { readStored } from "@/lib/storage"
import { connectionOf, openFile } from "@/lib/integrations/drive"

// Tipos que el navegador puede mostrar sin riesgo; el resto siempre se descarga.
const INLINE = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain"])

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await memberOrNull()
  if (!member) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "No encontrado" }, { status: 404 })
  const [doc] = await sql<{ name: string; pathname: string | null; content_type: string | null; external_url: string | null; drive_file_id: string | null }>`
    select name, pathname, content_type, external_url, drive_file_id from documents where id = ${id} and studio_id = ${member.studio.id}`
  if (!doc) return NextResponse.json({ error: "No encontrado" }, { status: 404 })
  // Archivo vinculado de Drive o Dropbox: se abre en su servicio (la URL se validó al vincularlo).
  if (doc.external_url) return NextResponse.redirect(doc.external_url)
  if (doc.drive_file_id) {
    // Archivo guardado en el Drive del estudio: se reenvía en streaming, sin guardarlo en ningún lado.
    const conn = await connectionOf(member.studio.id)
    if (!conn) return NextResponse.json({ error: "Google Drive no está conectado." }, { status: 410 })
    const { response, exported } = await openFile(conn, doc.drive_file_id, doc.content_type ?? "").catch(() => ({ response: null, exported: false }))
    if (!response?.ok || !response.body) return NextResponse.json({ error: "El archivo ya no está disponible en Drive." }, { status: 410 })
    const type = exported ? "application/pdf" : doc.content_type ?? "application/octet-stream"
    const name = exported && !doc.name.toLowerCase().endsWith(".pdf") ? `${doc.name}.pdf` : doc.name
    const inline = INLINE.has(type) && !new URL(request.url).searchParams.has("descargar")
    return new Response(response.body, {
      headers: {
        "Content-Type": type, "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox",
      },
    })
  }
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

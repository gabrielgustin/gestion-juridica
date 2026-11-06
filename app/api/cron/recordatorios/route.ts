import { timingSafeEqual } from "node:crypto"
import { deliverDueReminders } from "@/lib/notifications"
import { sql } from "@/lib/sql"
import { syncFolder } from "@/lib/integrations/drive"

// Vercel Cron llama acá (ver vercel.json) con "Authorization: Bearer $CRON_SECRET".
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const given = Buffer.from(request.headers.get("authorization") ?? "")
  const expected = Buffer.from(`Bearer ${secret}`)
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return Response.json({ error: "No autorizado" }, { status: 401 })
  }
  const sent = await deliverDueReminders()
  // Drive: pone al día Documentos con lo que el estudio movió a mano a su carpeta (cada 15 minutos).
  const studios = await sql<{ studio_id: string }>`select studio_id from studio_drive`
  let drive = 0
  for (const { studio_id } of studios) {
    try { await syncFolder(studio_id); drive++ } catch (e) {
      console.error("[drive] cron", e)
      await sql`update studio_drive set status = 'error', last_error = ${e instanceof Error ? e.message : String(e)} where studio_id = ${studio_id}`
    }
  }
  return Response.json({ sent, drive })
}

import { timingSafeEqual } from "node:crypto"
import { deliverDueReminders } from "@/lib/notifications"

// Vercel Cron llama acá (ver vercel.json) con "Authorization: Bearer $CRON_SECRET".
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const given = Buffer.from(request.headers.get("authorization") ?? "")
  const expected = Buffer.from(`Bearer ${secret}`)
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return Response.json({ error: "No autorizado" }, { status: 401 })
  }
  const sent = await deliverDueReminders()
  return Response.json({ sent })
}

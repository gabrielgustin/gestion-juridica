import { timingSafeEqual } from "node:crypto"
import { after, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { memberOrNull } from "@/lib/documents"
import { backfill, connectCalendar } from "@/lib/integrations/google-calendar"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const back = (status: string) => NextResponse.redirect(new URL(`/integraciones?google=${status}#agenda`, request.url))
  const member = await memberOrNull()
  if (!member) return NextResponse.redirect(new URL("/login", request.url))

  const jar = await cookies()
  const expected = jar.get("gcal_state")?.value ?? ""
  jar.delete("gcal_state")
  const state = url.searchParams.get("state") ?? ""
  if (!expected || expected.length !== state.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(state))) return back("error")
  const code = url.searchParams.get("code")
  if (!code) return back("cancelado")

  try {
    await connectCalendar(member.studio, member.user.id, code)
  } catch (error) {
    console.error("[google-calendar]", error)
    return back("error")
  }
  after(() => backfill(member.studio.id, member.user.id).catch((e) => console.error("[google-calendar] backfill", e)))
  return back("ok")
}

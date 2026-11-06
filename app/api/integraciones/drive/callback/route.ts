import { timingSafeEqual } from "node:crypto"
import { after, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { memberOrNull } from "@/lib/documents"
import { sql } from "@/lib/sql"
import { connectDrive, syncFolder } from "@/lib/integrations/drive"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const back = (status: string) => NextResponse.redirect(new URL(`/integraciones?drive=${status}#almacenamiento`, request.url))
  const member = await memberOrNull()
  if (!member) return NextResponse.redirect(new URL("/login", request.url))
  const [admin] = await sql`select 1 from members where studio_id = ${member.studio.id} and user_id = ${member.user.id} and role = 'admin' and active`
  if (!admin) return back("sin-permiso")

  const jar = await cookies()
  const expected = jar.get("gdrive_state")?.value ?? ""
  jar.delete("gdrive_state")
  const state = url.searchParams.get("state") ?? ""
  if (!expected || expected.length !== state.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(state))) return back("error")
  const code = url.searchParams.get("code")
  if (!code) return back("cancelado")

  try {
    await connectDrive(member.studio, member.user.id, code)
  } catch (error) {
    console.error("[drive]", error)
    return back("error")
  }
  after(() => syncFolder(member.studio.id).catch((e) => console.error("[drive] sync", e)))
  return back("ok")
}

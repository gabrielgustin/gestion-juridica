import { randomBytes } from "node:crypto"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { memberOrNull } from "@/lib/documents"
import { sql } from "@/lib/sql"
import { authUrl, driveEnabled } from "@/lib/integrations/drive"

// Inicia la conexión con Google Drive (solo administradores). El "state" va en una cookie para validar la vuelta (anti-CSRF).
export async function GET(request: Request) {
  const member = await memberOrNull()
  if (!member) return NextResponse.redirect(new URL("/login", request.url))
  const [admin] = await sql`select 1 from members where studio_id = ${member.studio.id} and user_id = ${member.user.id} and role = 'admin' and active`
  if (!admin) return NextResponse.redirect(new URL("/integraciones?drive=sin-permiso#almacenamiento", request.url))
  if (!driveEnabled()) return NextResponse.redirect(new URL("/integraciones?drive=no-configurado#almacenamiento", request.url))
  const state = randomBytes(24).toString("hex")
  ;(await cookies()).set("gdrive_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/" })
  return NextResponse.redirect(authUrl(state))
}

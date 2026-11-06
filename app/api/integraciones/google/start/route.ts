import { randomBytes } from "node:crypto"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { memberOrNull } from "@/lib/documents"
import { authUrl, calendarEnabled } from "@/lib/integrations/google-calendar"

// Inicia la conexión con Google Calendar. El "state" va en una cookie para validar la vuelta (anti-CSRF).
export async function GET(request: Request) {
  const member = await memberOrNull()
  if (!member) return NextResponse.redirect(new URL("/login", request.url))
  if (!calendarEnabled()) return NextResponse.redirect(new URL("/integraciones?google=no-configurado", request.url))
  const state = randomBytes(24).toString("hex")
  ;(await cookies()).set("gcal_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/" })
  return NextResponse.redirect(authUrl(state))
}

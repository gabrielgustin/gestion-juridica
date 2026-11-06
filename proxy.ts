import { NextResponse, type NextRequest } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

// Chequeo optimista: cada página igual valida la sesión real en el servidor (lib/session.ts).
const PUBLIC = ["/login", "/restablecer", "/sin-acceso", "/api/auth", "/api/cron", "/api/mcp"]

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (PUBLIC.some((path) => pathname.startsWith(path))) return NextResponse.next()
  if (getSessionCookie(request)) return NextResponse.next()
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const url = new URL("/login", request.url)
  if (pathname !== "/") url.searchParams.set("next", pathname)
  return NextResponse.redirect(url)
}

export const config = { matcher: ["/((?!_next|favicon.ico|.*\\.[a-z0-9]+$).*)"] }

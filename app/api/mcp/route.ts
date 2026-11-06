import { handleRpc, tokenOwner } from "@/lib/mcp"
import { issuer } from "@/lib/oauth"

// Endpoint MCP: https://<dominio>/api/mcp con "Authorization: Bearer <token personal>" (se crea en Integraciones).
export async function POST(request: Request) {
  const ctx = await tokenOwner(request.headers.get("authorization"))
  if (!ctx) {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Token inválido o revocado." } }, {
      status: 401,
      // resource_metadata: así Claude descubre el login estándar.
      headers: { "WWW-Authenticate": `Bearer realm="estudio-juridico", resource_metadata="${issuer(request)}/.well-known/oauth-protected-resource"` },
    })
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido" } }, { status: 400 })
  }
  if (Array.isArray(body)) return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "No se aceptan lotes" } }, { status: 400 })
  const response = await handleRpc(body as any, ctx)
  // Las notificaciones no llevan respuesta.
  return response ? Response.json(response) : new Response(null, { status: 202 })
}

// Sin stream de eventos del servidor (no hay notificaciones que empujar).
export function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } })
}

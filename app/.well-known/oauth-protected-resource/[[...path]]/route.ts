import { issuer } from "@/lib/oauth"

// Le dice a Claude qué servidor de autorización protege /api/mcp.
export function GET(request: Request) {
  const origin = issuer(request)
  return Response.json({ resource: `${origin}/api/mcp`, authorization_servers: [origin], bearer_methods_supported: ["header"] })
}

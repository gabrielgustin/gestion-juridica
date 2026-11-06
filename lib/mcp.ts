import "server-only"
import { createHash, randomBytes } from "node:crypto"
import { sql } from "@/lib/sql"
import { runTool, TOOLS, type ToolCtx } from "@/lib/ai/tools"

// Conector MCP (transporte Streamable HTTP, respuestas JSON sin streaming).
// Expone las mismas herramientas que usa Mike, siempre limitadas al estudio del token.

export const SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"]

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex")
export const newToken = () => `ej_${randomBytes(32).toString("hex")}`

/** Quién usa el token: estudio activo y miembro activo; si no, null. */
export async function tokenOwner(header: string | null): Promise<ToolCtx | null> {
  const token = header?.match(/^Bearer\s+(ej_[0-9a-f]{64})$/)?.[1]
  if (!token) return null
  const [row] = await sql<{ id: string; studio_id: string; user_id: string; plan: string }>`
    select t.id, t.studio_id, t.user_id, s.plan from api_tokens t
    join studios s on s.id = t.studio_id and s.deleted_at is null
    join members m on m.studio_id = t.studio_id and m.user_id = t.user_id and m.active
    where t.token_hash = ${hashToken(token)} and t.revoked_at is null and (t.expires_at is null or t.expires_at > now())`
  if (!row) return null
  await sql`update api_tokens set last_used_at = now() where id = ${row.id} and (last_used_at is null or last_used_at < now() - interval '1 minute')`
  return { studioId: row.studio_id, userId: row.user_id, plan: row.plan }
}

type JsonRpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: any }
const ok = (id: JsonRpc["id"], result: unknown) => ({ jsonrpc: "2.0", id, result })
const fail = (id: JsonRpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } })

/** Atiende un mensaje JSON-RPC. Devuelve null para notificaciones (no llevan respuesta). */
export async function handleRpc(message: JsonRpc, ctx: ToolCtx) {
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") return fail(null, -32600, "Pedido inválido")
  const isNotification = message.id === undefined
  switch (message.method) {
    case "initialize": {
      const requested = message.params?.protocolVersion
      return ok(message.id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "estudio-juridico", version: "1.0.0" },
        instructions: "Herramientas del estudio jurídico: expedientes, agenda, clientes, tareas y escritos. Los datos son reales: no los inventes.",
      })
    }
    case "ping":
      return ok(message.id, {})
    case "tools/list":
      return ok(message.id, { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.input_schema })) })
    case "tools/call": {
      const name = message.params?.name
      if (typeof name !== "string") return fail(message.id, -32602, "Falta el nombre de la herramienta")
      const { content, isError } = await runTool(name, message.params?.arguments ?? {}, ctx)
      return ok(message.id, { content: [{ type: "text", text: content }], isError })
    }
    default:
      return isNotification ? null : fail(message.id, -32601, `Método no soportado: ${message.method}`)
  }
}

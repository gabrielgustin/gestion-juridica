import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/sql", () => ({ sql: vi.fn(), query: vi.fn() }))
vi.mock("@/lib/ai/tools", () => ({
  TOOLS: [{ name: "agenda", description: "d", input_schema: { type: "object", properties: {} } }],
  runTool: vi.fn(async (name: string) => ({ content: `"ok ${name}"`, isError: false })),
}))

describe("handleRpc", async () => {
  const { handleRpc, hashToken, newToken } = await import("@/lib/mcp")
  const ctx = { studioId: "s", userId: "u", plan: "gratis" }

  it("negocia la versión del protocolo", async () => {
    const r: any = await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }, ctx)
    expect(r.result.protocolVersion).toBe("2025-03-26")
    const r2: any = await handleRpc({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } }, ctx)
    expect(r2.result.protocolVersion).toBe("2025-06-18")
  })

  it("lista y llama herramientas", async () => {
    const list: any = await handleRpc({ jsonrpc: "2.0", id: 3, method: "tools/list" }, ctx)
    expect(list.result.tools[0]).toMatchObject({ name: "agenda", inputSchema: { type: "object" } })
    const call: any = await handleRpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "agenda", arguments: {} } }, ctx)
    expect(call.result).toEqual({ content: [{ type: "text", text: '"ok agenda"' }], isError: false })
  })

  it("notificaciones sin respuesta y métodos desconocidos con error", async () => {
    expect(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, ctx)).toBeNull()
    const r: any = await handleRpc({ jsonrpc: "2.0", id: 5, method: "nada" }, ctx)
    expect(r.error.code).toBe(-32601)
  })

  it("tokens con formato fijo y hash estable", () => {
    expect(newToken()).toMatch(/^ej_[0-9a-f]{64}$/)
    expect(hashToken("a")).toBe(hashToken("a"))
  })
})

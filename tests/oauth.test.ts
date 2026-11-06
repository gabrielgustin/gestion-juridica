import { createHash } from "node:crypto"
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/sql", () => ({ sql: vi.fn(), query: vi.fn() }))

describe("OAuth del conector", async () => {
  const { validRedirect, pkceOk } = await import("@/lib/oauth")

  it("acepta https y localhost, rechaza el resto", () => {
    expect(validRedirect("https://claude.ai/api/mcp/auth_callback")).toBe(true)
    expect(validRedirect("http://localhost:3000/cb")).toBe(true)
    expect(validRedirect("http://evil.com/cb")).toBe(false)
    expect(validRedirect("javascript:alert(1)")).toBe(false)
    expect(validRedirect("https://a.com/cb#frag")).toBe(false)
  })

  it("verifica PKCE S256", () => {
    const verifier = "a".repeat(50)
    const challenge = createHash("sha256").update(verifier).digest("base64url")
    expect(pkceOk(verifier, challenge)).toBe(true)
    expect(pkceOk("b".repeat(50), challenge)).toBe(false)
    expect(pkceOk("corto", challenge)).toBe(false)
  })
})

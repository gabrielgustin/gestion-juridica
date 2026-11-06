import { describe, expect, it } from "vitest"
import { open, seal } from "@/lib/vault"

describe("vault", () => {
  it("cifra y descifra", () => {
    const sealed = seal("clave-secreta-ñ", "conn-1")
    expect(sealed).not.toContain("clave-secreta")
    expect(open(sealed, "conn-1")).toBe("clave-secreta-ñ")
  })
  it("cada cifrado es distinto (IV aleatorio)", () => {
    expect(seal("x")).not.toBe(seal("x"))
  })
  it("no abre con otro contexto ni si se altera", () => {
    const sealed = seal("x", "conn-1")
    expect(() => open(sealed, "conn-2")).toThrow()
    const parts = sealed.split(":")
    parts[3] = Buffer.from("otra cosa").toString("base64")
    expect(() => open(parts.join(":"), "conn-1")).toThrow()
  })
})

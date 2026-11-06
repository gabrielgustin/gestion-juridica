import { describe, expect, it } from "vitest"
import { isStudioPath, safeFileName } from "@/lib/storage-paths"

const studio = "9f534c99-e964-46d7-829a-ea44a37af2dc"

describe("rutas de documentos", () => {
  it("acepta solo rutas del propio estudio", () => {
    expect(isStudioPath(`studios/${studio}/abc123/demanda.pdf`, studio)).toBe(true)
    expect(isStudioPath(`studios/00000000-0000-0000-0000-000000000000/abc/x.pdf`, studio)).toBe(false)
    expect(isStudioPath(`studios/${studio}/../otro/x.pdf`, studio)).toBe(false)
    expect(isStudioPath(`studios/${studio}/a/b/c.pdf`, studio)).toBe(false)
  })

  it("limpia nombres de archivo", () => {
    expect(safeFileName("Contestación de demanda (v2).pdf")).toBe("Contestacion-de-demanda-v2-.pdf")
    expect(safeFileName("../../etc/passwd")).toBe("etc-passwd")
    expect(safeFileName("///")).toBe("archivo")
  })
})

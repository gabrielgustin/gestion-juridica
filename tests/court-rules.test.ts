import { describe, expect, it } from "vitest"
import { courtFileId, nextSyncDelayMinutes, stateChangeNotice } from "@/lib/courts/rules"

describe("stateChangeNotice", () => {
  it("avisa cuando el tribunal pisa un estado puesto a mano", () => {
    expect(stateChangeNotice({ id: "a", name: "En espera", source: null }, "b", "SENTENCIA", "X c/ Y"))
      .toBe("El tribunal informó «SENTENCIA» en «X c/ Y» y reemplazó el estado «En espera».")
  })
  it("no avisa si no había estado, si es el mismo o si venía de otro tribunal", () => {
    expect(stateChangeNotice(null, "b", "S", "c")).toBeNull()
    expect(stateChangeNotice({ id: "b", name: "S", source: null }, "b", "S", "c")).toBeNull()
    expect(stateChangeNotice({ id: "a", name: "EN LETRA", source: "pjn" }, "b", "S", "c")).toBeNull()
  })
})

describe("varios", () => {
  it("reintentos", () => {
    expect(nextSyncDelayMinutes("ok")).toBe(360)
    expect(nextSyncDelayMinutes("error")).toBe(60)
  })
  it("id de archivo", () => {
    expect(courtFileId("pjn", "123/2024", "f1")).toBe("pjn:123/2024:f1")
  })
})

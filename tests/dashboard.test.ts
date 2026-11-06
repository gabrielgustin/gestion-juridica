import { describe, expect, it } from "vitest"
import { cleanWidgets, DEFAULT_WIDGETS } from "@/lib/dashboard"

describe("cleanWidgets", () => {
  it("sin preferencia usa los de fábrica", () => {
    expect(cleanWidgets(null)).toEqual(DEFAULT_WIDGETS)
  })
  it("respeta el orden, descarta desconocidos y repetidos", () => {
    expect(cleanWidgets(["actividad", "x", "agenda", "actividad"])).toEqual(["actividad", "agenda"])
  })
  it("una lista vacía oculta todo", () => {
    expect(cleanWidgets([])).toEqual([])
  })
})

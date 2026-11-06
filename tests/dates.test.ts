import { describe, expect, it } from "vitest"
import { addMonths, hmOf, localToIso, monthGrid, startOfWeek, ymdOf } from "@/lib/dates"

describe("dates", () => {
  it("convierte hora argentina a UTC y vuelve", () => {
    const iso = localToIso("2026-11-05", "22:30")!
    expect(iso).toBe("2026-11-06T01:30:00.000Z")
    expect(ymdOf(iso)).toBe("2026-11-05")
    expect(hmOf(iso)).toBe("22:30")
  })

  it("rechaza fechas y horas inválidas", () => {
    expect(localToIso("2026-13-40")).toBeNull()
    expect(localToIso("2026-11-05", "9")).toBeNull()
  })

  it("arma la grilla de noviembre 2026 de domingo a sábado", () => {
    const grid = monthGrid("2026-11-17")
    expect(grid[0][0]).toBe("2026-11-01") // 1/11/2026 es domingo
    expect(grid.at(-1)!.at(-1)).toBe("2026-12-05")
    expect(grid.every((w) => w.length === 7)).toBe(true)
  })

  it("semana y meses", () => {
    expect(startOfWeek("2026-11-05")).toBe("2026-11-01")
    expect(addMonths("2026-12-31", 1)).toBe("2027-01-01")
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-01")
  })
})

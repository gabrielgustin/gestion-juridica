import { describe, expect, it } from "vitest"
import { isOverdue } from "@/lib/tasks"

const now = new Date("2026-11-05T15:00:00Z")
const past = "2026-11-04T15:00:00Z"
const future = "2026-11-06T15:00:00Z"

describe("isOverdue", () => {
  it("vencida y sin terminar = retrasada", () => {
    expect(isOverdue({ status_id: "s", starts_at: past, ends_at: null, category: "activo" }, now)).toBe(true)
  })
  it("completada o finalizada no se retrasa", () => {
    expect(isOverdue({ status_id: "s", starts_at: past, ends_at: null, category: "completado" }, now)).toBe(false)
    expect(isOverdue({ status_id: "s", starts_at: past, ends_at: null, category: "finalizado" }, now)).toBe(false)
  })
  it("sin estado es alerta, no retrasada", () => {
    expect(isOverdue({ status_id: null, starts_at: past, ends_at: null, category: null }, now)).toBe(false)
  })
  it("usa el fin si lo tiene", () => {
    expect(isOverdue({ status_id: "s", starts_at: past, ends_at: future, category: "inactivo" }, now)).toBe(false)
  })
})

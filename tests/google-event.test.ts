import { describe, expect, it } from "vitest"
import { eventFor } from "@/lib/integrations/google-event"

const base = { id: "t1", title: "Contestar traslado", kind: "vencimiento", description: null, location: null, caption: "X c/ Y", done: false }

describe("eventFor", () => {
  it("todo el día: fechas con fin exclusivo, en hora argentina", () => {
    const e = eventFor({ ...base, all_day: true, starts_at: new Date("2026-11-10T03:00:00Z"), ends_at: null })
    expect(e.start).toEqual({ date: "2026-11-10" })
    expect(e.end).toEqual({ date: "2026-11-11" })
    expect(e.summary).toBe("Vencimiento: Contestar traslado")
    expect(e.description).toContain("Expediente: X c/ Y")
  })
  it("con hora y sin fin dura una hora; las hechas llevan tilde", () => {
    const e = eventFor({ ...base, kind: "tarea", done: true, all_day: false, starts_at: new Date("2026-11-10T12:00:00Z"), ends_at: null })
    expect(e.summary).toBe("✓ Contestar traslado")
    expect(e.end).toMatchObject({ dateTime: "2026-11-10T13:00:00.000Z" })
  })
})

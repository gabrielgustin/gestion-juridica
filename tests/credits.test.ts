import { describe, expect, it } from "vitest"
import { costInPesos, sumUsage } from "@/lib/ai/credits"

describe("costInPesos", () => {
  it("pedido corto: tarifa de hasta 100K tokens", () => {
    // 50K entrada ($0,005) + 10K salida ($0,005) = USD 0,01 → $10 a $1000 por dólar
    expect(costInPesos({ input_tokens: 50_000, output_tokens: 10_000 }, 1000, 1)).toBe(10)
  })
  it("pedido de más de 100K tokens: tarifa 5 veces mayor", () => {
    // 200K entrada ($0,02) + 10K salida ($0,005) = USD 0,025 × 5 = 0,125 → $125
    expect(costInPesos({ input_tokens: 200_000, output_tokens: 10_000 }, 1000, 1)).toBe(125)
  })
  it("cuenta caché y margen", () => {
    // 60K lectura ($0,0006) + 40K escritura ($0,005) = USD 0,0056 × 2 de margen → $11,2
    expect(costInPesos({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 60_000, cache_creation_input_tokens: 40_000 }, 1000, 2)).toBe(11.2)
  })
  it("suma usos", () => {
    expect(sumUsage([{ input_tokens: 1, output_tokens: 2 }, { input_tokens: 3, output_tokens: 4, cache_read_input_tokens: 5 }]))
      .toEqual({ input_tokens: 4, output_tokens: 6, cache_read_input_tokens: 5, cache_creation_input_tokens: 0 })
  })
})

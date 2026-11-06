import { describe, expect, it } from "vitest"
import { costInPesos, sumUsage } from "@/lib/ai/credits"

describe("costInPesos", () => {
  it("1M de entrada + 1M de salida a $1000 por dólar", () => {
    expect(costInPesos({ input_tokens: 1_000_000, output_tokens: 1_000_000 }, 1000, 1)).toBe(24000)
  })
  it("cuenta caché y margen", () => {
    expect(costInPesos({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000 }, 1000, 2)).toBe(10400)
  })
  it("suma usos", () => {
    expect(sumUsage([{ input_tokens: 1, output_tokens: 2 }, { input_tokens: 3, output_tokens: 4, cache_read_input_tokens: 5 }]))
      .toEqual({ input_tokens: 4, output_tokens: 6, cache_read_input_tokens: 5, cache_creation_input_tokens: 0 })
  })
})

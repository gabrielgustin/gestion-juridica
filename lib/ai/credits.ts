// Créditos de IA en pesos (1 crédito = $1). Precio de Claude Haiku 5.5 en USD por millón de tokens:
// hasta 100K tokens de pedido, y 5 veces más por encima. Caché: lectura 0,1x y escritura 1,25x de la entrada.
const USD_PER_MTOK = { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 }
const LONG_PROMPT = 100_000
const LONG_PROMPT_FACTOR = 5

export type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

/**
 * Costo en pesos de una llamada. AI_USD_ARS es la cotización y AI_MARKUP el margen (1 = al costo).
 * shortcut: cotización fija por variable de entorno; si hace falta, leerla de una API de cotizaciones.
 */
export function costInPesos(usage: Usage, usdArs = Number(process.env.AI_USD_ARS ?? 1500), markup = Number(process.env.AI_MARKUP ?? 1)) {
  const prompt = usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
  const tier = prompt > LONG_PROMPT ? LONG_PROMPT_FACTOR : 1
  const usd = tier *
    (usage.input_tokens * USD_PER_MTOK.input +
      usage.output_tokens * USD_PER_MTOK.output +
      (usage.cache_read_input_tokens ?? 0) * USD_PER_MTOK.cacheRead +
      (usage.cache_creation_input_tokens ?? 0) * USD_PER_MTOK.cacheWrite) / 1_000_000
  return Math.round(usd * usdArs * markup * 100) / 100
}

export const sumUsage = (list: Usage[]): Usage => ({
  input_tokens: list.reduce((n, u) => n + u.input_tokens, 0),
  output_tokens: list.reduce((n, u) => n + u.output_tokens, 0),
  cache_read_input_tokens: list.reduce((n, u) => n + (u.cache_read_input_tokens ?? 0), 0),
  cache_creation_input_tokens: list.reduce((n, u) => n + (u.cache_creation_input_tokens ?? 0), 0),
})

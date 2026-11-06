import "server-only"
import Anthropic from "@anthropic-ai/sdk"
import { query, sql, type Queryable } from "@/lib/sql"
import { costInPesos, type Usage } from "./credits"

export const MODEL = "claude-opus-5-5"
/** Respaldo automático si el modelo declina por sus filtros de seguridad (lo elige Anthropic según el motivo). */
export const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }

let client: Anthropic | null = null
/** Cliente de la API; null si no hay credenciales configuradas. */
export function aiClient() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null
  client ??= new Anthropic()
  return client
}

export type AiSettings = { enabled: boolean; deadline_agent: boolean; identity: string | null; watch: string | null }

export async function aiSettings(studioId: string): Promise<AiSettings> {
  const [row] = await sql<AiSettings>`select enabled, deadline_agent, identity, watch from ai_settings where studio_id = ${studioId}`
  return row ?? { enabled: true, deadline_agent: true, identity: null, watch: null }
}

export async function balance(studioId: string, db: Queryable = { query }) {
  const [{ total }] = await db.query<{ total: string }>(`select coalesce(sum(amount), 0) as total from ai_ledger where studio_id = $1`, [studioId])
  return Number(total)
}

/** Por qué Mike no puede responder ahora (o null si puede). */
export async function aiBlocker(studioId: string): Promise<string | null> {
  if (!aiClient()) return "La IA no está configurada en el servidor (falta ANTHROPIC_API_KEY)."
  if (!(await aiSettings(studioId)).enabled) return "Mike está desactivado para el estudio. Se activa en Agentes de IA."
  if ((await balance(studioId)) <= 0) return "La IA no está activa: el estudio no tiene saldo de créditos. Mike vuelve a funcionar cuando se recarguen."
  return null
}

export async function charge(studioId: string, userId: string | null, usage: Usage, detail: string) {
  const amount = costInPesos(usage)
  await sql`insert into ai_ledger (studio_id, user_id, kind, amount, detail, input_tokens, output_tokens)
    values (${studioId}, ${userId}, 'consumo', ${-amount}, ${detail},
      ${usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)}, ${usage.output_tokens})`
  return amount
}

/** Administradores de la plataforma (quienes venden/cargan créditos): emails en PLATFORM_ADMINS, separados por coma. */
export const isPlatformAdmin = (email: string) =>
  (process.env.PLATFORM_ADMINS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase())

// Reglas puras de la sincronización (sin base de datos), para poder testearlas.

export type StateRef = { id: string; name: string; source: string | null } | null

/**
 * El estado que informa el tribunal siempre manda. Si reemplaza uno puesto a mano por el estudio,
 * se avisa a los asignados con este texto; si no, no hay aviso.
 */
export function stateChangeNotice(previous: StateRef, nextId: string, nextLabel: string, caption: string): string | null {
  if (!previous || previous.id === nextId || previous.source) return null
  return `El tribunal informó «${nextLabel}» en «${caption}» y reemplazó el estado «${previous.name}».`
}

/** Cuándo volver a sincronizar según cómo terminó. */
export function nextSyncDelayMinutes(outcome: "ok" | "error" | "not-calibrated"): number {
  return outcome === "ok" ? 6 * 60 : outcome === "error" ? 60 : 24 * 60
}

/** Id estable de un archivo de tribunal dentro del estudio. */
export const courtFileId = (portal: string, caseId: string, fileId: string) => `${portal}:${caseId}:${fileId}`

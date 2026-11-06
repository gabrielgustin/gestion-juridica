// Contrato entre los conectores de tribunales y el motor de sincronización.
// Un conector solo LEE del portal y devuelve datos normalizados; el motor decide qué crear o actualizar.

export type CourtFile = {
  externalId: string
  name: string
  contentType: string
  /** Baja el archivo (el conector usa su sesión con el portal). */
  download: () => Promise<Buffer>
}

export type CourtActivity = {
  externalId: string
  date: string          // ISO
  title: string
  body?: string
  files?: CourtFile[]
}

export type CourtCase = {
  externalId: string    // id estable del portal
  caption: string       // carátula
  number?: string
  year?: number
  fullNumber?: string   // clave PJN / CUIJ
  url?: string
  court?: string        // radicación
  fuero?: string
  state?: { code: string; label: string }
  activities: CourtActivity[]
}

export type Credentials = { username: string; password: string; options: Record<string, string> }

/** Lo que el worker le presta al conector. `browser` solo existe en el worker (Playwright). */
export type ConnectorContext = {
  credentials: Credentials
  since: Date | null                 // última sincronización exitosa
  browser?: () => Promise<unknown>   // devuelve un Browser de Playwright
  log: (message: string) => void
}

export class InvalidCredentialsError extends Error {
  constructor(message = "El portal rechazó el usuario o la contraseña.") { super(message) }
}
export class PortalUnavailableError extends Error {
  constructor(message = "El portal no responde. Se vuelve a intentar más tarde.") { super(message) }
}
export class NotCalibratedError extends Error {
  constructor(portal: string) { super(`El conector de ${portal} todavía no está calibrado contra el portal real.`) }
}

export type Connector = {
  id: string
  label: string
  description: string
  usernameLabel: string
  passwordLabel: string
  note?: string
  options?: { key: string; label: string; choices: { value: string; label: string }[] }[]
  /** States que el portal informa, para mostrarlos en Configuración aunque todavía no haya causas. */
  knownStates: { code: string; label: string }[]
  /** true = listo contra el portal real. false = en calibración (la UI lo muestra así). */
  ready: boolean
  /** true = corre dentro de la app (sin navegador). Los portales reales corren en el worker. */
  inline?: boolean
  sync: (ctx: ConnectorContext) => AsyncIterable<CourtCase>
}

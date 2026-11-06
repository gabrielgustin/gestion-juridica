import { NotCalibratedError, type Connector, type ConnectorContext, type CourtCase } from "./types"

// Portales judiciales. Cada uno se calibra contra una cuenta real (ver docs/TRIBUNALES.md):
// hasta entonces `ready` es false y el worker marca la conexión con un error claro en lugar de inventar datos.

const states = (...labels: string[]) => labels.map((label) => ({ code: label, label }))

function pending(portal: string) {
  return async function* (ctx: ConnectorContext): AsyncIterable<CourtCase> {
    ctx.log(`${portal}: conector sin calibrar`)
    throw new NotCalibratedError(portal)
  }
}

export const CONNECTORS: Connector[] = [
  {
    id: "pjn", label: "PJN", description: "Causas y novedades del Poder Judicial de la Nación. La conexión es personal de tu CUIL.",
    usernameLabel: "CUIL", passwordLabel: "Contraseña del PJN", ready: false, sync: pending("PJN"),
    knownStates: states("EN LETRA", "EN DESPACHO", "CONFRONTE", "GIRO", "EN CÁMARA", "SENTENCIA", "ARCHIVADO", "ARCHÍVESE", "ARCHIVO PROVISORIO"),
  },
  {
    id: "cba", label: "Poder Judicial de Córdoba", description: "Causas y novedades de los tribunales de la Provincia de Córdoba (SAC Multifuero / Expediente Electrónico).",
    usernameLabel: "Usuario (CUIL)", passwordLabel: "Contraseña", ready: false, sync: pending("Poder Judicial de Córdoba"),
    knownStates: [],
  },
  {
    id: "srt", label: "SRT (Riesgos del Trabajo)", description: "Notificaciones y expedientes de la Ventanilla Electrónica de la SRT.",
    usernameLabel: "CUIT", passwordLabel: "Clave Fiscal", ready: false, sync: pending("SRT"),
    knownStates: states("EN TRÁMITE", "Activo", "Histórico"),
  },
]

export const connectorOf = (portal: string) => CONNECTORS.find((c) => c.id === portal)

import { NotCalibratedError, type Connector, type ConnectorContext, type CourtCase } from "./types"
import { demoConnector } from "./demo"

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
    id: "scba", label: "Suprema Corte de Bs. As.", description: "Causas y trámites de las notificaciones electrónicas de la SCBA.",
    usernameLabel: "Usuario", passwordLabel: "Contraseña", ready: false, sync: pending("SCBA"),
    knownStates: states("EN TRÁMITE", "AUTOS PARA RESOLVER", "AUTOS PARA SENTENCIA", "AUTOS PARA ALEGAR", "SENTENCIA DEFINITIVA", "CAUSA PARALIZADA", "CAUSA ARCHIVADA", "REMISIÓN AL ARCHIVO", "CONCLUIDA"),
  },
  {
    id: "mev", label: "Mesa de Entradas Virtual (SCBA)", description: "Estado y último despacho de cada causa de tus Sets de Búsqueda del portal.",
    usernameLabel: "Usuario", passwordLabel: "Contraseña", ready: false, sync: pending("MEV"),
    note: "La MEV obliga a cambiar la contraseña cada 90 días: cuando la cambies en el portal, actualizala acá.",
    knownStates: [],
  },
  {
    id: "eje", label: "Poder Judicial CABA", description: "Causas y actuaciones del Expediente Judicial Electrónico (EJE) de la Ciudad.",
    usernameLabel: "Usuario de EJE", passwordLabel: "Contraseña", ready: false, sync: pending("EJE CABA"),
    options: [{ key: "modo", label: "Qué traer", choices: [{ value: "mis-causas", label: "Mis causas" }, { value: "por-sujeto", label: "Por sujeto" }] }],
    knownStates: states("INICIAL", "EN LETRA", "EN DESPACHO", "EN TRÁMITE", "PASE", "REMITIDO", "EN VISTA", "AUTOS A SENTENCIA", "AUTOS PARA RESOLVER", "PARALIZADO", "ARCHIVADO", "ACUMULADO"),
  },
  {
    id: "srt", label: "SRT (Riesgos del Trabajo)", description: "Notificaciones y expedientes de la Ventanilla Electrónica de la SRT.",
    usernameLabel: "CUIT", passwordLabel: "Clave Fiscal", ready: false, sync: pending("SRT"),
    knownStates: states("EN TRÁMITE", "Activo", "Histórico"),
  },
]

// El tribunal de prueba solo existe fuera de producción (o si se habilita a propósito para una demo).
if (process.env.NODE_ENV !== "production" || process.env.ENABLE_DEMO_CONNECTOR === "1") CONNECTORS.push(demoConnector)

export const connectorOf = (portal: string) => CONNECTORS.find((c) => c.id === portal)

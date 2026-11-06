import { InvalidCredentialsError, type Connector, type CourtCase } from "./types"

// Tribunal de prueba: devuelve causas inventadas y estables para ejercitar el motor de punta a punta
// (alta de causas, cambio de estado, actuaciones nuevas y archivos). No toca ningún portal real.
// Usuario "demo" y cualquier contraseña; con contraseña "mala" simula credenciales rechazadas.

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF")

export const demoConnector: Connector = {
  id: "demo",
  label: "Tribunal de prueba",
  description: "Simula un portal judicial para probar la sincronización. Solo existe fuera de producción.",
  usernameLabel: "Usuario (escribí «demo»)",
  passwordLabel: "Contraseña (cualquiera; «mala» simula un rechazo)",
  ready: true,
  inline: true,
  knownStates: [{ code: "EN_TRAMITE", label: "EN TRÁMITE" }, { code: "A_SENTENCIA", label: "AUTOS PARA SENTENCIA" }],
  async *sync(ctx) {
    if (ctx.credentials.username !== "demo" || ctx.credentials.password === "mala") throw new InvalidCredentialsError()
    // La segunda sincronización del día cambia el estado de la primera causa y suma una actuación.
    const later = Boolean(ctx.since)
    const today = new Date().toISOString()
    const cases: CourtCase[] = [
      {
        externalId: "DEMO-1001-2025", caption: "GÓMEZ, ANA c/ TRANSPORTES DEL SUR SA s/ DAÑOS Y PERJUICIOS",
        number: "1001", year: 2025, fullNumber: "DEMO 001001/2025", fuero: "Civil", court: "Juzgado Civil de Prueba N° 3",
        url: "https://example.com/demo/1001",
        state: later ? { code: "A_SENTENCIA", label: "AUTOS PARA SENTENCIA" } : { code: "EN_TRAMITE", label: "EN TRÁMITE" },
        activities: [
          { externalId: "a1", date: "2025-03-10T15:00:00Z", title: "Se tiene por presentada la demanda" },
          { externalId: "a2", date: "2025-06-02T15:00:00Z", title: "Se corre traslado de la demanda", files: [{ externalId: "f-a2", name: "Traslado.pdf", contentType: "application/pdf", download: async () => PDF }] },
          ...(later ? [{ externalId: "a3", date: today, title: "Autos para sentencia" }] : []),
        ],
      },
      {
        externalId: "DEMO-2002-2024", caption: "PÉREZ, LUIS c/ ART EJEMPLO SA s/ ACCIDENTE - LEY ESPECIAL",
        number: "2002", year: 2024, fullNumber: "DEMO 002002/2024", fuero: "Laboral", court: "Juzgado Laboral de Prueba N° 7",
        state: { code: "EN_TRAMITE", label: "EN TRÁMITE" },
        activities: [{ externalId: "b1", date: "2024-11-20T15:00:00Z", title: "Audiencia art. 80 LO" }],
      },
    ]
    for (const c of cases) yield c
  },
}

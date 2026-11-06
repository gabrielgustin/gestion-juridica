// Worker de tribunales: corre fuera de Vercel (Railway, Fly.io, un VPS…) porque necesita un navegador real.
// Cada minuto toma las conexiones que tocan y las sincroniza con el mismo motor que usa la app.
//
// Uso:  DATABASE_URL=... COURT_VAULT_KEY=... BLOB_READ_WRITE_TOKEN=... npm run worker
import { dueConnections, runConnection } from "@/lib/courts/engine"

if (!process.env.DATABASE_URL) {
  console.error("[worker] Falta DATABASE_URL: el worker trabaja contra la base real (Neon), no contra la local.")
  process.exit(1)
}

const INTERVAL_MS = 60_000
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 2)
let browserPromise: Promise<any> | null = null
let stopping = false

/** Un solo navegador compartido; cada conector abre su propio contexto (cookies aisladas). */
function browser() {
  const moduleName = "playwright" // se instala solo en el worker (ver docs/TRIBUNALES.md)
  browserPromise ??= import(moduleName).then(({ chromium }) => chromium.launch({ headless: true }))
  return browserPromise
}

async function tick() {
  const due = await dueConnections(CONCURRENCY * 3)
  for (let i = 0; i < due.length && !stopping; i += CONCURRENCY) {
    await Promise.all(due.slice(i, i + CONCURRENCY).map(async (c) => {
      const started = Date.now()
      try {
        const stats = await runConnection(c.id, { browser })
        if (stats) console.log(`[worker] ${c.portal} ${c.id} ok en ${Date.now() - started} ms`, stats)
      } catch (error) {
        console.error(`[worker] ${c.portal} ${c.id} falló`, error)
      }
    }))
  }
}

async function loop() {
  while (!stopping) {
    await tick().catch((error) => console.error("[worker] error en la vuelta", error))
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS))
  }
  if (browserPromise) await (await browserPromise).close()
}

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { stopping = true })
console.log(`[worker] arrancó (concurrencia ${CONCURRENCY})`)
void loop()

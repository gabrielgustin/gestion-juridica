# Conectores con tribunales

## Cómo está armado

- **Conexión:** cada abogado conecta su propia cuenta de cada portal en `/integraciones`. La contraseña se cifra con AES-256-GCM (`lib/vault.ts`), atada al id de la conexión. La llave `COURT_VAULT_KEY` vive solo en las variables de entorno de la app y del worker.
- **Conector** (`lib/courts/*`): **solo lee** del portal y devuelve causas normalizadas (`CourtCase`: carátula, numeración, estado, actuaciones, archivos). No escribe en la base.
- **Motor** (`lib/courts/engine.ts`): aplica lo que trae el conector, sin duplicar nada.
  - Vincula por id del portal o por numeración completa; si no encuentra la causa, la crea y se la asigna a quien conectó.
  - El estado del tribunal reemplaza al anterior y avisa si pisó uno puesto a mano.
  - Las actuaciones tienen clave única por portal e id, así que no se repiten.
  - Los archivos se guardan como documentos de origen `tribunal` y se respeta el cupo del plan.
  - Avisa a los asignados las novedades de causas que ya se seguían.
  - Si falla, reintenta: en 1 hora ante un error, en 24 horas si el conector no está calibrado. Si el portal rechaza las credenciales, frena hasta que el abogado las actualice.
- **Worker** (`worker/index.ts`): corre fuera de Vercel porque necesita Chromium (Playwright). Cada minuto toma las conexiones que tocan. Dos procesos no pueden correr la misma conexión: se toman con un update atómico.
- **Tribunal de prueba** (`lib/courts/demo.ts`): simula un portal para probar todo de punta a punta. Solo aparece fuera de producción, o en producción con `ENABLE_DEMO_CONNECTOR=1`.

## Estado de cada portal

| Portal | Estado |
|---|---|
| PJN | En calibración |
| SCBA (notificaciones) | En calibración |
| MEV (SCBA) | En calibración |
| EJE CABA | En calibración |
| SRT | En calibración |

"En calibración" significa que el conector todavía no se programó contra el portal real. Antes de eso hay que ver cómo responde cada portal con una cuenta verdadera: el login, si pide captcha o doble factor, el listado de causas, las actuaciones y los adjuntos. Mientras tanto, las conexiones guardan la clave y la sincronización termina con un mensaje claro, sin inventar datos.

## Calibrar un portal

1. Un abogado del estudio conecta su cuenta en `/integraciones`. La escribe él, nunca quien programa.
2. Con el worker en local contra la base de pruebas, se programa el `sync` del conector:
   - **Login:** con `ctx.browser()` y un contexto nuevo por conexión. Si el portal rechaza el usuario, se lanza `InvalidCredentialsError`.
   - **Causas:** recorrer el listado y, por cada causa, devolver un `CourtCase` con un `externalId` estable.
   - **Actuaciones:** cada una con un `externalId` estable, para que no se duplique.
   - **Archivos:** `download()` usa la misma sesión.
   - **Novedades:** con `ctx.since`, traer solo lo nuevo cuando el portal lo permita.
3. Se marca `ready: true` y se prueba con un par de causas reales antes de habilitarlo para todos.
4. Si un portal pide captcha, **no se automatiza**: la conexión queda con error y se le avisa al abogado.

## Desplegar el worker

```bash
docker build -f worker/Dockerfile -t estudio-worker .
```

Variables de entorno: `DATABASE_URL` (Neon, la misma base que la app), `COURT_VAULT_KEY` (la misma llave que la app) y `BLOB_READ_WRITE_TOKEN`. Funciona en Railway, Fly.io o cualquier servidor con Docker.

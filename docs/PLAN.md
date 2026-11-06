# Plan de construcción

Alcance: todo lo que figura en [RELEVAMIENTO.md](RELEVAMIENTO.md), incluidos los tribunales. El diseño, los textos y la marca son propios.
Cada fase se entrega funcionando y desplegada antes de pasar a la siguiente.

## Stack
- **App:** Next.js en Vercel, Postgres en Neon (rama de pruebas para local), auth con Google + link mágico.
- **Archivos:** Vercel Blob.
- **Worker de tribunales:** servicio aparte con Playwright y una cola (por ejemplo Railway o Fly.io). Vercel no sirve para correr navegadores headless ni sincronizaciones largas.
- **Claves de tribunales:** cifradas con AES-256-GCM. La llave vive solo en el worker y nunca se guarda en la base.
- **IA:** API de Claude, con créditos por estudio.

## Fases
1. **Base:** estudio multi-tenant, login, usuarios e invitaciones, roles, dominios, datos del estudio y catálogos (estados, etapas, fueros, partes, estados de tarea, tipos de cliente y de juzgado, etiquetas).
2. **Núcleo:** expedientes (alta, ficha, archivo, papelera, filtros, vistas), clientes, juzgados (con directorio nacional), búsqueda global.
3. **Calendario y tareas:** calendarios múltiples, cinco vistas (calendario, agenda, movimientos, tabla, kanban), retrasadas, recordatorios, notificaciones.
4. **Documentos:** explorador con carpetas por entidad, escritos, destacados, papelera, límites del plan.
5. **Dashboard:** contadores, widgets personalizables, primeros pasos.
6. **Tribunales, de a uno:** PJN → Poder Judicial de Córdoba → SRT. Cada conector trae causas, actuaciones y archivos; mapea los estados del tribunal; incluye "reportar problema" y alerta cuando falla el login.
7. **IA:** asistente con chat, adjuntos y dictado, contexto de las causas, redacción de escritos y base de conocimiento; agente de vencimientos sobre las actuaciones nuevas; créditos y consumos.
8. **Integraciones:** Google Calendar, Drive y Dropbox; conector MCP.

## Riesgos
- **Los portales cambian sin aviso** y el conector se rompe. Cada uno lleva tests contra una cuenta real y alertas.
- **Las claves de los abogados:** responsabilidad legal y de seguridad. Conviene dejarlo escrito en el contrato con el cliente.
- **Términos de uso de cada portal y captchas:** si un portal pide captcha, no se automatiza; se le avisa al usuario.
- **Para probar cada conector** hacen falta credenciales reales de un abogado con causas en ese fuero.

## Conector MCP con login estándar (OAuth)

Claude (web, escritorio, móvil) se agrega con una sola dirección: `<dominio>/api/mcp`. El abogado entra con su usuario del estudio y toca «Permitir», una sola vez.

- Descubrimiento: `/.well-known/oauth-protected-resource` y `/.well-known/oauth-authorization-server`.
- Registro dinámico del cliente (`/api/oauth/register`), pantalla de permiso (`/oauth/authorize`), código con PKCE S256 y canje en `/api/oauth/token`.
- Acceso de 1 hora, renovación de 90 días con rotación. Los tokens viven en `api_tokens`: se ven y se revocan desde Integraciones; desactivar al miembro corta la renovación.
- Sin probar contra el Claude real: hace falta la app desplegada con dominio público.

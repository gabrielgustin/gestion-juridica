# Google Drive como almacenamiento

Los archivos de cada estudio viven en **su propio Google Drive**, no en el sistema: no pagás almacenamiento de archivos y el estudio los conserva si se va.

## Cómo funciona

1. Un **administrador** del estudio toca «Conectar Google Drive» en Integraciones y acepta el permiso `drive.file` (la app solo ve lo que ella crea).
2. La app crea la carpeta **«Estudio · <nombre>»** en ese Drive y la comparte, en lectura, con la cuenta de servicio (si está configurada).
3. **Subir:** el navegador manda el archivo directo a Google (subida reanudable que abre el servidor) y después se registra en Documentos. Cada expediente, cliente o juzgado tiene su subcarpeta.
4. **Lo que el estudio ya tenía:** lo mueve a la carpeta desde Drive. «Sincronizar ahora» (y un cron cada 15 minutos) lo trae a Documentos.
5. **Abrir:** el archivo pasa por la app en streaming, con el control de sesión de siempre. Los documentos de Google (Docs, Hojas) se abren como PDF.
6. **Borrar para siempre** manda el archivo a la papelera de Drive (30 días). Solo puede con los que subió la app; los demás se borran desde Drive.

## Qué hay que crear en Google Cloud (una sola vez, para toda la plataforma)

1. Proyecto en Google Cloud y **Google Drive API** habilitada.
2. **Pantalla de consentimiento** (externa) con el permiso `.../auth/drive.file`. Es un permiso no sensible: no pide la auditoría de seguridad de Google. Pasar la app a **«En producción»**: en «Prueba» Google vence los accesos a los 7 días.
3. **Credencial OAuth** (aplicación web) con la redirección `<dominio>/api/integraciones/drive/callback`. Va en `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` (las mismas de Calendar; ahí también va `<dominio>/api/integraciones/google/callback`).
4. **Opcional, recomendado:** una **cuenta de servicio** con una clave JSON, pegada en `GOOGLE_SERVICE_ACCOUNT_JSON`. Sin ella solo se ven los archivos subidos desde la app, no los que el estudio mueva a mano.

## Límites conocidos

- Sin probar contra Google real: hace falta el proyecto de Google Cloud. Hay pruebas automáticas con Google simulado.
- La subida directa del navegador depende del CORS de Google (el servidor manda `Origin` al abrir la subida). Si Google la rechaza, hay que pasar la subida por el servidor.
- Los escritos que genera Mike y los archivos que bajan de los tribunales siguen en el almacenamiento del sistema.
- Una sola conexión por estudio: los archivos quedan en el Drive de quien la hizo. Si esa persona se va, hay que reconectar con otra cuenta (la carpeta se mantiene mientras la cuenta exista).

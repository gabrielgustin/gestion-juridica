# Conectar Google (Calendar, Drive e ingreso con Google)

Un solo proyecto de Google Cloud habilita las tres cosas. Cada abogado conecta después su propia cuenta desde **Integraciones**; esto se configura una sola vez para todo el sistema.

Dirección de la demo: `https://estudio-juridico-henna.vercel.app`. Si más adelante usamos un dominio propio, hay que agregar las mismas direcciones con ese dominio.

## 1. Crear el proyecto
1. Entrá a https://console.cloud.google.com con tu cuenta de Google.
2. Arriba, en el selector de proyectos, tocá **Nuevo proyecto**. Nombre: `Cobos Porta Gestion`. Crear.

## 2. Habilitar las API
En **APIs y servicios → Biblioteca**, buscá y habilitá:
- **Google Calendar API**
- **Google Drive API**

## 3. Pantalla de consentimiento (Google Auth Platform)
1. **Branding:** nombre de la app `Cobos Porta · Gestión`, correo de soporte (el tuyo) y logo (el escudo, `isotipo-color-512.png`).
   - Página principal: `https://estudio-juridico-henna.vercel.app/login`
   - Política de privacidad: `https://estudio-juridico-henna.vercel.app/privacidad`
   - Términos: `https://estudio-juridico-henna.vercel.app/terminos`
2. **Público (Audience):** tipo **Externo**, estado **En prueba**. En **Usuarios de prueba** agregá tu Gmail y el de los abogados que vayan a probar (hasta 100).
3. **Acceso a datos (Data access):** agregá estos permisos:
   - `openid`
   - `.../auth/userinfo.email`
   - `.../auth/calendar.app.created`
   - `.../auth/drive.file`

## 4. Crear la credencial
**Clientes → Crear cliente → Aplicación web**.
- **Orígenes de JavaScript autorizados:**
  - `https://estudio-juridico-henna.vercel.app`
  - `http://localhost:4700`
- **URI de redireccionamiento autorizados:**
  - `https://estudio-juridico-henna.vercel.app/api/integraciones/google/callback`
  - `https://estudio-juridico-henna.vercel.app/api/integraciones/drive/callback`
  - `https://estudio-juridico-henna.vercel.app/api/auth/callback/google`
  - `http://localhost:4700/api/integraciones/google/callback`
  - `http://localhost:4700/api/integraciones/drive/callback`
  - `http://localhost:4700/api/auth/callback/google`

Al crear, Google muestra el **ID de cliente** y el **Secreto**.

## 5. Cargarlos en Vercel (no en el chat)
En Vercel → proyecto `estudio-juridico` → Settings → Environment Variables → Production:
- `GOOGLE_CLIENT_ID` = el ID de cliente
- `GOOGLE_CLIENT_SECRET` = el secreto (tipo **Secret**)

Para tu computadora, las mismas dos líneas en `estudio-juridico/.env.local`.

## 6. Avisar para probar
Se redespliega la demo y se prueba con tu cuenta: conectar Calendar (debe aparecer el calendario «Estudio»), conectar Drive (debe crearse la carpeta del estudio) y subir un archivo.

## Antes de abrirlo a todos los abogados
- Mientras la app esté **En prueba**, solo entran los usuarios de prueba y la conexión vence cada 7 días.
- Para **publicarla**, Google revisa la marca y pide verificar la propiedad del dominio de la página principal y de la política de privacidad. Con una dirección `*.vercel.app` no se puede verificar: hace falta un dominio propio (por ejemplo `gestion.cobosporta.com.ar`).
- Completar los datos entre corchetes de `/privacidad` y `/terminos` y revisarlos con un abogado.

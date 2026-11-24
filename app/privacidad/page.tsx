import type { Metadata } from "next"
import { LegalPage } from "@/components/legal-page"

export const metadata: Metadata = { title: "Política de privacidad · Cobos Porta" }

// shortcut: texto base sin revisión legal; completar los datos entre corchetes y revisarlo con un abogado antes de publicar la app en Google.
export default function PrivacyPage() {
  return (
    <LegalPage title="Política de privacidad" updated="23 de noviembre de 2026">
      <p>Este sistema de gestión para estudios jurídicos es operado por [nombre o razón social del titular], con contacto en [correo de contacto]. Esta política explica qué datos tratamos, para qué y cómo podés pedir que se borren.</p>

      <h2>Qué datos guardamos</h2>
      <ul>
        <li>Datos de tu cuenta: nombre, correo y contraseña cifrada.</li>
        <li>Lo que cargás en el sistema: expedientes, clientes, juzgados, tareas, documentos y notas.</li>
        <li>Si conectás un portal judicial, tu usuario y contraseña de ese portal, cifrados con AES-256-GCM. Solo se usan para leer tus causas y se borran al desconectar.</li>
      </ul>

      <h2>Datos de Google</h2>
      <p>La conexión con Google es opcional y la activa cada usuario.</p>
      <ul>
        <li><strong>Google Calendar:</strong> creamos un calendario llamado «Estudio» en tu cuenta y copiamos ahí tus tareas, audiencias y vencimientos. No leemos ni modificamos tus otros calendarios.</li>
        <li><strong>Google Drive:</strong> creamos una carpeta del estudio y guardamos ahí los archivos que subís desde el sistema. Solo accedemos a los archivos de esa carpeta, no al resto de tu Drive.</li>
        <li>Guardamos tu correo de Google y los permisos de acceso, cifrados, para mantener la conexión. Podés desconectarla en cualquier momento desde Integraciones o desde tu cuenta de Google.</li>
      </ul>
      <p>El uso y la transferencia de la información recibida de las API de Google se ajustan a la <a className="underline" href="https://developers.google.com/terms/api-services-user-data-policy">Política de Datos del Usuario de los Servicios de API de Google</a>, incluidos los requisitos de uso limitado. No vendemos esos datos, no los usamos para publicidad y no los usamos para entrenar modelos de inteligencia artificial.</p>

      <h2>Asistente de inteligencia artificial</h2>
      <p>Cuando usás el asistente, el texto de tu consulta y los datos de tus causas que hagan falta para responderla se envían a Anthropic, el proveedor del modelo, solo para generar la respuesta. Si conectás tu propia cuenta de Claude o ChatGPT, ese uso se rige además por las condiciones de ese servicio.</p>

      <h2>Dónde se guardan</h2>
      <p>Los datos se alojan en Vercel y Neon, con conexiones cifradas. Cada estudio solo puede ver sus propios datos.</p>

      <h2>Tus derechos</h2>
      <p>Podés pedir acceso, corrección o eliminación de tus datos escribiendo a [correo de contacto]. Al cerrar la cuenta borramos tus datos, salvo lo que la ley obligue a conservar. Conforme a la Ley 25.326, la Agencia de Acceso a la Información Pública es el órgano de control.</p>
    </LegalPage>
  )
}

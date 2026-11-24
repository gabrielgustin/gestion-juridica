import type { Metadata } from "next"
import { LegalPage } from "@/components/legal-page"

export const metadata: Metadata = { title: "Términos de uso · Cobos Porta" }

// shortcut: texto base sin revisión legal; completar los datos entre corchetes y revisarlo con un abogado antes de publicar.
export default function TermsPage() {
  return (
    <LegalPage title="Términos de uso" updated="23 de noviembre de 2026">
      <p>Estos términos rigen el uso del sistema de gestión para estudios jurídicos operado por [nombre o razón social del titular]. Al crear una cuenta, los aceptás.</p>

      <h2>El servicio</h2>
      <p>El sistema organiza expedientes, clientes, agenda y documentos del estudio, y ofrece conexiones opcionales con portales judiciales, Google y asistentes de inteligencia artificial.</p>

      <h2>Tu cuenta</h2>
      <ul>
        <li>Cada cuenta es personal. Sos responsable de cuidar tu contraseña y de lo que se haga con tu cuenta.</li>
        <li>Lo que cargás es tuyo. Solo lo usamos para prestarte el servicio.</li>
      </ul>

      <h2>Información orientativa</h2>
      <p>Los vencimientos sugeridos, las respuestas del asistente y los datos traídos de portales judiciales son una ayuda. No reemplazan el control profesional: verificá plazos, citas y datos antes de presentar un escrito.</p>

      <h2>Conexiones con terceros</h2>
      <p>Las conexiones con portales judiciales, Google, Claude o ChatGPT dependen de esos servicios. Si cambian o dejan de funcionar, la conexión puede interrumpirse hasta que la adaptemos.</p>

      <h2>Contacto</h2>
      <p>Por consultas o reclamos, escribí a [correo de contacto].</p>
    </LegalPage>
  )
}

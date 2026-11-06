import { ShieldCheck } from "lucide-react"
import { getMember } from "@/lib/session"
import { sql } from "@/lib/sql"
import { CONNECTORS } from "@/lib/courts/portals"
import { connectPortal, reportProblem } from "@/lib/actions/courts"
import { ActionForm } from "@/components/action-form"
import { ConnectionControls } from "@/components/courts/connection-controls"
import Link from "next/link"
import { calendarEnabled } from "@/lib/integrations/google-calendar"
import { appOrigin } from "@/lib/integrations/google-event"
import { one, type Params } from "@/lib/list-params"
import { TokenManager } from "@/components/integrations/token-manager"
import { DisconnectGoogle } from "@/components/integrations/disconnect-google"
import { DriveControls } from "@/components/integrations/drive-controls"
import { connectionOf, driveEnabled, serviceAccount } from "@/lib/integrations/drive"

const GOOGLE_MESSAGES: Record<string, { text: string; error?: boolean }> = {
  ok: { text: "Google Calendar conectado. Tus tareas se están copiando al calendario «Estudio»." },
  cancelado: { text: "Cancelaste la conexión con Google.", error: true },
  error: { text: "No se pudo conectar Google Calendar. Probá de nuevo.", error: true },
  "no-configurado": { text: "Google Calendar todavía no está habilitado en el servidor.", error: true },
}
const DRIVE_MESSAGES: Record<string, { text: string; error?: boolean }> = {
  ok: { text: "Google Drive conectado. Ya podés subir archivos y pasar los que tenías a la carpeta del estudio." },
  cancelado: { text: "Cancelaste la conexión con Google Drive.", error: true },
  error: { text: "No se pudo conectar Google Drive. Probá de nuevo.", error: true },
  "no-configurado": { text: "Google Drive todavía no está habilitado en el servidor.", error: true },
  "sin-permiso": { text: "Solo un administrador del estudio puede conectar Google Drive.", error: true },
}
const SECTIONS = [["tribunales", "Poderes judiciales"], ["agenda", "Agenda"], ["almacenamiento", "Almacenamiento"], ["mcp", "Conector MCP"]]

const STATUS: Record<string, { label: string; className: string }> = {
  pendiente: { label: "Pendiente", className: "bg-amber-100 text-amber-800" },
  sincronizando: { label: "Sincronizando…", className: "bg-blue-100 text-blue-800" },
  ok: { label: "Conectado", className: "bg-ok/10 text-ok" },
  error: { label: "Con errores", className: "bg-danger/10 text-danger" },
  credenciales: { label: "Revisá tu contraseña", className: "bg-danger/10 text-danger" },
}
const when = (d: Date | null) => (d ? new Date(d).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" }) : "nunca")

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { studio, user, role } = await getMember()
  const query = await searchParams
  const googleStatus = GOOGLE_MESSAGES[one(query.google)]
  const driveStatus = DRIVE_MESSAGES[one(query.drive)]
  const drive = await connectionOf(studio.id)
  const [google] = await sql<{ account: string | null; status: string; last_error: string | null; events: string }>`
    select i.account, i.status, i.last_error, (select count(*) from calendar_events e where e.integration_id = i.id) as events
    from user_integrations i where i.studio_id = ${studio.id} and i.user_id = ${user.id} and i.provider = 'google_calendar'`
  const tokens = await sql<{ id: string; name: string; created_at: string; last_used_at: string | null }>`
    select id, name, created_at::text, last_used_at::text from api_tokens where studio_id = ${studio.id} and user_id = ${user.id} and revoked_at is null order by created_at desc`
  const connections = await sql<{ id: string; portal: string; username: string; status: string; last_error: string | null; last_sync_at: Date | null; next_sync_at: Date; options: Record<string, string>; matters: string }>`
    select c.id, c.portal, c.username, c.status, c.last_error, c.last_sync_at, c.next_sync_at, c.options,
      (select count(*) from matters m where m.connection_id = c.id and m.deleted_at is null) as matters
    from court_connections c where c.studio_id = ${studio.id} and c.user_id = ${user.id}`

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Integraciones</h1>
        <p className="text-sm text-ink-soft">Conectá el sistema con servicios externos.</p>
      </div>
      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Secciones">
        {SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`} className="rounded-full border border-line bg-white px-3 py-1 hover:border-brand">{label}</a>)}
      </nav>
      <h2 id="tribunales" className="scroll-mt-4 font-serif text-2xl">Poderes judiciales</h2>
      <p className="-mt-4 text-sm text-ink-soft">Traé causas y novedades de cada fuero. Cada conexión es personal de tu cuenta.</p>

      <div className="flex gap-3 rounded-lg border border-line bg-white p-4 text-sm">
        <ShieldCheck className="shrink-0 text-ok" aria-hidden />
        <p>Tu contraseña se guarda cifrada (AES-256-GCM) y solo se usa para leer tus causas. Nunca se muestra ni se envía a otro lugar. Al desconectar, se borra.</p>
      </div>

      {CONNECTORS.map((portal) => {
        const conn = connections.find((c) => c.portal === portal.id)
        const status = conn ? STATUS[conn.status] : null
        return (
          <section key={portal.id} className="card p-5" aria-labelledby={`portal-${portal.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 id={`portal-${portal.id}`} className="text-lg font-medium">{portal.label}</h2>
                <p className="text-sm text-ink-soft">{portal.description}</p>
              </div>
              <div className="flex gap-2">
                {!portal.ready && <span className="rounded-full bg-paper px-2 py-0.5 text-xs text-ink-soft">En calibración</span>}
                {status && <span className={`rounded-full px-2 py-0.5 text-xs ${status.className}`}>{status.label}</span>}
              </div>
            </div>
            {portal.note && <p className="mt-2 text-sm text-amber-800">{portal.note}</p>}

            {conn && (
              <div className="mt-3 space-y-2 rounded-md bg-paper p-3 text-sm">
                <div>Usuario: <b>{conn.username}</b> · Última sincronización: {when(conn.last_sync_at)} · {Number(conn.matters)} expediente(s) vinculados</div>
                {conn.last_error && <p role="alert" className="text-danger">{conn.last_error}</p>}
                <ConnectionControls id={conn.id} syncing={conn.status === "sincronizando"} />
              </div>
            )}

            <details className="mt-3" open={!conn}>
              <summary className="cursor-pointer text-sm text-brand">{conn ? "Cambiar usuario o contraseña" : `Conectar ${portal.label}`}</summary>
              <ActionForm action={connectPortal.bind(null, portal.id)} submit={conn ? "Guardar" : "Conectar"} className="mt-3 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor={`${portal.id}-user`}>{portal.usernameLabel}</label>
                    <input id={`${portal.id}-user`} name="username" required autoComplete="off" defaultValue={conn?.username} className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor={`${portal.id}-pass`}>{portal.passwordLabel}</label>
                    <input id={`${portal.id}-pass`} name="password" type="password" required autoComplete="new-password" className="input" />
                  </div>
                  {portal.options?.map((opt) => (
                    <div key={opt.key}>
                      <label className="label" htmlFor={`${portal.id}-${opt.key}`}>{opt.label}</label>
                      <select id={`${portal.id}-${opt.key}`} name={`opt_${opt.key}`} defaultValue={conn?.options?.[opt.key] ?? opt.choices[0].value} className="input">
                        {opt.choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </ActionForm>
            </details>

            <details className="mt-2">
              <summary className="cursor-pointer text-sm text-ink-soft">¿No podés conectar? Reportar problema</summary>
              <ActionForm action={reportProblem.bind(null, portal.id)} submit="Enviar reporte" className="mt-2 space-y-2">
                <textarea name="message" required rows={3} maxLength={2000} aria-label="Qué pasa" placeholder="Contanos qué pasa (no incluyas tu contraseña)." className="input" />
              </ActionForm>
            </details>
          </section>
        )
      })}

      <h2 id="agenda" className="scroll-mt-4 font-serif text-2xl">Agenda</h2>
      <section className="card space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-medium">Google Calendar</h3>
            <p className="text-sm text-ink-soft">Tus audiencias, vencimientos y tareas también en tu calendario. Se copian a un calendario «Estudio» en tu cuenta de Google y se mantienen al día solos. Solo tenemos acceso a ese calendario, no a los demás.</p>
          </div>
          {google && <span className={`rounded-full px-2 py-0.5 text-xs ${google.status === "ok" ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"}`}>{google.status === "ok" ? "Conectado" : "Con errores"}</span>}
        </div>
        {googleStatus && <p role={googleStatus.error ? "alert" : "status"} className={`text-sm ${googleStatus.error ? "text-danger" : "text-ok"}`}>{googleStatus.text}</p>}
        {google ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>Cuenta: <b>{google.account ?? "—"}</b> · {Number(google.events)} evento(s) copiados</span>
            {google.last_error && <span className="text-danger">{google.last_error}</span>}
            <a href="/api/integraciones/google/start" className="btn-ghost">Reconectar</a>
            <DisconnectGoogle />
          </div>
        ) : calendarEnabled()
          ? <a href="/api/integraciones/google/start" className="btn">Conectar Google Calendar</a>
          : <p className="text-sm text-ink-soft">Disponible cuando el servidor tenga configurada la conexión con Google.</p>}
      </section>

      <h2 id="almacenamiento" className="scroll-mt-4 font-serif text-2xl">Almacenamiento</h2>
      <section className="card space-y-3 p-5 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-medium">Google Drive del estudio</h3>
            <p className="text-ink-soft">
              Guardá todos los archivos en el Drive del estudio, no en el sistema. La app crea una carpeta en tu Drive y ahí van los archivos que se suban desde acá;
              lo que ya tenías, movelo a esa carpeta y aparece en Documentos. Solo tiene acceso a esa carpeta, no al resto de tu Drive.
            </p>
          </div>
          {drive && <span className={`rounded-full px-2 py-0.5 text-xs ${drive.status === "ok" ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"}`}>{drive.status === "ok" ? "Conectado" : "Con errores"}</span>}
        </div>
        {driveStatus && <p role={driveStatus.error ? "alert" : "status"} className={driveStatus.error ? "text-danger" : "text-ok"}>{driveStatus.text}</p>}
        {drive ? (
          <div className="space-y-2">
            <div>
              Cuenta: <b>{drive.account ?? "—"}</b> · Última sincronización: {when(drive.last_sync_at)} ·{" "}
              <a href={`https://drive.google.com/drive/folders/${drive.root_folder_id}`} target="_blank" rel="noopener" className="text-brand underline">Abrir la carpeta en Drive</a>
            </div>
            {drive.last_error && <p role="alert" className="text-danger">{drive.last_error}</p>}
            {!serviceAccount() && <p className="text-amber-800">Por ahora solo se ven los archivos subidos desde la app. Para ver también los que muevas a mano a la carpeta, hay que habilitar la lectura completa en el servidor.</p>}
            <DriveControls canDisconnect={role === "admin"} />
          </div>
        ) : !driveEnabled()
          ? <p className="text-ink-soft">Disponible cuando el servidor tenga configurada la conexión con Google.</p>
          : role === "admin"
            ? <a href="/api/integraciones/drive/start" className="btn">Conectar Google Drive</a>
            : <p className="text-ink-soft">Un administrador del estudio tiene que conectarlo.</p>}
        <hr className="border-line" />
        <h3 className="font-medium">Vincular archivos sueltos de Drive o Dropbox</h3>
        <p className="text-ink-soft">Si no usás la carpeta del estudio, podés vincular archivos puntuales a cada expediente, cliente, juzgado o tarea: se abren en su servicio con los permisos que ya tengan. Se hace desde <Link href="/documentos" className="text-brand underline">Documentos</Link>.</p>
      </section>

      <h2 id="mcp" className="scroll-mt-4 font-serif text-2xl">Conector MCP</h2>
      <section className="card space-y-3 p-5">
        <div>
          <h3 className="text-lg font-medium">Usá el estudio desde Claude</h3>
          <p className="text-sm text-ink-soft">
            Conectá tu Claude y consultá tus causas, tu agenda y tus clientes desde el chat, con las mismas herramientas que Mike.
            Este uso no descuenta créditos del estudio: lo cubre tu propio plan de Claude.
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
            <li>En Claude, andá a Configuración → Conectores → Agregar conector personalizado.</li>
            <li>Pegá la dirección de abajo y poné el nombre que quieras.</li>
            <li>Entrá con tu usuario del estudio y tocá «Permitir». Se hace una sola vez.</li>
          </ol>
          <p className="mt-2 text-xs text-ink-soft">Para Claude Code u otras herramientas técnicas también podés usar un token personal:</p>
          <p className="mt-2 text-sm">Dirección del servidor: <code className="rounded bg-paper px-1">{`${appOrigin()}/api/mcp`}</code></p>
        </div>
        <TokenManager tokens={tokens} endpoint={`${appOrigin()}/api/mcp`} />
      </section>
    </div>
  )
}

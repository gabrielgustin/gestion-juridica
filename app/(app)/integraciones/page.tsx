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

const GOOGLE_MESSAGES: Record<string, { text: string; error?: boolean }> = {
  ok: { text: "Google Calendar conectado. Tus tareas se están copiando al calendario «Estudio»." },
  cancelado: { text: "Cancelaste la conexión con Google.", error: true },
  error: { text: "No se pudo conectar Google Calendar. Probá de nuevo.", error: true },
  "no-configurado": { text: "Google Calendar todavía no está habilitado en el servidor.", error: true },
}
const SECTIONS = [["tribunales", "Poderes judiciales"], ["agenda", "Agenda"], ["almacenamiento", "Almacenamiento"], ["mcp", "Conector MCP"], ["equipo", "Equipo"]]

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
  const googleStatus = GOOGLE_MESSAGES[one((await searchParams).google)]
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
      <section className="card space-y-2 p-5 text-sm">
        <h3 className="text-lg font-medium">Google Drive y Dropbox</h3>
        <p className="text-ink-soft">Vinculá archivos de Drive o Dropbox a cada expediente, cliente, juzgado o tarea, sin copiarlos: se abren en su servicio con los permisos que ya tengan. Se hace desde la sección Documentos de cada ficha o desde <Link href="/documentos" className="text-brand underline">Documentos</Link>.</p>
        <p className="text-ink-soft">{process.env.NEXT_PUBLIC_DROPBOX_APP_KEY ? "Dropbox: podés elegir los archivos con su selector." : "Por ahora se vinculan pegando el link compartido del archivo."} OneDrive y SharePoint, próximamente.</p>
      </section>

      <h2 id="mcp" className="scroll-mt-4 font-serif text-2xl">Conector MCP</h2>
      <section className="card space-y-3 p-5">
        <div>
          <h3 className="text-lg font-medium">Usá el estudio desde Claude</h3>
          <p className="text-sm text-ink-soft">
            Conectá Claude (Claude Code o Claude Desktop) por MCP y consultá tus causas, tu agenda y tus clientes desde el chat, con las mismas
            herramientas que Mike. Cada token es personal: ve lo que vos ves en el estudio y se puede revocar en cualquier momento.
            Este uso no descuenta créditos del estudio.
          </p>
          <p className="mt-2 text-sm">Dirección del servidor: <code className="rounded bg-paper px-1">{`${appOrigin()}/api/mcp`}</code></p>
        </div>
        <TokenManager tokens={tokens} endpoint={`${appOrigin()}/api/mcp`} />
      </section>

      <h2 id="equipo" className="scroll-mt-4 font-serif text-2xl">Equipo</h2>
      <section className="card p-5 text-sm">
        <p className="text-ink-soft">Sumá abogados y asistentes, con sus roles. {role === "admin" ? "" : "Lo gestiona un administrador del estudio."}</p>
        {role === "admin" && <Link href="/configuracion/usuarios" className="btn mt-3">Gestionar usuarios</Link>}
      </section>
    </div>
  )
}

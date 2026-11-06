import "server-only"
import { createSign } from "node:crypto"
import { query, sql } from "@/lib/sql"
import { open, seal } from "@/lib/vault"
import { DOC_ENTITIES, type DocEntity } from "@/lib/documents"
import { appOrigin } from "./google-event"
import { tokenRequest } from "./google-calendar"

// Google Drive como almacenamiento. La app crea UNA carpeta en el Drive de quien conecta (permiso drive.file: solo ve lo que ella crea)
// y, si hay cuenta de servicio, se la comparte en lectura para poder ver también lo que el estudio ponga a mano adentro.
//   - Subir y crear carpetas: con el acceso de quien conectó.
//   - Listar y abrir todo: con la cuenta de servicio si existe; si no, con el mismo acceso (solo ve lo que subió la app).

const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/drive.file"]
const API = "https://www.googleapis.com/drive/v3"
const UPLOAD = "https://www.googleapis.com/upload/drive/v3"
export const FOLDER = "application/vnd.google-apps.folder"
export const driveEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
const redirectUri = () => `${appOrigin()}/api/integraciones/drive/callback`

export function authUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: redirectUri(), response_type: "code",
    scope: SCOPES.join(" "), access_type: "offline", prompt: "consent", state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

// --- Cuenta de servicio (opcional) -------------------------------------------------------------------------------------------

type ServiceAccount = { client_email: string; private_key: string }
export function serviceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed.client_email && parsed.private_key ? parsed : null
  } catch {
    return null
  }
}

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url")
let cachedSa: { token: string; until: number } | null = null

async function serviceToken(sa: ServiceAccount) {
  if (cachedSa && cachedSa.until > Date.now()) return cachedSa.token
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/drive.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`
  const signature = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url")
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  })
  if (!response.ok) throw new Error(`Google rechazó la cuenta de servicio (${response.status}).`)
  const { access_token, expires_in } = await response.json()
  cachedSa = { token: access_token, until: Date.now() + (expires_in - 120) * 1000 }
  return access_token as string
}

// --- Conexión del estudio ----------------------------------------------------------------------------------------------------

export type Connection = { studio_id: string; secret: string; expires_at: Date; root_folder_id: string; account: string | null; status: string; last_error: string | null; last_sync_at: Date | null }

export async function connectionOf(studioId: string) {
  const [row] = await sql<Connection>`select studio_id, secret, expires_at, root_folder_id, account, status, last_error, last_sync_at from studio_drive where studio_id = ${studioId}`
  return row ?? null
}

async function ownerToken(conn: Connection) {
  const stored = JSON.parse(open(conn.secret, conn.studio_id)) as { access: string; refresh: string }
  if (new Date(conn.expires_at) > new Date()) return stored.access
  const tokens = await tokenRequest({ refresh_token: stored.refresh, grant_type: "refresh_token" })
  const secret = seal(JSON.stringify({ access: tokens.access_token, refresh: tokens.refresh_token ?? stored.refresh }), conn.studio_id)
  await sql`update studio_drive set secret = ${secret}, expires_at = now() + make_interval(secs => ${tokens.expires_in - 60}) where studio_id = ${conn.studio_id}`
  return tokens.access_token
}

/** Token para leer: la cuenta de servicio ve todo lo que se compartió; sin ella, solo lo que creó la app. */
async function readToken(conn: Connection) {
  const sa = serviceAccount()
  return sa ? serviceToken(sa) : ownerToken(conn)
}

async function api(token: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers } })
  if (!response.ok) throw new Error(`Google Drive respondió ${response.status}`)
  return response
}

/** Termina el alta: guarda los tokens cifrados, crea la carpeta del estudio y la comparte con la cuenta de servicio. */
export async function connectDrive(studio: { id: string; name: string }, userId: string, code: string) {
  const tokens = await tokenRequest({ code, redirect_uri: redirectUri(), grant_type: "authorization_code" })
  if (!tokens.refresh_token) throw new Error("Google no entregó acceso permanente. Probá de nuevo.")
  const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } }).then((r) => r.json()).catch(() => ({}))

  const [existing] = await sql<{ root_folder_id: string }>`select root_folder_id from studio_drive where studio_id = ${studio.id}`
  let rootId = existing?.root_folder_id
  if (!rootId) {
    const created = await api(tokens.access_token, "/files?fields=id", { method: "POST", body: JSON.stringify({ name: `Estudio · ${studio.name}`, mimeType: FOLDER }) })
    rootId = (await created.json()).id as string
  }
  const sa = serviceAccount()
  if (sa) {
    await api(tokens.access_token, `/files/${rootId}/permissions?sendNotificationEmail=false`, {
      method: "POST", body: JSON.stringify({ role: "reader", type: "user", emailAddress: sa.client_email }),
    })
  }
  const secret = seal(JSON.stringify({ access: tokens.access_token, refresh: tokens.refresh_token }), studio.id)
  await sql`
    insert into studio_drive (studio_id, connected_by, account, secret, expires_at, root_folder_id)
    values (${studio.id}, ${userId}, ${info.email ?? null}, ${secret}, now() + make_interval(secs => ${tokens.expires_in - 60}), ${rootId})
    on conflict (studio_id) do update set connected_by = excluded.connected_by, account = excluded.account, secret = excluded.secret,
      expires_at = excluded.expires_at, status = 'ok', last_error = null`
  return rootId
}

export async function disconnectDrive(studioId: string) {
  const conn = await connectionOf(studioId)
  if (!conn) return
  const stored = JSON.parse(open(conn.secret, conn.studio_id)) as { refresh: string }
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(stored.refresh)}`, { method: "POST" }).catch(() => {})
  await sql`delete from documents where studio_id = ${studioId} and provider = 'gdrive'`
  await sql`delete from drive_folders where studio_id = ${studioId}`
  await sql`delete from studio_drive where studio_id = ${studioId}`
}

// --- Carpetas, subida y metadatos --------------------------------------------------------------------------------------------

const folderName = (value: string) => value.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100) || "Sin nombre"

/** Carpeta de Drive para un expediente, cliente o juzgado (se crea la primera vez); sin entidad, la raíz del estudio. */
export async function folderFor(conn: Connection, entity?: DocEntity | null, entityId?: string | null) {
  if (!entity || !entityId) return conn.root_folder_id
  const [known] = await sql<{ folder_id: string }>`select folder_id from drive_folders where studio_id = ${conn.studio_id} and entity = ${entity} and entity_id = ${entityId}`
  if (known) return known.folder_id
  const meta = DOC_ENTITIES[entity]
  const [row] = await query<{ name: string }>(`select ${meta.nameCol} as name from ${meta.table} where id = $1 and studio_id = $2`, [entityId, conn.studio_id])
  const created = await api(await ownerToken(conn), "/files?fields=id", {
    method: "POST", body: JSON.stringify({ name: folderName(`${meta.label}: ${row?.name ?? entityId}`), mimeType: FOLDER, parents: [conn.root_folder_id] }),
  })
  const folderId = (await created.json()).id as string
  await sql`insert into drive_folders (studio_id, entity, entity_id, folder_id) values (${conn.studio_id}, ${entity}, ${entityId}, ${folderId}) on conflict do nothing`
  return folderId
}

/** Abre una subida reanudable: el navegador manda el archivo directo a Google (las funciones de Vercel no aceptan archivos grandes). */
export async function startUpload(conn: Connection, file: { name: string; contentType: string; size: number }, parentId: string) {
  const response = await fetch(`${UPLOAD}/files?uploadType=resumable&fields=id`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await ownerToken(conn)}`, "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": file.contentType, "X-Upload-Content-Length": String(file.size),
      Origin: appOrigin(), // sin esto Google no permite subir desde el navegador (CORS)
    },
    body: JSON.stringify({ name: file.name, parents: [parentId] }),
  })
  const url = response.headers.get("location")
  if (!response.ok || !url) throw new Error(`Google Drive respondió ${response.status}`)
  return url
}

export type DriveFile = { id: string; name: string; mimeType: string; size?: string; parents?: string[]; trashed?: boolean }

export async function fileMeta(conn: Connection, fileId: string): Promise<DriveFile> {
  const response = await api(await readToken(conn), `/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,parents,trashed`)
  return response.json()
}

/** Descarga (o exporta a PDF si es un documento de Google) y devuelve la respuesta de Google para reenviarla en streaming. */
export async function openFile(conn: Connection, fileId: string, mimeType: string) {
  const native = mimeType.startsWith("application/vnd.google-apps.")
  const path = native ? `/files/${encodeURIComponent(fileId)}/export?mimeType=application%2Fpdf` : `/files/${encodeURIComponent(fileId)}?alt=media`
  const response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${await readToken(conn)}` } })
  return { response, exported: native }
}

/** Manda el archivo a la papelera de Drive (se recupera 30 días). Solo puede los que creó la app. */
export async function trashFile(conn: Connection, fileId: string) {
  await api(await ownerToken(conn), `/files/${encodeURIComponent(fileId)}`, { method: "PATCH", body: JSON.stringify({ trashed: true }) })
}

// --- Sincronización: lo que hay en la carpeta → Documentos -----------------------------------------------------------------

const MAX_FILES = 5000

/** Recorre la carpeta del estudio y sus subcarpetas (hasta 6 niveles) y deja Documentos igual que Drive. */
export async function syncFolder(studioId: string) {
  const conn = await connectionOf(studioId)
  if (!conn) throw new Error("Drive no está conectado.")
  const token = await readToken(conn)
  const folderEntity = new Map((await sql<{ folder_id: string; entity: DocEntity; entity_id: string }>`select folder_id, entity, entity_id from drive_folders where studio_id = ${studioId}`).map((f) => [f.folder_id, f]))

  const seen: { file: DriveFile; parent: string }[] = []
  let level = [conn.root_folder_id]
  for (let depth = 0; depth < 6 && level.length && seen.length < MAX_FILES; depth++) {
    const next: string[] = []
    for (const folderId of level) {
      let pageToken = ""
      do {
        const params = new URLSearchParams({
          q: `'${folderId}' in parents and trashed = false`, fields: "nextPageToken, files(id,name,mimeType,size)", pageSize: "1000",
          ...(pageToken ? { pageToken } : {}),
        })
        const page = await (await api(token, `/files?${params}`)).json() as { nextPageToken?: string; files: DriveFile[] }
        for (const file of page.files) {
          if (file.mimeType === FOLDER) next.push(file.id)
          else if (file.mimeType !== "application/vnd.google-apps.shortcut") seen.push({ file, parent: folderId })
        }
        pageToken = page.nextPageToken ?? ""
      } while (pageToken && seen.length < MAX_FILES)
    }
    level = next
  }

  for (const { file, parent } of seen) {
    const link = folderEntity.get(parent)
    await sql`
      insert into documents (studio_id, name, size, content_type, drive_file_id, provider, entity, entity_id)
      values (${studioId}, ${file.name}, ${Number(file.size ?? 0)}, ${file.mimeType}, ${file.id}, 'gdrive', ${link?.entity ?? null}, ${link?.entity_id ?? null})
      on conflict (studio_id, drive_file_id) where drive_file_id is not null do update set name = excluded.name, size = excluded.size, content_type = excluded.content_type`
  }
  // Lo que ya no está en Drive (borrado o movido afuera) deja de aparecer. Si la lista llegó cortada no se borra nada.
  if (seen.length < MAX_FILES) {
    const ids = seen.map((s) => s.file.id)
    await query(`delete from documents where studio_id = $1 and provider = 'gdrive' and not (drive_file_id = any($2::text[]))`, [studioId, ids])
  }
  await sql`update studio_drive set last_sync_at = now(), status = 'ok', last_error = null where studio_id = ${studioId}`
  return seen.length
}

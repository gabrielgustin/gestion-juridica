import "server-only"
import { createReadStream, promises as fs } from "node:fs"
import path from "node:path"
import { Readable } from "node:stream"

export * from "@/lib/storage-paths"

// Almacenamiento de documentos.
// - Con BLOB_READ_WRITE_TOKEN: Vercel Blob privado (los archivos solo se leen a través de la app).
// - Sin token (local): ./data/uploads.

export const blobEnabled = Boolean(process.env.BLOB_READ_WRITE_TOKEN)
const LOCAL_DIR = path.join(process.cwd(), "data", "uploads")

const localPath = (pathname: string) => path.join(LOCAL_DIR, ...pathname.split("/"))

export async function saveLocal(pathname: string, data: Buffer) {
  const file = localPath(pathname)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, data, { flag: "wx" })
}

/** Tamaño real del archivo guardado, o null si no existe. */
export async function storedSize(pathname: string): Promise<number | null> {
  if (blobEnabled) {
    const { head } = await import("@vercel/blob")
    return head(pathname).then((b) => b.size).catch(() => null)
  }
  return fs.stat(localPath(pathname)).then((s) => s.size).catch(() => null)
}

export async function readStored(pathname: string): Promise<ReadableStream | null> {
  if (blobEnabled) {
    const { get } = await import("@vercel/blob")
    const result = await get(pathname, { access: "private" }).catch(() => null)
    return result?.stream ?? null
  }
  const file = localPath(pathname)
  if (!(await fs.stat(file).catch(() => null))) return null
  return Readable.toWeb(createReadStream(file)) as ReadableStream
}

export async function deleteStored(pathname: string) {
  if (blobEnabled) {
    const { del } = await import("@vercel/blob")
    await del(pathname)
    return
  }
  await fs.rm(localPath(pathname), { force: true })
}

/** Guarda un archivo desde el servidor (archivos que se bajan de los tribunales). */
export async function putStored(pathname: string, data: Buffer, contentType: string) {
  if (blobEnabled) {
    const { put } = await import("@vercel/blob")
    await put(pathname, data, { access: "private", contentType, addRandomSuffix: false })
    return
  }
  await saveLocal(pathname, data)
}

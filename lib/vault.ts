import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

// Bóveda de claves de tribunales: AES-256-GCM con la llave COURT_VAULT_KEY (32 bytes en base64).
// Formato guardado: v1:<iv base64>:<tag base64>:<cifrado base64>. La llave nunca va a la base.

function key(): Buffer {
  const raw = process.env.COURT_VAULT_KEY
  if (!raw) {
    if (process.env.NODE_ENV === "production") throw new Error("Falta COURT_VAULT_KEY para cifrar las claves de tribunales.")
    return Buffer.alloc(32, 7) // solo desarrollo local
  }
  const buf = Buffer.from(raw, "base64")
  if (buf.length !== 32) throw new Error("COURT_VAULT_KEY tiene que ser de 32 bytes en base64 (openssl rand -base64 32).")
  return buf
}

export function seal(plain: string, aad = ""): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  cipher.setAAD(Buffer.from(aad))
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":")
}

/** `aad` ata el secreto a su conexión: un secreto copiado a otra fila no se puede abrir. */
export function open(sealed: string, aad = ""): string {
  const [version, iv, tag, data] = sealed.split(":")
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Secreto con formato desconocido.")
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"))
  decipher.setAAD(Buffer.from(aad))
  decipher.setAuthTag(Buffer.from(tag, "base64"))
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8")
}

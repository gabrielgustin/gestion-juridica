import { createVerify, generateKeyPairSync } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
const sqlMock = vi.fn()
const queryMock = vi.fn()
vi.mock("@/lib/sql", () => ({ sql: (...a: unknown[]) => sqlMock(...a), query: (...a: unknown[]) => queryMock(...a) }))
vi.mock("@/lib/vault", () => ({ seal: (s: string) => s, open: (s: string) => s }))
vi.mock("@/lib/documents", () => ({ DOC_ENTITIES: { matter: { table: "matters", label: "Expediente", nameCol: "caption" } } }))

const conn = {
  studio_id: "s1", root_folder_id: "root", account: null, status: "ok", last_error: null, last_sync_at: null,
  expires_at: new Date(Date.now() + 3600_000), secret: JSON.stringify({ access: "owner-token", refresh: "r" }),
}
const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, ...init })

afterEach(() => { vi.restoreAllMocks(); sqlMock.mockReset(); queryMock.mockReset(); delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON })

describe("Google Drive", async () => {
  const drive = await import("@/lib/integrations/drive")

  it("pide solo el permiso drive.file", () => {
    process.env.GOOGLE_CLIENT_ID = "id"
    const url = new URL(drive.authUrl("st"))
    expect(url.searchParams.get("scope")).toContain("auth/drive.file")
    expect(url.searchParams.get("scope")).not.toMatch(/auth\/drive(\s|$)/)
  })

  it("abre la subida reanudable con Origin y carpeta destino", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200, headers: { location: "https://upload.example/session" } }))
    const url = await drive.startUpload(conn, { name: "escrito.pdf", contentType: "application/pdf", size: 10 }, "folder1")
    expect(url).toBe("https://upload.example/session")
    const [, init] = fetchMock.mock.calls[0]
    expect((init!.headers as Record<string, string>).Origin).toBeTruthy()
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer owner-token")
    expect(JSON.parse(init!.body as string)).toEqual({ name: "escrito.pdf", parents: ["folder1"] })
  })

  it("firma el pedido de la cuenta de servicio con RS256", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: "sa@x.iam", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) })
    const calls: string[] = []
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const target = String(input)
      calls.push(target)
      if (target.includes("oauth2.googleapis.com/token")) {
        const assertion = new URLSearchParams(String(init!.body)).get("assertion")!
        const [h, c, sig] = assertion.split(".")
        expect(createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey, sig, "base64url")).toBe(true)
        expect(JSON.parse(Buffer.from(c, "base64url").toString()).iss).toBe("sa@x.iam")
        return json({ access_token: "sa-token", expires_in: 3600 })
      }
      expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer sa-token")
      return json({ id: "f1", name: "a.pdf", mimeType: "application/pdf", parents: ["root"] })
    })
    expect((await drive.fileMeta(conn, "f1")).name).toBe("a.pdf")
    expect(calls.some((c) => c.includes("/files/f1"))).toBe(true)
  })

  it("sincroniza: recorre subcarpetas, ignora atajos y borra lo que ya no está", async () => {
    sqlMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const text = strings.join("?")
      if (text.includes("from studio_drive")) return [conn]
      if (text.includes("from drive_folders")) return [{ folder_id: "sub1", entity: "matter", entity_id: "m1" }]
      return []
    })
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const q = new URL(String(input)).searchParams.get("q") ?? ""
      if (q.startsWith("'root'")) return json({ files: [{ id: "sub1", name: "Exp", mimeType: drive.FOLDER }, { id: "a", name: "a.pdf", mimeType: "application/pdf", size: "5" }, { id: "s", name: "atajo", mimeType: "application/vnd.google-apps.shortcut" }] })
      return json({ files: [{ id: "b", name: "b.pdf", mimeType: "application/pdf", size: "7" }] })
    })
    expect(await drive.syncFolder("s1")).toBe(2)
    const inserts = sqlMock.mock.calls.filter(([s]) => s.join("?").includes("insert into documents"))
    expect(inserts).toHaveLength(2)
    expect(queryMock).toHaveBeenCalledOnce()
    expect(queryMock.mock.calls[0][1]).toEqual(["s1", ["a", "b"]])
  })
})

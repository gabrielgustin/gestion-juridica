"use server"

import { createHash } from "node:crypto"
import { redirect } from "next/navigation"
import { getMember } from "@/lib/session"
import { sql } from "@/lib/sql"
import { getClient, newCode } from "@/lib/oauth"

/** Aprueba o rechaza la conexión. Vuelve a validar todo: los campos del formulario no son de fiar. */
export async function decide(form: FormData) {
  const { user, studio } = await getMember()
  const client = await getClient(form.get("client_id"))
  const redirectUri = String(form.get("redirect_uri") ?? "")
  const challenge = String(form.get("code_challenge") ?? "")
  if (!client || !client.redirect_uris.includes(redirectUri) || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) redirect("/oauth/authorize?error=1")

  const target = new URL(redirectUri)
  const state = form.get("state")
  if (typeof state === "string" && state) target.searchParams.set("state", state)
  if (form.get("decision") !== "allow") {
    target.searchParams.set("error", "access_denied")
    redirect(target.toString())
  }

  const code = newCode()
  await sql`insert into oauth_codes (code_hash, client_id, studio_id, user_id, redirect_uri, code_challenge, expires_at)
    values (${createHash("sha256").update(code).digest("hex")}, ${client.id}, ${studio.id}, ${user.id}, ${redirectUri}, ${challenge}, now() + interval '5 minutes')`
  target.searchParams.set("code", code)
  redirect(target.toString())
}

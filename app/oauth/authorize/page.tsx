import { redirect } from "next/navigation"
import { getMember } from "@/lib/session"
import { getClient } from "@/lib/oauth"
import { decide } from "./actions"

type Params = Record<string, string | string[] | undefined>
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ""

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-ink p-4">
      <div className="w-full max-w-md">
        <img src="/logo-vertical-negativo.svg" alt="Cobos Porta · Abogado" className="mx-auto mb-6 w-48" />
        <div className="rounded-lg bg-white p-6">{children}</div>
      </div>
    </main>
  )
}

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams
  const { user, studio } = await getMember() // sin sesión va al login y vuelve acá (lo resuelve el proxy)
  const client = await getClient(one(params.client_id))
  const redirectUri = one(params.redirect_uri)
  const challenge = one(params.code_challenge)
  const valid = client && client.redirect_uris.includes(redirectUri) && one(params.response_type) === "code" &&
    one(params.code_challenge_method) === "S256" && /^[A-Za-z0-9_-]{43}$/.test(challenge)

  // Con datos inválidos no se redirige a ningún lado: se muestra el error acá.
  if (!valid) {
    return <Shell><h1 className="text-xl">No se pudo conectar</h1><p className="mt-2 text-sm text-ink-soft">El pedido de conexión es inválido o está incompleto. Volvé a intentarlo desde Claude.</p></Shell>
  }

  return (
    <Shell>
      <h1 className="text-xl">Conectar {client.name} con tu estudio</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Vas a darle acceso a <b>{client.name}</b> al estudio <b>{studio.name}</b>, con tu usuario ({user.email}).
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
        <li>Consultar expedientes, agenda y clientes</li>
        <li>Crear tareas y guardar escritos</li>
      </ul>
      <p className="mt-3 text-xs text-ink-soft">Ve solo lo que vos ves. Podés revocarlo cuando quieras desde Integraciones.</p>
      <form action={decide} className="mt-5 flex gap-2">
        {["client_id", "redirect_uri", "code_challenge", "state"].map((name) => <input key={name} type="hidden" name={name} value={one(params[name])} />)}
        <button name="decision" value="allow" className="btn flex-1">Permitir</button>
        <button name="decision" value="deny" className="btn-ghost flex-1">Cancelar</button>
      </form>
    </Shell>
  )
}

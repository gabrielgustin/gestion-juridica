import { googleEnabled } from "@/lib/auth"
import { LoginForm } from "./login-form"

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  // Solo rutas internas: evita usar el login para redirigir a otro sitio.
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/inicio"
  return (
    <main className="grid min-h-screen place-items-center bg-ink p-4">
      <div className="w-full max-w-sm">
        <h1 className="sr-only">Cobos Porta · Abogado</h1>
        <img src="/logo-vertical-negativo.svg" alt="Cobos Porta · Abogado" className="mx-auto mb-4 w-56" />
        <p className="mb-6 text-center text-sm text-white/70">Tus causas, plazos y escritos en un solo lugar.</p>
        <div className="rounded-lg bg-white p-5"><LoginForm next={safeNext} google={googleEnabled} /></div>
      </div>
    </main>
  )
}

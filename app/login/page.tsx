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
        <p className="mt-4 text-center text-xs text-white/60">
          <a href="/privacidad" className="hover:underline">Privacidad</a> · <a href="/terminos" className="hover:underline">Términos</a>
        </p>
        <p className="mt-3 text-center text-white/60"><a href="https://www.autogestiva.com.ar" target="_blank" rel="noopener noreferrer" aria-label="Desarrollado por Autogestiva" className="inline-flex items-center gap-1.5 text-xs opacity-70 transition-opacity hover:opacity-100"><span>Desarrollado por</span><svg viewBox="0 0 40 42" className="h-[1.3em] w-auto" aria-hidden="true"><path d="M0 40 L15.5 0 H24.5 L40 40 H30.5 L20 13 L9.5 40 Z" fill="currentColor" /><path transform="translate(-4.4 -6) scale(1.2)" d="M19 22 V37.5 l3.9-3.7 2.9 6 2.8-1.4-2.9-5.9 h5.3z" fill="#f97316" /></svg></a></p>
      </div>
    </main>
  )
}

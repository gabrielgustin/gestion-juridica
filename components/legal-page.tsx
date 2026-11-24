import Link from "next/link"

/** Marco de las páginas públicas de privacidad y términos (Google las pide para habilitar la conexión). */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-paper px-4 py-10">
      <article className="card mx-auto max-w-2xl space-y-4 p-6 text-sm leading-relaxed md:p-8 [&_h2]:pt-2 [&_h2]:text-lg [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        <Link href="/login"><img src="/logo-horizontal-negativo.svg" alt="Cobos Porta · Abogado" className="h-12 w-auto rounded bg-ink p-2" /></Link>
        <h1 className="text-3xl">{title}</h1>
        <p className="text-ink-soft">Última actualización: {updated}</p>
        {children}
        <p className="border-t border-line pt-4 text-ink-soft">
          <Link href="/privacidad" className="underline">Privacidad</Link> · <Link href="/terminos" className="underline">Términos</Link> · <Link href="/login" className="underline">Ingresar</Link>
        </p>
      </article>
    </main>
  )
}

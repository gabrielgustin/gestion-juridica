import Link from "next/link"
import { after } from "next/server"
import { Bell, Bot, Briefcase, CalendarDays, FileText, Gavel, Home, Landmark, Plug, Search, Settings, Sparkles, Users } from "lucide-react"
import { sql } from "@/lib/sql"
import { deliverDueReminders } from "@/lib/notifications"
import { getMember } from "@/lib/session"
import { SignOutButton } from "@/components/sign-out-button"

// Cada fase suma su sección acá.
const NAV = [
  { href: "/inicio", label: "Inicio", icon: Home },
  { href: "/expedientes", label: "Expedientes", icon: Briefcase },
  { href: "/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/juzgados", label: "Juzgados", icon: Gavel },
  { href: "/agentes", label: "Agentes IA", icon: Bot },
  { href: "/documentos", label: "Documentos", icon: FileText },
  { href: "/integraciones", label: "Integraciones", icon: Plug },
  { href: "/configuracion", label: "Configuración", icon: Settings },
]

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, studio } = await getMember()
  // Recordatorios vencidos → avisos en la app, sin demorar la página. Los emails los manda el cron.
  after(() => deliverDueReminders(studio.id, { email: false }).catch((e) => console.error("[recordatorios]", e)))
  const [{ unread, court_problems }] = await sql<{ unread: string; court_problems: string }>`
    select (select count(*) from notifications where user_id = ${user.id} and studio_id = ${studio.id} and read_at is null) as unread,
           (select count(*) from court_connections where user_id = ${user.id} and studio_id = ${studio.id} and status in ('error', 'credenciales')) as court_problems`
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-line bg-ink text-white md:w-60 md:border-r">
        <div className="flex items-center gap-2 px-4 py-4">
          {studio.logo
            ? <img src={studio.logo} alt="" className="h-8 w-8 rounded object-cover" />
            : <span className="grid h-8 w-8 place-items-center rounded bg-brand font-serif">{studio.name[0]}</span>}
          <span className="truncate font-serif text-lg">{studio.name}</span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 md:flex-col">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white">
              <Icon size={16} aria-hidden /> {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto hidden border-t border-white/10 p-4 text-xs text-white/70 md:block">
          <div className="truncate">{user.name}</div>
          <div className="mb-2 truncate">{user.email}</div>
          <SignOutButton className="underline hover:text-white" />
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex items-center gap-2 border-b border-line bg-white px-4 py-2 md:px-8">
          <form action="/buscar" role="search" className="relative w-full max-w-md">
            <Search size={16} aria-hidden className="absolute top-2.5 left-3 text-ink-soft" />
            <input name="q" placeholder="Buscar en el estudio…" aria-label="Buscar en el estudio" className="input pl-9" />
          </form>
          <Link href="/mike" className="ml-auto flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-brand hover:bg-brand-soft" aria-label="Mike — Asistente IA">
            <Sparkles size={16} aria-hidden /> <span className="hidden sm:inline">Mike</span>
          </Link>
          <Link href="/integraciones" className="relative rounded-md p-2 hover:bg-paper"
            aria-label={Number(court_problems) ? `Conexiones con tribunales: ${court_problems} con problemas` : "Conexiones con tribunales"}>
            <Landmark size={18} aria-hidden />
            {Number(court_problems) > 0 && <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-danger" />}
          </Link>
          <Link href="/notificaciones" className="relative rounded-md p-2 hover:bg-paper" aria-label={`Notificaciones${Number(unread) ? `: ${unread} sin leer` : ""}`}>
            <Bell size={18} aria-hidden />
            {Number(unread) > 0 && (
              <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] text-white">{Number(unread) > 99 ? "99+" : unread}</span>
            )}
          </Link>
        </header>
        <main className="p-4 md:p-8">{children}</main>
      </div>
    </div>
  )
}

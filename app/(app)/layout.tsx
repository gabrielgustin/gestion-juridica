import Link from "next/link"
import { after } from "next/server"
import { Bell, Landmark, Search, Sparkles } from "lucide-react"
import { sql } from "@/lib/sql"
import { deliverDueReminders } from "@/lib/notifications"
import { getMember } from "@/lib/session"
import { SignOutButton } from "@/components/sign-out-button"
import { AppSidebar } from "@/components/app-sidebar"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, studio } = await getMember()
  // Recordatorios vencidos → avisos en la app, sin demorar la página. Los emails los manda el cron.
  after(() => deliverDueReminders(studio.id, { email: false }).catch((e) => console.error("[recordatorios]", e)))
  const [{ unread, court_problems }] = await sql<{ unread: string; court_problems: string }>`
    select (select count(*) from notifications where user_id = ${user.id} and studio_id = ${studio.id} and read_at is null) as unread,
           (select count(*) from court_connections where user_id = ${user.id} and studio_id = ${studio.id} and status in ('error', 'credenciales')) as court_problems`
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AppSidebar userName={user.name}>
        <div className="truncate">{user.name}</div>
        <div className="mb-2 truncate">{user.email}</div>
        <SignOutButton className="underline hover:text-white" />
      </AppSidebar>
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

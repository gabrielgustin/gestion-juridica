"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Bot, Briefcase, CalendarDays, FileText, Gavel, Home, Menu, Plug, Settings, Users, X } from "lucide-react"

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

/** Barra lateral en escritorio; en celular, una barra superior fija con el menú desplegable. */
export function AppSidebar({ userName, children }: { userName: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  useEffect(() => setOpen(false), [pathname])

  return (
    <aside className="sticky top-0 z-40 flex max-h-screen shrink-0 flex-col overflow-y-auto border-line bg-ink text-white md:static md:max-h-none md:min-h-screen md:w-60 md:overflow-visible md:border-r">
      <div className="flex items-center justify-between px-4 py-3 md:py-4">
        <div className="min-w-0">
          <Link href="/inicio"><img src="/logo-cambel.png" alt="Cambel Red Jurídica" className="h-9 w-auto" /></Link>
          <div className="mt-1 truncate text-sm text-white/80">{userName}</div>
        </div>
        <button type="button" className="rounded-md p-2 hover:bg-white/10 md:hidden" aria-expanded={open} aria-controls="menu-principal" aria-label={open ? "Cerrar menú" : "Abrir menú"} onClick={() => setOpen(!open)}>
          {open ? <X size={22} aria-hidden /> : <Menu size={22} aria-hidden />}
        </button>
      </div>
      <div id="menu-principal" className={`${open ? "flex" : "hidden"} flex-1 flex-col md:flex`}>
        <nav className="flex flex-col gap-1 px-2" aria-label="Principal">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`)
            return (
              <Link key={href} href={href} aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2 rounded-md px-3 py-2.5 text-sm md:py-2 ${active ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"}`}>
                <Icon size={16} aria-hidden /> {label}
              </Link>
            )
          })}
        </nav>
        <div className="mt-auto border-t border-white/10 p-4 text-xs text-white/70">{children}</div>
      </div>
    </aside>
  )
}

import Link from "next/link"
import { getMember } from "@/lib/session"
import { sql } from "@/lib/sql"
import { markAllNotificationsRead } from "@/lib/actions/tasks"

export default async function NotificationsPage() {
  const { user, studio } = await getMember()
  const rows = await sql<{ id: string; title: string; body: string | null; link: string | null; created_at: Date; read_at: Date | null }>`
    select id, title, body, link, created_at, read_at from notifications
    where user_id = ${user.id} and studio_id = ${studio.id} order by created_at desc limit 100`
  const unread = rows.some((r) => !r.read_at)

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl">Notificaciones</h1>
        {unread && <form action={markAllNotificationsRead}><button className="btn-ghost">Marcar todas como leídas</button></form>}
      </div>
      {rows.length === 0 && <p className="text-ink-soft">No tenés notificaciones.</p>}
      <ul className="card divide-y divide-line">
        {rows.map((n) => (
          <li key={n.id} className={`p-3 text-sm ${n.read_at ? "text-ink-soft" : ""}`}>
            <div className="flex justify-between gap-3">
              {n.link ? <Link href={n.link} className={`hover:underline ${n.read_at ? "" : "font-medium"}`}>{n.title}</Link> : <span>{n.title}</span>}
              <time className="shrink-0 text-xs text-ink-soft">{new Date(n.created_at).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" })}</time>
            </div>
            {n.body && <p className="text-ink-soft">{n.body}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}

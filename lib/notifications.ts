import "server-only"
import { query, sql, type Queryable } from "@/lib/sql"
import { linkMail, sendMail } from "@/lib/mail"
import { hmOf, ymdOf } from "@/lib/dates"

export async function notify(tx: Queryable, studioId: string, userIds: string[], title: string, link: string, body?: string) {
  if (!userIds.length) return
  await tx.query(
    `insert into notifications (studio_id, user_id, title, body, link) select $1, unnest($2::text[]), $3, $4, $5`,
    [studioId, userIds, title, body ?? null, link],
  )
}

const appUrl = () =>
  process.env.BETTER_AUTH_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:4700")

/**
 * Recordatorios vencidos → notificación en la app + email a cada asignado.
 * Se marca reminded_at en la misma consulta que los toma, así dos ejecuciones simultáneas no duplican avisos.
 * Sin `studioId` procesa todos los estudios (cron); con `studioId`, solo ese (al navegar).
 */
export async function deliverDueReminders(studioId?: string, { email = true } = {}) {
  const due = await query<{ id: string; studio_id: string; title: string; starts_at: Date; all_day: boolean }>(
    `update tasks set reminded_at = now()
     where id in (
       select id from tasks
       where remind_minutes is not null and reminded_at is null
         and starts_at - make_interval(mins => remind_minutes) <= now()
         and starts_at > now() - interval '1 day'
         ${studioId ? "and studio_id = $1" : ""}
       limit 200 for update skip locked)
     returning id, studio_id, title, starts_at, all_day`,
    studioId ? [studioId] : [],
  )
  for (const task of due) {
    const users = await sql<{ id: string; email: string }>`
      select u.id, u.email from assignments a join "user" u on u.id = a.user_id
      join members m on m.user_id = u.id and m.studio_id = ${task.studio_id} and m.active
      where a.entity = 'task' and a.entity_id = ${task.id}`
    const when = task.all_day ? ymdOf(task.starts_at).split("-").reverse().join("/") : `${ymdOf(task.starts_at).split("-").reverse().join("/")} ${hmOf(task.starts_at)}`
    const link = `/calendario/${task.id}`
    await notify({ query }, task.studio_id, users.map((u) => u.id), `Recordatorio: ${task.title}`, link, when)
    if (email)
      for (const u of users)
        await sendMail(u.email, `Recordatorio: ${task.title}`, linkMail(`${task.title} — ${when}`, `${appUrl()}${link}`, "Ver en el calendario")).catch((error) =>
          console.error("[recordatorios] no se pudo enviar el email", error),
        )
  }
  return due.length
}

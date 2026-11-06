import { getMember } from "@/lib/session"
import { sql } from "@/lib/sql"
import { planOf } from "@/lib/plans"
import { isPlatformAdmin } from "@/lib/ai/state"
import { rechargeCredits } from "@/lib/actions/mike"
import { ActionForm } from "@/components/action-form"

const pesos = (n: number) => n.toLocaleString("es-AR", { style: "currency", currency: "ARS" })

function Meter({ label, used, total, unit, hint }: { label: string; used: number; total: number; unit?: string; hint?: string }) {
  const pct = Math.min(100, Math.round((used / total) * 100))
  return (
    <div className="card p-4">
      <div className="label">{label}</div>
      <div className="text-2xl font-medium">{used.toLocaleString("es-AR")}<span className="text-sm text-ink-soft"> / {total.toLocaleString("es-AR")}{unit}</span></div>
      <div className="mt-2 h-1.5 rounded bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded bg-brand" style={{ width: `${pct}%` }} />
      </div>
      {hint && <p className="mt-2 text-xs text-ink-soft">{hint}</p>}
    </div>
  )
}

export default async function UsagePage() {
  const { studio, user } = await getMember()
  const plan = planOf(studio.plan)
  const [{ users, matters, storage, court_files, credit, month_spend }] = await sql<{ users: string; matters: string; storage: string; court_files: string; credit: string; month_spend: string }>`
    select (select count(*) from members where studio_id = ${studio.id} and active) as users,
           (select count(*) from matters where studio_id = ${studio.id} and not archived and deleted_at is null) as matters,
           (select coalesce(sum(size), 0) from documents where studio_id = ${studio.id} and source = 'upload') as storage,
           (select coalesce(sum(size), 0) from documents where studio_id = ${studio.id} and source = 'tribunal') as court_files,
           (select coalesce(sum(amount), 0) from ai_ledger where studio_id = ${studio.id}) as credit,
           (select coalesce(-sum(amount), 0) from ai_ledger where studio_id = ${studio.id} and kind = 'consumo' and created_at >= date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires') as month_spend`
  const ledger = await sql<{ id: string; kind: string; amount: string; detail: string | null; created_at: Date; who: string | null }>`
    select l.id, l.kind, l.amount, l.detail, l.created_at, u.name as who from ai_ledger l left join "user" u on u.id = l.user_id
    where l.studio_id = ${studio.id} order by l.created_at desc limit 30`
  return (
    <div className="max-w-3xl">
      <h2 className="text-lg font-medium">Plan y uso · {plan.label}</h2>
      <p className="mb-4 text-sm text-ink-soft">Cuánto usa el estudio de lo que incluye su plan.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Meter label="Usuarios activos" used={Number(users)} total={plan.users} />
        <Meter label="Expedientes activos" used={Number(matters)} total={plan.expedientes} hint="Los archivados y los de la papelera no cuentan." />
        <Meter label="Almacenamiento" used={Math.round(Number(storage) / 1024 ** 2)} total={plan.storageMb} unit=" MB" />
        <Meter label="Archivos de tribunales" used={Math.round(Number(court_files) / 1024 ** 2)} total={plan.courtFilesMb} unit=" MB" hint="Lo que se baja solo de los tribunales tiene su propio límite." />
      </div>

      <section className="card mt-6 space-y-3 p-5" aria-labelledby="creditos">
        <h3 id="creditos" className="text-lg font-medium">Créditos de IA</h3>
        <div className="flex flex-wrap gap-6">
          <div><div className="label">Saldo</div><div className={`text-2xl font-medium ${Number(credit) <= 0 ? "text-danger" : ""}`}>{pesos(Number(credit))}</div></div>
          <div><div className="label">Consumido este mes</div><div className="text-2xl font-medium">{pesos(Number(month_spend))}</div></div>
        </div>
        <p className="text-xs text-ink-soft">Los créditos son pesos (1 crédito = $1). Cada consulta a Mike y cada análisis del agente de vencimientos descuenta según lo que procesa.</p>
        {Number(credit) <= 0 && <p className="text-sm text-danger">La IA no está activa: el estudio no tiene saldo. Vuelve a funcionar cuando se recarguen créditos.</p>}
        {isPlatformAdmin(user.email) && (
          <ActionForm action={rechargeCredits} submit="Cargar créditos" className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
            <div><label className="label" htmlFor="amount">Monto ($)</label><input id="amount" name="amount" inputMode="decimal" required className="input w-36" /></div>
            <div className="min-w-48 flex-1"><label className="label" htmlFor="detail">Detalle</label><input id="detail" name="detail" maxLength={200} placeholder="Recarga de créditos" className="input" /></div>
          </ActionForm>
        )}
        {ledger.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm text-brand">Ver el detalle de consumos y recargas</summary>
            <table className="mt-2 w-full text-left text-sm">
              <tbody className="divide-y divide-line">
                {ledger.map((l) => (
                  <tr key={l.id}>
                    <td className="py-1.5 pr-2 whitespace-nowrap text-ink-soft">{new Date(l.created_at).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" })}</td>
                    <td className="py-1.5 pr-2">{l.detail}{l.who ? ` · ${l.who}` : ""}</td>
                    <td className={`py-1.5 text-right whitespace-nowrap ${Number(l.amount) < 0 ? "" : "text-ok"}`}>{pesos(Number(l.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </section>
    </div>
  )
}

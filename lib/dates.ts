// Fechas del estudio: todo se muestra y se carga en hora de Argentina (UTC-3, sin horario de verano).

export const TZ = "America/Argentina/Buenos_Aires"
const OFFSET = "-03:00"
const YMD = /^\d{4}-\d{2}-\d{2}$/
const HM = /^\d{2}:\d{2}$/

/** 'YYYY-MM-DD' de un instante, en hora argentina. */
export const ymdOf = (date: Date | string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(date))
export const hmOf = (date: Date | string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(date))
export const todayYmd = () => ymdOf(new Date())

export const isYmd = (value: string) => YMD.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))

/** Instante a partir de fecha y hora locales (sin hora = 00:00). Devuelve null si no son válidas. */
export function localToIso(ymd: string, hm?: string | null): string | null {
  if (!isYmd(ymd) || (hm && !HM.test(hm))) return null
  const date = new Date(`${ymd}T${hm || "00:00"}:00${OFFSET}`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function addDays(ymd: string, days: number) {
  const date = new Date(`${ymd}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** 0 = domingo. */
export const weekday = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay()
export const startOfWeek = (ymd: string) => addDays(ymd, -weekday(ymd))
export const startOfMonth = (ymd: string) => `${ymd.slice(0, 7)}-01`

/** Semanas (domingo a sábado) que cubren el mes de `ymd`, para la grilla mensual. */
export function monthGrid(ymd: string): string[][] {
  const first = startOfMonth(ymd)
  const month = first.slice(0, 7)
  const weeks: string[][] = []
  let day = startOfWeek(first)
  do {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(day, i)))
    day = addDays(day, 7)
  } while (day.slice(0, 7) === month)
  return weeks
}

export function addMonths(ymd: string, months: number) {
  const [y, m] = ymd.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1 + months, 1))
  return date.toISOString().slice(0, 10)
}

export const formatDay = (ymd: string, options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }) =>
  new Intl.DateTimeFormat("es-AR", { ...options, timeZone: "UTC" }).format(new Date(`${ymd}T12:00:00Z`))

export const formatMonth = (ymd: string) => formatDay(ymd, { month: "long", year: "numeric" })

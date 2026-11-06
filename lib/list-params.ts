export type Params = Record<string, string | string[] | undefined>

export const many = (value: string | string[] | undefined) => (Array.isArray(value) ? value : value ? [value] : [])

export const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? ""

/** URL de la misma lista con algunos parámetros cambiados (null los quita). Resetea la página. */
export function withParams(path: string, current: Params, changes: Record<string, string | null>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(current))
    if (value && key !== "page") for (const v of Array.isArray(value) ? value : [value]) params.append(key, v)
  for (const [key, value] of Object.entries(changes)) value === null ? params.delete(key) : params.set(key, value)
  const query = params.toString()
  return query ? `${path}?${query}` : path
}

/** Orden seguro: solo columnas de la lista blanca. */
export function sortOf<K extends string>(params: Params, allowed: Record<K, string>, fallback: K) {
  const key = one(params.sort) as K
  const column = allowed[key] ? key : fallback
  const dir = one(params.dir) === "desc" ? "desc" : "asc"
  return { key: column, dir, sql: `${allowed[column]} ${dir}` }
}

export const PAGE_SIZE = 50
export const pageOf = (params: Params) => Math.max(1, Number(one(params.page)) || 1)

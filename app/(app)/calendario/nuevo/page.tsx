import Link from "next/link"
import { TaskForm } from "@/components/tasks/task-form"
import { isYmd } from "@/lib/dates"
import { one, type Params } from "@/lib/list-params"

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams
  const date = one(params.fecha)
  const matterId = one(params.expediente)
  return (
    <div className="space-y-4">
      <Link href="/calendario" className="text-sm text-ink-soft hover:underline">← Calendario</Link>
      <h1 className="font-serif text-3xl">Nueva tarea o evento</h1>
      <TaskForm defaults={{ date: isYmd(date) ? date : undefined, matterId: /^[0-9a-f-]{36}$/i.test(matterId) ? matterId : undefined }} />
    </div>
  )
}

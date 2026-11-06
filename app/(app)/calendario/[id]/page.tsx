import Link from "next/link"
import { notFound } from "next/navigation"
import { getMember } from "@/lib/session"
import { sql } from "@/lib/sql"
import { loadLinks } from "@/lib/entities"
import { isOverdue } from "@/lib/tasks"
import { TaskForm } from "@/components/tasks/task-form"
import { DeleteTaskButton } from "@/components/tasks/delete-task-button"
import { Chip } from "@/components/chips"
import { EntityDocuments } from "@/components/documents/entity-documents"

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const { studio } = await getMember()
  const [task] = await sql<Record<string, any>>`
    select t.*, st.category, m.caption as matter_caption from tasks t
    left join catalog_items st on st.id = t.status_id left join matters m on m.id = t.matter_id
    where t.id = ${id} and t.studio_id = ${studio.id}`
  if (!task) notFound()
  const links = (await loadLinks("task", [id])).get(id)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/calendario" className="text-sm text-ink-soft hover:underline">← Calendario</Link>
          <h1 className="font-serif text-3xl">{task.title}</h1>
          <div className="mt-1 flex flex-wrap gap-2 text-sm">
            {isOverdue(task as Parameters<typeof isOverdue>[0]) && <Chip name="Retrasada" color="#b91c1c" />}
            {!task.status_id && <Chip name="Alerta" color="#d97706" />}
            {task.matter_id && <Link href={`/expedientes/${task.matter_id}`} className="text-brand underline">{task.matter_caption}</Link>}
          </div>
        </div>
        <DeleteTaskButton id={id} />
      </div>
      <TaskForm task={task} links={links} />
      <EntityDocuments entity="task" id={id} />
    </div>
  )
}

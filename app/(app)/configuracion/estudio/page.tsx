import { getMember } from "@/lib/session"
import { ActionForm } from "@/components/action-form"
import { updateStudio } from "../actions"

export default async function StudioPage() {
  const { studio, role } = await getMember()
  const admin = role === "admin"
  return (
    <div className="max-w-xl space-y-6">
      <div className="card p-5">
        <h2 className="text-lg font-medium">Datos del estudio</h2>
        <p className="mb-4 text-sm text-ink-soft">El nombre y el logo aparecen en el sistema, los documentos y los reportes.</p>
        <ActionForm action={updateStudio} submit="Guardar" className="space-y-4">
          <fieldset disabled={!admin} className="space-y-4">
            <div className="flex items-center gap-4">
              {studio.logo
                ? <img src={studio.logo} alt="Logo actual" className="h-16 w-36 shrink-0 rounded bg-ink object-contain p-2" />
                : <span className="grid h-16 w-16 shrink-0 place-items-center rounded bg-brand-soft font-serif text-2xl text-brand">{studio.name[0]}</span>}
              <div className="min-w-0 text-sm">
                <label className="label" htmlFor="logo">Logo</label>
                <input id="logo" name="logo" type="file" className="w-full text-xs" accept="image/png,image/jpeg,image/webp" />
                <p className="text-xs text-ink-soft">PNG, JPG o WebP · máx. 2 MB</p>
                {studio.logo && <label className="mt-1 flex items-center gap-1 text-xs"><input type="checkbox" name="removeLogo" value="1" /> Quitar logo</label>}
              </div>
            </div>
            <div>
              <label className="label" htmlFor="name">Nombre del estudio</label>
              <input id="name" name="name" defaultValue={studio.name} required maxLength={120} className="input" />
            </div>
          </fieldset>
        </ActionForm>
      </div>

    </div>
  )
}

"use server"

import { revalidatePath } from "next/cache"
import { getMember } from "@/lib/session"
import { sql } from "@/lib/sql"
import { cleanWidgets } from "@/lib/dashboard"

export async function saveWidgets(widgets: string[]) {
  const { studio, user } = await getMember()
  const clean = cleanWidgets(widgets)
  await sql`insert into user_settings (studio_id, user_id, widgets) values (${studio.id}, ${user.id}, ${clean})
    on conflict (studio_id, user_id) do update set widgets = excluded.widgets`
  revalidatePath("/inicio")
}

export async function setOnboardingHidden(hidden: boolean) {
  const { studio, user } = await getMember()
  await sql`insert into user_settings (studio_id, user_id, hide_onboarding) values (${studio.id}, ${user.id}, ${hidden})
    on conflict (studio_id, user_id) do update set hide_onboarding = excluded.hide_onboarding`
  revalidatePath("/inicio")
}

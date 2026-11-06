-- Fase 5: preferencias del panel de inicio, por usuario y estudio.
create table user_settings (
  studio_id uuid not null references studios (id) on delete cascade,
  user_id text not null references "user" (id) on delete cascade,
  widgets text[],                       -- null = los de fábrica, en su orden
  hide_onboarding boolean not null default false,
  primary key (studio_id, user_id)
);

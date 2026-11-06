-- Fase 3: calendarios (como catálogo), tareas/eventos, recordatorios y notificaciones.

alter table catalog_items drop constraint catalog_items_kind_check;
alter table catalog_items add constraint catalog_items_kind_check
  check (kind in ('estado', 'etapa', 'fuero', 'parte', 'estado_tarea', 'tipo_cliente', 'tipo_juzgado', 'etiqueta', 'calendario'));

insert into catalog_items (studio_id, kind, name, color, sort)
select id, 'calendario', 'General', '#7a2e3a', 0 from studios
on conflict do nothing;

create table tasks (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios (id) on delete cascade,
  calendar_id uuid references catalog_items (id) on delete set null,
  matter_id uuid references matters (id) on delete set null,
  kind text not null default 'tarea' check (kind in ('tarea', 'evento', 'audiencia', 'vencimiento')),
  title text not null,
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  status_id uuid references catalog_items (id) on delete set null,  -- sin estado = alerta
  remind_minutes integer check (remind_minutes is null or remind_minutes >= 0),
  reminded_at timestamptz,
  created_by text references "user" (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_studio_start_idx on tasks (studio_id, starts_at);
create index tasks_matter_idx on tasks (matter_id);
create index tasks_reminder_idx on tasks (starts_at) where remind_minutes is not null and reminded_at is null;

create table notifications (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios (id) on delete cascade,
  user_id text not null references "user" (id) on delete cascade,
  title text not null,
  body text,
  link text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user_idx on notifications (user_id, read_at, created_at desc);

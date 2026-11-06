-- Fase 6: conexiones con tribunales, sincronizaciones, estados que informa cada tribunal y reportes de problemas.

-- Estados de tribunal dentro del mismo catálogo: source = portal, external_code = lo que informa el portal.
alter table catalog_items add column source text;
alter table catalog_items add column external_code text;
create unique index catalog_items_external_idx on catalog_items (studio_id, kind, source, external_code) where source is not null;
-- El nombre visible puede repetirse entre portales (dos "EN TRÁMITE"): la unicidad por nombre pasa a ser solo de los propios.
alter table catalog_items drop constraint catalog_items_studio_id_kind_name_key;
create unique index catalog_items_own_name_idx on catalog_items (studio_id, kind, name) where source is null;

create table court_connections (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios (id) on delete cascade,
  user_id text not null references "user" (id) on delete cascade,
  portal text not null,
  username text not null,
  secret text not null,                 -- contraseña cifrada (lib/vault.ts); nunca en texto plano
  options jsonb not null default '{}',  -- p. ej. modo de EJE ("mis-causas" | "por-sujeto")
  status text not null default 'pendiente' check (status in ('pendiente', 'sincronizando', 'ok', 'error', 'credenciales')),
  last_error text,
  last_sync_at timestamptz,
  next_sync_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (studio_id, user_id, portal)
);
create index court_connections_due_idx on court_connections (next_sync_at) where status <> 'credenciales';

create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references court_connections (id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'corriendo' check (status in ('corriendo', 'ok', 'error')),
  stats jsonb,
  error text
);
create index sync_runs_connection_idx on sync_runs (connection_id, started_at desc);

alter table matters add column portal text;
alter table matters add column external_id text;
alter table matters add column connection_id uuid references court_connections (id) on delete set null;
create unique index matters_external_idx on matters (studio_id, portal, external_id) where external_id is not null;

alter table documents add column external_id text;
create unique index documents_external_idx on documents (studio_id, source, external_id) where external_id is not null;

create table problem_reports (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios (id) on delete cascade,
  user_id text not null references "user" (id) on delete cascade,
  portal text not null,
  message text not null,
  last_error text,
  created_at timestamptz not null default now()
);

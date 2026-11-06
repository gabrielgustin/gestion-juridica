-- Fase 8: Google Calendar, archivos de Drive/Dropbox vinculados y tokens para el conector MCP.

create table user_integrations (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios (id) on delete cascade,
  user_id text not null references "user" (id) on delete cascade,
  provider text not null check (provider in ('google_calendar')),
  account text,                 -- email de la cuenta conectada
  secret text not null,         -- tokens OAuth cifrados (lib/vault.ts)
  expires_at timestamptz,
  calendar_id text,             -- calendario "Estudio" creado en la cuenta
  status text not null default 'ok' check (status in ('ok', 'error')),
  last_error text,
  created_at timestamptz not null default now(),
  unique (studio_id, user_id, provider)
);

-- Qué evento de Google corresponde a cada tarea, por integración (para actualizar o borrar).
create table calendar_events (
  task_id uuid not null references tasks (id) on delete cascade,
  integration_id uuid not null references user_integrations (id) on delete cascade,
  event_id text not null,
  primary key (task_id, integration_id)
);

-- Tokens personales para el conector MCP: se guarda solo el hash.
create table api_tokens (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios (id) on delete cascade,
  user_id text not null references "user" (id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- Documentos que viven en Drive o Dropbox: se guarda el link, no el archivo.
alter table documents alter column pathname drop not null;
alter table documents add column external_url text;
alter table documents add column provider text check (provider in ('drive', 'dropbox'));
alter table documents add constraint documents_file_or_link check (pathname is not null or external_url is not null);

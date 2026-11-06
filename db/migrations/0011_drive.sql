-- Google Drive como almacenamiento de archivos: una carpeta por estudio, creada y compartida por la app.
create table studio_drive (
  studio_id uuid primary key references studios (id) on delete cascade,
  connected_by text references "user" (id) on delete set null,
  account text,
  secret text not null,           -- tokens OAuth de quien conectó, cifrados (lib/vault.ts)
  expires_at timestamptz,
  root_folder_id text not null,
  status text not null default 'ok' check (status in ('ok', 'error')),
  last_error text,
  last_sync_at timestamptz,
  created_at timestamptz not null default now()
);

-- Subcarpeta de Drive de cada expediente, cliente o juzgado.
create table drive_folders (
  studio_id uuid not null references studios (id) on delete cascade,
  entity text not null check (entity in ('matter', 'client', 'court', 'task')),
  entity_id uuid not null,
  folder_id text not null,
  primary key (studio_id, entity, entity_id)
);

alter table documents add column drive_file_id text;
alter table documents drop constraint documents_provider_check;
alter table documents add constraint documents_provider_check check (provider in ('drive', 'dropbox', 'gdrive'));
alter table documents drop constraint documents_file_or_link;
alter table documents add constraint documents_file_or_link check (pathname is not null or external_url is not null or drive_file_id is not null);
create unique index documents_drive_file_idx on documents (studio_id, drive_file_id) where drive_file_id is not null;

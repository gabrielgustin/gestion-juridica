-- Fase 4: documentos del estudio (archivos en Vercel Blob privado; en local, en ./data/uploads).

create table documents (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios (id) on delete cascade,
  name text not null,
  pathname text not null unique,          -- ruta dentro del almacenamiento
  size bigint not null default 0,
  content_type text,
  entity text check (entity in ('matter', 'client', 'court', 'task')),
  entity_id uuid,
  is_writ boolean not null default false, -- escrito
  source text not null default 'upload' check (source in ('upload', 'tribunal')),
  uploaded_by text references "user" (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((entity is null) = (entity_id is null))
);
create index documents_studio_idx on documents (studio_id, deleted_at, created_at desc);
create index documents_entity_idx on documents (entity, entity_id);

create table document_stars (
  document_id uuid not null references documents (id) on delete cascade,
  user_id text not null references "user" (id) on delete cascade,
  primary key (document_id, user_id)
);

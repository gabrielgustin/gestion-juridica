-- Login estándar (OAuth 2.1 con PKCE) para que Claude se conecte al estudio sin copiar tokens.
create table oauth_clients (
  id text primary key,
  name text not null,
  redirect_uris text[] not null,
  created_at timestamptz not null default now()
);

create table oauth_codes (
  code_hash text primary key,
  client_id text not null references oauth_clients (id) on delete cascade,
  studio_id uuid not null references studios (id) on delete cascade,
  user_id text not null references "user" (id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  expires_at timestamptz not null,
  used_at timestamptz
);

-- Los tokens de Claude viven en la misma tabla que los personales: se ven y se revocan igual.
alter table api_tokens
  add column expires_at timestamptz,
  add column refresh_hash text unique,
  add column refresh_expires_at timestamptz,
  add column client_id text references oauth_clients (id) on delete cascade;

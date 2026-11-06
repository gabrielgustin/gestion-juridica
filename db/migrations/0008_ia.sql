-- Fase 7: asistente de IA (Mike), agente de vencimientos y créditos.

create table ai_settings (
  studio_id uuid primary key references studios (id) on delete cascade,
  enabled boolean not null default true,              -- Mike para todo el estudio
  deadline_agent boolean not null default true,       -- agente de vencimientos
  identity text,                                      -- cómo se presenta y escribe (tono, firma, criterios del estudio)
  watch text                                          -- qué vigila / prioridades
);

-- Base de conocimiento y jurisprudencia del estudio: se le pasan a Mike como contexto.
create table ai_knowledge (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios (id) on delete cascade,
  kind text not null check (kind in ('conocimiento', 'jurisprudencia')),
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);
create index ai_knowledge_studio_idx on ai_knowledge (studio_id, kind);

create table ai_conversations (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios (id) on delete cascade,
  user_id text not null references "user" (id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_conversations_user_idx on ai_conversations (studio_id, user_id, updated_at desc);

-- Historial exacto que se le reenvía a la API (solo se agrega, nunca se edita: lo exige el modelo).
create table ai_messages (
  id bigserial primary key,
  conversation_id uuid not null references ai_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content jsonb not null,
  created_at timestamptz not null default now()
);
create index ai_messages_conversation_idx on ai_messages (conversation_id, id);

-- Créditos en pesos: recargas (+) y consumos (-). El saldo es la suma.
create table ai_ledger (
  id bigserial primary key,
  studio_id uuid not null references studios (id) on delete cascade,
  user_id text references "user" (id) on delete set null,
  kind text not null check (kind in ('recarga', 'consumo')),
  amount numeric(14, 2) not null,
  detail text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);
create index ai_ledger_studio_idx on ai_ledger (studio_id, created_at desc);

-- Propuestas del agente de vencimientos: el abogado las acepta (se crea el vencimiento) o las descarta.
create table ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios (id) on delete cascade,
  matter_id uuid not null references matters (id) on delete cascade,
  activity_id uuid references matter_activities (id) on delete set null,
  title text not null,
  due_date date not null,
  rationale text,
  status text not null default 'pendiente' check (status in ('pendiente', 'aceptada', 'descartada')),
  task_id uuid references tasks (id) on delete set null,
  created_at timestamptz not null default now()
);
create index ai_suggestions_studio_idx on ai_suggestions (studio_id, status, due_date);
create unique index ai_suggestions_activity_idx on ai_suggestions (activity_id, title) where activity_id is not null;

alter table matter_activities add column analyzed_at timestamptz;

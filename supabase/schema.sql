-- Painel da Cria · OrtoClin
-- Tudo fechado por RLS sem políticas: só as funções do site (chave service_role) leem e gravam.

-- Sessão do WhatsApp (credenciais e chaves do Baileys)
create table if not exists public.wa_auth (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
-- Trava para não abrir duas conexões ao mesmo tempo
create table if not exists public.wa_lock (id text primary key, ate timestamptz not null);
-- Conversas e mensagens
create table if not exists public.wa_chats (
  jid text primary key, nome text, foto text,
  ultima_texto text, ultima_de_mim boolean, ultima_ts bigint, nao_lidas int default 0,
  updated_at timestamptz not null default now()
);
create table if not exists public.wa_messages (
  id text primary key, jid text not null, de_mim boolean not null, texto text not null, ts bigint not null
);
create index if not exists wa_messages_jid_ts on public.wa_messages (jid, ts desc);
-- Estado do painel (contatos, etiquetas, cards, agenda), compartilhado entre dona e recepção
create table if not exists public.painel_estado (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
-- Informações da última sincronização
create table if not exists public.wa_info (id text primary key, data jsonb not null, updated_at timestamptz not null default now());

alter table public.wa_auth enable row level security;
alter table public.wa_lock enable row level security;
alter table public.wa_chats enable row level security;
alter table public.wa_messages enable row level security;
alter table public.painel_estado enable row level security;
alter table public.wa_info enable row level security;

-- Pega a trava por N segundos; devolve true se conseguiu
create or replace function public.wa_travar(segundos int) returns boolean language plpgsql security definer as $$
begin
  insert into public.wa_lock (id, ate) values ('wa', now() + make_interval(secs => segundos))
  on conflict (id) do update set ate = excluded.ate where public.wa_lock.ate < now();
  return found;
end $$;
create or replace function public.wa_destravar() returns void language sql security definer as $$
  update public.wa_lock set ate = now() - interval '1 second' where id = 'wa';
$$;
revoke all on function public.wa_travar(int) from public, anon, authenticated;
revoke all on function public.wa_destravar() from public, anon, authenticated;

alter table public.wa_chats add column if not exists telefone text;

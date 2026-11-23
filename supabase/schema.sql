-- Painel da Cria (demo): guarda o estado da demonstração numa única linha.
-- Rode no SQL Editor do Supabase.
create table if not exists public.demo_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.demo_state enable row level security;
-- Demo pública: qualquer um com o link lê e grava. Não use com dados reais.
create policy "demo leitura" on public.demo_state for select using (true);
create policy "demo escrita" on public.demo_state for insert with check (id = 'default');
create policy "demo update"  on public.demo_state for update using (id = 'default');

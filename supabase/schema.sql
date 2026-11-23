-- À coller dans Supabase > SQL Editor, puis « Run ».
-- Une ligne par compte : la liste des personnages et leur progression, en JSON.
create table if not exists public.comptes (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.comptes enable row level security;

-- Chacun ne peut lire et modifier que sa propre ligne.
create policy "lecture de son compte" on public.comptes
  for select using (auth.uid() = user_id);
create policy "création de son compte" on public.comptes
  for insert with check (auth.uid() = user_id);
create policy "mise à jour de son compte" on public.comptes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

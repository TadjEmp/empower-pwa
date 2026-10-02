-- Lot 2 — SELL IN : signal « dernière semaine de commande » par compte.
-- Additif : 3 tables + 3 colonnes sur comptes. Le CA (sync-sellin) n'est pas touché.
-- Source : onglets « REVENDEURS AU DETAIL Qn » du fichier SELL IN (WEEK = semaine du trimestre).

create table if not exists public.sellin_semaines (
  id               uuid primary key default gen_random_uuid(),
  reseller         text not null,
  reseller_norm    text not null,
  quarter          text not null,                 -- ex. Q2FY27
  semaine          integer not null,              -- semaine DANS le trimestre (1..13)
  ca_eur           numeric not null default 0,
  unites           integer not null default 0,
  commercial_sellin text,                          -- signal (TADJIDINE, LYES… ou NON SUIVI)
  compte_id        uuid references public.comptes(id) on delete set null,
  import_id        uuid,
  created_at       timestamptz default now(),
  unique (reseller_norm, quarter, semaine)
);
create index if not exists idx_sellin_semaines_compte  on public.sellin_semaines (compte_id);
create index if not exists idx_sellin_semaines_quarter on public.sellin_semaines (quarter);

create table if not exists public.sellin_imports (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz default now(),
  fichier          text,
  quarter          text not null,
  semaine_max      integer,
  nb_lignes        integer,
  nb_revendeurs    integer,
  nb_non_matches   integer,
  auteur_pin       integer,
  dry_run          boolean not null default false
);

create table if not exists public.sellin_alias (
  nom_norm         text primary key,              -- nom SELL IN normalisé
  compte_id        uuid not null references public.comptes(id) on delete cascade,
  cree_par         integer,
  created_at       timestamptz default now()
);

alter table public.comptes
  add column if not exists sellin_dernier_quarter  text,
  add column if not exists sellin_derniere_semaine integer,
  add column if not exists sellin_commercial       text;

alter table public.sellin_semaines enable row level security;
alter table public.sellin_imports  enable row level security;
alter table public.sellin_alias    enable row level security;

create policy service_role_all on public.sellin_semaines for all to service_role using (true) with check (true);
create policy service_role_all on public.sellin_imports  for all to service_role using (true) with check (true);
create policy service_role_all on public.sellin_alias    for all to service_role using (true) with check (true);
-- Lecture seule côté app (fiche compte : 4 dernières semaines ; admin : dernier import).
create policy anon_select_sellin_semaines on public.sellin_semaines for select to anon using (true);
create policy anon_select_sellin_imports  on public.sellin_imports  for select to anon using (true);

-- Lot 1 — Visites à froid : fiche magasin persistante (remplace le localStorage)
-- Additif uniquement : nouvelle table + 1 colonne sur visites. Rien d'existant n'est modifié.
-- ID_Cible reste 'HORS_BASE' sur les visites : la liaison se fait via visites.id_fiche_froide.

create table if not exists public.fiches_froides (
  id                     uuid primary key default gen_random_uuid(),
  id_fiche_gas           text not null unique,            -- FRD-xxxx
  nom_magasin            text not null,
  nom_norm               text not null,                   -- nom normalisé (détection de doublon)
  ville                  text,
  departement            text,
  adresse                text,
  tel                    text,
  email                  text,
  contact_nom            text,
  contact_fonction       text,
  pin_cds                integer not null,                -- CDS créateur
  nom_cds                text,
  date_premiere_visite   date,
  date_derniere_visite   date,
  resultat_derniere      text,
  prochaine_action       text,
  date_relance           date,
  commentaire            text,
  statut                 text not null default 'A_QUALIFIER'
    check (statut in ('A_QUALIFIER','A_REVOIR','CONVERTI_PROSPECT','CONVERTI_COMPTE','HISTORIQUE')),
  id_compte_lie          text,                            -- comptes.id_compte_gas si converti
  id_lead_lie            text,                            -- leads.id_prospect_gas si converti
  nb_visites             integer not null default 0,
  doublon_a_revoir       boolean not null default false,  -- même nom normalisé qu'une autre fiche
  deleted                boolean default false,
  deleted_at             timestamptz,
  deleted_by             text,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

create index if not exists idx_fiches_froides_nom_norm on public.fiches_froides (nom_norm);
create index if not exists idx_fiches_froides_pin      on public.fiches_froides (pin_cds);
create index if not exists idx_fiches_froides_statut   on public.fiches_froides (statut);

alter table public.visites add column if not exists id_fiche_froide text;
create index if not exists idx_visites_fiche_froide on public.visites (id_fiche_froide);

alter table public.fiches_froides enable row level security;

-- Même modèle d'accès que visites/comptes (identité = PIN applicatif, pas auth Supabase) :
-- la restriction "un CDS ne voit que ses fiches" est appliquée côté front.
create policy service_role_all on public.fiches_froides for all to service_role using (true) with check (true);
create policy anon_select_fiches_froides on public.fiches_froides for select to anon using (true);
create policy anon_insert_fiches_froides on public.fiches_froides for insert to anon with check (true);
create policy anon_update_fiches_froides on public.fiches_froides for update to anon using (true) with check (true);

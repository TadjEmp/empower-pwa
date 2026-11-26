-- Lot 9 (projet de migration, NON EXÉCUTÉ) : campagnes d'emailing (Norton + T'nB), Go/No Go par compte,
-- exclusions fournisseur et propositions d'enrichissement des contacts.
--
-- Statut : brouillon rédigé le 26/11/2026, à tester sur une branche Supabase avant toute exécution en production.
-- Additif uniquement : rien d'existant n'est supprimé ni renommé. Idempotent (if not exists / drop policy if exists).
-- Modèle de droits repris du lot 8 (structures, contacts) : politique permissive de base + politiques RESTRICTIVE
-- qui portent la vraie règle. Fonctions existantes utilisées : esi_session_valide(), esi_role(), esi_pin(), esi_voit_ligne().
--
-- Droits visés :
--   ADMIN, CHANNEL_MANAGER : tout (créer la campagne, charger les exclusions, changer la version d'email, valider).
--   CDS (commercial)       : voit et met à jour SEULEMENT ses comptes de la campagne, et seulement Go/No Go,
--                            motif et signalement (un trigger refuse tout autre changement).
--   EXTERNE (fournisseur)  : LECTURE SEULE de toute la campagne (campagnes, exclusions, comptes, retours Go/No Go,
--                            signalements, vue campagne_retours) pour alimenter l'onglet « Campagne » ; aucune écriture.
--                            Les propositions d'enrichissement (données de contact) ne lui sont pas exposées.
--   service_role           : tout (import, enrichissement par edge function).
--
-- 1. campagnes             : une ligne par campagne (ici Norton + T'nB, retour des onglets le 27/11/2026).
-- 2. campagne_exclusions   : sociétés que le fournisseur ne veut pas voir contactées pour son offre (liste T'nB).
-- 3. campagne_comptes      : un compte dans une campagne : Go/No Go, version d'email, signalement du commercial.
--                            Garde-fou en base : une société exclue ne peut pas recevoir une version contenant T'nB.
-- 4. enrichissement_propositions : emails, téléphones, contacts trouvés par recherche, à valider avant d'écrire dans comptes.
--
-- Hypothèses à vérifier sur le schéma réel avant exécution :
--   comptes.id (uuid), comptes.id_compte_gas (réf. CPT_xxxx), comptes.pin_cds_assigne (integer) existent ;
--   esi_role() renvoie 'ADMIN' | 'CHANNEL_MANAGER' | 'CDS' | 'EXTERNE' ; esi_pin() renvoie le pin de la session.
-- Retour arrière : voir le bas du fichier.

-- ── 0. Fonctions utilitaires ──
create or replace function public.esi_est_gestionnaire()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select coalesce(public.esi_role() in ('ADMIN', 'CHANNEL_MANAGER'), false) $$;
revoke all on function public.esi_est_gestionnaire() from public;
grant execute on function public.esi_est_gestionnaire() to anon, authenticated, service_role;

create or replace function public.campagnes_touch_updated_at()
returns trigger
language plpgsql set search_path = public, pg_temp
as $$ begin new.updated_at := now(); return new; end $$;

-- ── 1. Campagnes ──
create table if not exists public.campagnes (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,                 -- ex. NORTON_TNB_2026_11
  nom             text not null,
  description     text,
  offres_json     jsonb not null default '[]'::jsonb,   -- les offres (Norton 3+2, pack T'nB 490,17 € HT -15 %)
  statut          text not null default 'preparation'
                  check (statut in ('preparation', 'collecte', 'validee', 'envoyee', 'cloturee')),
  date_limite_retour date,                              -- 27/11/2026 pour les onglets commerciaux
  date_lancement  date,
  cree_par_pin    integer,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── 2. Exclusions fournisseur ──
create table if not exists public.campagne_exclusions (
  id              uuid primary key default gen_random_uuid(),
  campagne_id     uuid not null references public.campagnes (id) on delete cascade,
  societe         text not null,
  societe_norm    text not null,                        -- nom normalisé (minuscules, sans accents ni ponctuation)
  type_societe    text,                                 -- Client | Grossiste | Revendeur
  code_postal     text,
  ville           text,
  compte_id       uuid references public.comptes (id) on delete set null,  -- rapprochement avec la base ESI (null = absente)
  note            text,
  created_at      timestamptz not null default now()
);
create unique index if not exists uq_campagne_exclusions_societe on public.campagne_exclusions (campagne_id, societe_norm, coalesce(code_postal, ''));
create index if not exists idx_campagne_exclusions_compte on public.campagne_exclusions (campagne_id, compte_id) where compte_id is not null;

-- ── 3. Comptes de la campagne ──
create table if not exists public.campagne_comptes (
  id              uuid primary key default gen_random_uuid(),
  campagne_id     uuid not null references public.campagnes (id) on delete cascade,
  compte_id       uuid references public.comptes (id) on delete set null,  -- null = compte pas encore créé / non attribué
  ref_compte      text,                                 -- Réf. compte du fichier (CPT_xxxx), conservée pour l'audit
  nom_compte      text not null,
  pin_cds         integer,                              -- commercial responsable ; null = non attribué
  go_no_go        text check (go_no_go in ('go', 'no_go')),
  motif_no_go     text,
  version_email   text not null default 'norton_tnb'
                  check (version_email in ('norton_tnb', 'norton_seul', 'tnb_seul')),
  version_proposee text check (version_proposee in ('norton_tnb', 'norton_seul', 'tnb_seul')),  -- valeur du fichier d'origine
  signalement     text,                                 -- erreur signalée par le commercial (ex. MGS, Koesio : à confirmer)
  email_cible     text,                                 -- adresse retenue pour l'envoi (copie figée au moment du Go)
  statut_envoi    text not null default 'a_envoyer'
                  check (statut_envoi in ('a_envoyer', 'envoye', 'rebond', 'desinscrit', 'exclu')),
  date_envoi      timestamptz,
  maj_par_pin     integer,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists uq_campagne_comptes_compte on public.campagne_comptes (campagne_id, compte_id) where compte_id is not null;
create unique index if not exists uq_campagne_comptes_ref on public.campagne_comptes (campagne_id, ref_compte) where ref_compte is not null;
create index if not exists idx_campagne_comptes_pin on public.campagne_comptes (campagne_id, pin_cds);
create index if not exists idx_campagne_comptes_go on public.campagne_comptes (campagne_id, go_no_go);

-- Garde-fou : un No Go ne part jamais (statut_envoi 'exclu'), un compte exclu T'nB ne reçoit jamais T'nB,
-- un commercial (CDS) ne modifie que Go/No Go, motif et signalement.
create or replace function public.campagne_comptes_garde()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_exclu boolean := false;
begin
  if new.compte_id is not null then
    select exists (
      select 1 from public.campagne_exclusions e
      where e.campagne_id = new.campagne_id and e.compte_id = new.compte_id
    ) into v_exclu;
  end if;

  if v_exclu and new.version_email in ('norton_tnb', 'tnb_seul') then
    raise exception 'Compte exclu par T''nB : seule la version « norton_seul » est autorisée (%).', new.nom_compte
      using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' and public.esi_role() = 'CDS' then
    if new.campagne_id   is distinct from old.campagne_id
    or new.compte_id     is distinct from old.compte_id
    or new.ref_compte    is distinct from old.ref_compte
    or new.nom_compte    is distinct from old.nom_compte
    or new.pin_cds       is distinct from old.pin_cds
    or new.version_email is distinct from old.version_email
    or new.version_proposee is distinct from old.version_proposee
    or new.email_cible   is distinct from old.email_cible
    or new.statut_envoi  is distinct from old.statut_envoi
    or new.date_envoi    is distinct from old.date_envoi then
      raise exception 'Un commercial ne peut modifier que Go/No Go, motif et signalement.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if new.go_no_go = 'no_go' and new.statut_envoi = 'a_envoyer' then
    new.statut_envoi := 'exclu';
  elsif new.go_no_go is distinct from 'no_go' and new.statut_envoi = 'exclu' then
    new.statut_envoi := 'a_envoyer';
  end if;

  new.maj_par_pin := coalesce(public.esi_pin(), new.maj_par_pin);
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_campagne_comptes_garde on public.campagne_comptes;
create trigger trg_campagne_comptes_garde
  before insert or update on public.campagne_comptes
  for each row execute function public.campagne_comptes_garde();

drop trigger if exists trg_campagnes_touch on public.campagnes;
create trigger trg_campagnes_touch before update on public.campagnes
  for each row execute function public.campagnes_touch_updated_at();

-- ── 4. Propositions d'enrichissement ──
-- Alimentée par une edge function (service_role) ; le commercial valide ou rejette. Aucune écriture directe dans comptes.
create table if not exists public.enrichissement_propositions (
  id              uuid primary key default gen_random_uuid(),
  campagne_id     uuid references public.campagnes (id) on delete set null,
  compte_id       uuid not null references public.comptes (id) on delete cascade,
  champ           text not null check (champ in ('email', 'tel', 'site_web', 'contact_nom', 'contact_fonction')),
  valeur_actuelle text,
  valeur_proposee text not null,
  source_url      text,
  confiance       text not null default 'moyenne' check (confiance in ('faible', 'moyenne', 'haute')),
  controles_json  jsonb not null default '{}'::jsonb,   -- syntaxe, MX, doublon…
  statut          text not null default 'proposee' check (statut in ('proposee', 'validee', 'rejetee', 'appliquee')),
  valide_par_pin  integer,
  date_decision   timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists idx_enrich_compte on public.enrichissement_propositions (compte_id, statut);
create unique index if not exists uq_enrich_proposition on public.enrichissement_propositions (compte_id, champ, lower(valeur_proposee)) where statut in ('proposee', 'validee');

create or replace function public.enrichissement_garde()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if public.esi_role() = 'CDS' then
    if new.compte_id is distinct from old.compte_id or new.champ is distinct from old.champ
       or new.valeur_proposee is distinct from old.valeur_proposee or new.source_url is distinct from old.source_url
       or new.confiance is distinct from old.confiance or new.controles_json is distinct from old.controles_json
       or new.statut not in ('proposee', 'validee', 'rejetee') then
      raise exception 'Un commercial ne peut que valider ou rejeter une proposition.' using errcode = 'insufficient_privilege';
    end if;
  end if;
  if new.statut is distinct from old.statut and new.statut in ('validee', 'rejetee') then
    new.valide_par_pin := coalesce(public.esi_pin(), new.valide_par_pin);
    new.date_decision := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_enrichissement_garde on public.enrichissement_propositions;
create trigger trg_enrichissement_garde before update on public.enrichissement_propositions
  for each row execute function public.enrichissement_garde();

-- ── 5. Droits ──
alter table public.campagnes                   enable row level security;
alter table public.campagne_exclusions         enable row level security;
alter table public.campagne_comptes            enable row level security;
alter table public.enrichissement_propositions enable row level security;
grant select, insert, update, delete on
  public.campagnes, public.campagne_exclusions, public.campagne_comptes, public.enrichissement_propositions
  to anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['campagnes', 'campagne_exclusions', 'campagne_comptes', 'enrichissement_propositions'] loop
    execute format('drop policy if exists service_role_all on public.%I', t);
    execute format('create policy service_role_all on public.%I for all to service_role using (true) with check (true)', t);
    execute format('drop policy if exists anon_acces on public.%I', t);
    execute format('create policy anon_acces on public.%I for all to anon using (true) with check (true)', t);
    execute format('drop policy if exists session_requise on public.%I', t);
    execute format(
      'create policy session_requise on public.%I as restrictive for all to anon, authenticated using ((select public.esi_session_valide())) with check ((select public.esi_session_valide()))',
      t);
  end loop;
end $$;

-- campagnes et exclusions : lecture ADMIN, CHANNEL_MANAGER, CDS, EXTERNE ; écriture gestionnaires seulement.
do $$
declare t text;
begin
  foreach t in array array['campagnes', 'campagne_exclusions'] loop
    execute format('drop policy if exists lecture_roles on public.%I', t);
    execute format('create policy lecture_roles on public.%I as restrictive for select to anon, authenticated using (public.esi_role() in (''ADMIN'', ''CHANNEL_MANAGER'', ''CDS'', ''EXTERNE''))', t);
    execute format('drop policy if exists ecriture_i on public.%I', t);
    execute format('create policy ecriture_i on public.%I as restrictive for insert to anon, authenticated with check (public.esi_est_gestionnaire())', t);
    execute format('drop policy if exists ecriture_u on public.%I', t);
    execute format('create policy ecriture_u on public.%I as restrictive for update to anon, authenticated using (public.esi_est_gestionnaire()) with check (public.esi_est_gestionnaire())', t);
    execute format('drop policy if exists ecriture_d on public.%I', t);
    execute format('create policy ecriture_d on public.%I as restrictive for delete to anon, authenticated using (public.esi_est_gestionnaire())', t);
  end loop;
end $$;

-- campagne_comptes : un CDS voit et met à jour ses lignes (et les non attribuées en lecture) ; pas d'insertion ni de suppression.
drop policy if exists lecture on public.campagne_comptes;
create policy lecture on public.campagne_comptes as restrictive for select to anon, authenticated
  using (public.esi_role() = 'EXTERNE'
         or (public.esi_role() in ('ADMIN', 'CHANNEL_MANAGER', 'CDS') and public.esi_voit_ligne(pin_cds::text, false)));
drop policy if exists ecriture_i on public.campagne_comptes;
create policy ecriture_i on public.campagne_comptes as restrictive for insert to anon, authenticated
  with check (public.esi_est_gestionnaire());
drop policy if exists ecriture_u on public.campagne_comptes;
create policy ecriture_u on public.campagne_comptes as restrictive for update to anon, authenticated
  using (public.esi_role() in ('ADMIN', 'CHANNEL_MANAGER', 'CDS') and public.esi_voit_ligne(pin_cds::text, false))
  with check (public.esi_role() in ('ADMIN', 'CHANNEL_MANAGER', 'CDS') and public.esi_voit_ligne(pin_cds::text, false));
drop policy if exists ecriture_d on public.campagne_comptes;
create policy ecriture_d on public.campagne_comptes as restrictive for delete to anon, authenticated
  using (public.esi_est_gestionnaire());

-- propositions : lecture et décision pour le commercial du compte et les gestionnaires ; l'insertion passe par service_role.
drop policy if exists lecture on public.enrichissement_propositions;
create policy lecture on public.enrichissement_propositions as restrictive for select to anon, authenticated
  using (public.esi_role() in ('ADMIN', 'CHANNEL_MANAGER', 'CDS') and exists (
    select 1 from public.comptes c where c.id = compte_id and public.esi_voit_ligne(c.pin_cds_assigne::text, false)));
drop policy if exists ecriture_i on public.enrichissement_propositions;
create policy ecriture_i on public.enrichissement_propositions as restrictive for insert to anon, authenticated
  with check (false);
drop policy if exists ecriture_u on public.enrichissement_propositions;
create policy ecriture_u on public.enrichissement_propositions as restrictive for update to anon, authenticated
  using (public.esi_role() in ('ADMIN', 'CHANNEL_MANAGER', 'CDS') and exists (
    select 1 from public.comptes c where c.id = compte_id and public.esi_voit_ligne(c.pin_cds_assigne::text, false)))
  with check (public.esi_role() in ('ADMIN', 'CHANNEL_MANAGER', 'CDS') and exists (
    select 1 from public.comptes c where c.id = compte_id and public.esi_voit_ligne(c.pin_cds_assigne::text, false)));
drop policy if exists ecriture_d on public.enrichissement_propositions;
create policy ecriture_d on public.enrichissement_propositions as restrictive for delete to anon, authenticated
  using (public.esi_est_gestionnaire());

-- ── 5b. Vue des retours (onglet « Campagne ») ──
-- security_invoker : la vue applique les droits de l'utilisateur appelant (un CDS ne voit que ses lignes,
-- l'EXTERNE voit tout en lecture). Une ligne par campagne et par commercial (pin_cds null = non attribué).
create or replace view public.campagne_retours with (security_invoker = true) as
select
  cc.campagne_id,
  cc.pin_cds,
  count(*)                                                        as comptes,
  count(*) filter (where cc.go_no_go = 'go')                      as go,
  count(*) filter (where cc.go_no_go = 'no_go')                   as no_go,
  count(*) filter (where cc.go_no_go is null)                     as a_traiter,
  count(*) filter (where cc.version_email = 'norton_tnb')         as v_norton_tnb,
  count(*) filter (where cc.version_email = 'norton_seul')        as v_norton_seul,
  count(*) filter (where cc.version_email = 'tnb_seul')           as v_tnb_seul,
  count(*) filter (where nullif(trim(coalesce(cc.signalement, '')), '') is not null) as signalements,
  count(*) filter (where cc.statut_envoi = 'envoye')              as envoyes,
  count(*) filter (where cc.statut_envoi in ('rebond', 'desinscrit')) as retours_negatifs,
  max(cc.updated_at)                                              as derniere_maj
from public.campagne_comptes cc
group by cc.campagne_id, cc.pin_cds;
grant select on public.campagne_retours to anon, authenticated;

-- ── 6. Amorçage de la campagne (sans données personnelles ; les comptes et exclusions sont chargés par l'import) ──
insert into public.campagnes (code, nom, description, offres_json, statut, date_limite_retour)
values (
  'NORTON_TNB_2026_11',
  'Norton + T''nB – novembre 2026',
  'Emailing commun Norton + T''nB vers la base ESI et les bases de prospection revendeurs. Trois versions : Norton + T''nB, Norton seul, T''nB seul.',
  '[{"fournisseur":"Norton","offre":"3 licences achetées = 2 offertes"},
    {"fournisseur":"T''nB","offre":"Pack de démarrage 25 articles (5 claviers rechargeables, 5 souris sans fil, 5 sacoches 15,6\", 5 micro-casques pro USB-A/C, 5 hubs USB-C 7-en-1)","prix_ht":490.17,"remise_pct":15}]'::jsonb,
  'collecte',
  date '2026-11-27'
)
on conflict (code) do nothing;

-- ── Retour arrière ──
-- drop view if exists public.campagne_retours;
-- drop table if exists public.enrichissement_propositions;
-- drop table if exists public.campagne_comptes;
-- drop table if exists public.campagne_exclusions;
-- drop table if exists public.campagnes;
-- drop function if exists public.enrichissement_garde();
-- drop function if exists public.campagne_comptes_garde();
-- drop function if exists public.campagnes_touch_updated_at();
-- drop function if exists public.esi_est_gestionnaire();

-- ── Durcissement (appliqué en production après le lot 9) ──
-- Fonctions de trigger : inutile de les exposer en RPC (anon/authenticated).
revoke execute on function public.campagne_comptes_garde() from public, anon, authenticated;
revoke execute on function public.enrichissement_garde() from public, anon, authenticated;

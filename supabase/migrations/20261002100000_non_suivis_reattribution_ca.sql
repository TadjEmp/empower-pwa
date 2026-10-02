-- Lots 3 + 4 — Comptes non suivis, reprise/réattribution immédiate, CA par date d'effet.
-- Décisions métier : reprise immédiate sans garde-fou (ni plafond, ni délai de grâce) ; le SELL IN
-- (COMMERCIAL = NON SUIVI) est un signal ; le CA réalisé AVANT une réattribution reste au commercial
-- précédent (la semaine fiscale en cours reste à l'ancien ; le nouveau démarre la semaine suivante).

-- ── Paramètres (modifiables sans redéploiement) ──
insert into public.params (parametre, valeur, description) values
  ('SEUIL_NON_SUIVI_VISITE_J', '90', 'Compte non suivi : aucune visite réalisée depuis N jours (et ni appel ni action prévue)'),
  ('SEUIL_NON_SUIVI_APPEL_J',  '60', 'Compte non suivi : aucun appel réel depuis N jours (et ni visite ni action prévue)')
on conflict (parametre) do nothing;

alter table public.comptes add column if not exists date_attribution timestamptz;

-- ── Historique des attributions ──
create table if not exists public.attributions_historique (
  id           uuid primary key default gen_random_uuid(),
  compte_id    uuid not null references public.comptes(id) on delete cascade,
  nom_compte   text,
  ancien_pin   integer,
  nouveau_pin  integer,
  ancien_nom   text,
  nouveau_nom  text,
  acteur_pin   integer,
  mode         text not null check (mode in ('REPRISE','MANAGER','IMPORT')),
  motif        text,
  date_effet   date not null default current_date,
  created_at   timestamptz not null default now()
);
create index if not exists idx_attrib_compte on public.attributions_historique (compte_id, date_effet);
alter table public.attributions_historique enable row level security;
create policy service_role_all on public.attributions_historique for all to service_role using (true) with check (true);
create policy anon_select_attributions on public.attributions_historique for select to anon using (true);
-- Pas de policy d'écriture anon : seule la fonction reattribuer_compte() écrit.

-- ── Vue : un compte est « non suivi » si ──
--   * sans propriétaire, OU
--   * le SELL IN le déclare NON SUIVI (et l'attribution n'est pas plus récente que le dernier import), OU
--   * inactivité : aucune visite réalisée > N j ET aucun appel réel > M j ET aucune action prévue
--     (une attribution récente compte comme activité).
create or replace view public.v_comptes_suivi with (security_invoker = true) as
with seuils as (
  select coalesce((select nullif(valeur,'')::int from public.params where parametre='SEUIL_NON_SUIVI_VISITE_J'), 90) sv,
         coalesce((select nullif(valeur,'')::int from public.params where parametre='SEUIL_NON_SUIVI_APPEL_J'), 60) sa,
         (select nullif(valeur,'')::timestamptz from public.params where parametre='SELLIN_SEMAINES_DATE') dernier_import
), vis as (
  select id_cible_gas k,
         max(date_visite) filter (where statut='realisee') derniere,
         bool_or(statut in ('planifiee','en_cours') and date_visite >= current_date) a_venir
  from public.visites where coalesce(deleted,false)=false group by 1
), app as (
  select id_cible_gas k,
         max(date_appel) filter (where lower(coalesce(statut_appel,'')) not in ('planifié','réalisé')) dernier,
         bool_or(lower(coalesce(statut_appel,''))='planifié' and coalesce(date_planifiee::date, date_appel) >= current_date) a_venir
  from public.phoning where coalesce(deleted,false)=false group by 1
), base as (
  select c.id, c.id_compte_gas, c.nom_compte, c.pin_cds_assigne,
         vis.derniere derniere_visite, app.dernier dernier_appel,
         (coalesce(c.date_prochaine_action >= current_date, false) or coalesce(vis.a_venir,false) or coalesce(app.a_venir,false)) a_prochaine_action,
         (c.pin_cds_assigne is null) sans_proprietaire,
         (c.sellin_commercial = 'NON SUIVI'
            and (c.date_attribution is null or s.dernier_import is null or c.date_attribution < s.dernier_import)) sellin_non_suivi,
         ((vis.derniere is null or vis.derniere < current_date - s.sv)
            and (app.dernier is null or app.dernier < current_date - s.sa)
            and not (coalesce(c.date_prochaine_action >= current_date, false) or coalesce(vis.a_venir,false) or coalesce(app.a_venir,false))
            and (c.date_attribution is null or c.date_attribution::date < current_date - s.sa)) inactif
  from public.comptes c cross join seuils s
  left join vis on vis.k = c.id_compte_gas
  left join app on app.k = c.id_compte_gas
  where coalesce(c.deleted,false) = false
)
select id, id_compte_gas, nom_compte, pin_cds_assigne, derniere_visite, dernier_appel, a_prochaine_action,
       array_remove(array[
         case when sans_proprietaire then 'SANS_PROPRIETAIRE' end,
         case when sellin_non_suivi  then 'SELLIN_NON_SUIVI'  end,
         case when inactif           then 'INACTIVITE'        end ], null) as raisons,
       (sans_proprietaire or sellin_non_suivi or inactif) as non_suivi
from base;
grant select on public.v_comptes_suivi to anon, authenticated;

-- ── Lot 4 : CA réalisé par commercial à la date d'effet ──
create or replace function public.debut_quarter(q text) returns date language sql immutable as $$
  select case q when 'Q1FY27' then date '2026-04-10' when 'Q2FY27' then date '2026-07-10'
                when 'Q3FY27' then date '2026-10-09' when 'Q4FY27' then date '2027-01-08' end
$$;

-- Propriétaire d'un compte à une date : dernière attribution <= date, sinon ancien propriétaire de la 1ʳᵉ attribution
-- postérieure, sinon propriétaire actuel.
create or replace function public.pin_proprietaire_a(p_compte uuid, p_date date) returns integer
language plpgsql stable set search_path = public as $$
declare r record;
begin
  select nouveau_pin into r from attributions_historique
   where compte_id = p_compte and date_effet <= p_date order by date_effet desc, created_at desc limit 1;
  if found then return r.nouveau_pin; end if;
  select ancien_pin into r from attributions_historique
   where compte_id = p_compte and date_effet > p_date order by date_effet asc, created_at asc limit 1;
  if found then return r.ancien_pin; end if;
  return (select pin_cds_assigne from comptes where id = p_compte);
end $$;

-- CA réalisé FY27 d'un commercial sur un trimestre : chaque semaine fiscale est attribuée au propriétaire
-- du compte AU DÉBUT de la semaine ; le reliquat non détaillé par semaine (CA du compte − somme des semaines)
-- va au propriétaire de la dernière semaine du trimestre. Un trimestre clos ne bouge donc plus.
create or replace function public.ca_realise_cds(p_pin integer, p_q integer) returns numeric
language plpgsql stable set search_path = public as $$
declare qc text := 'Q' || p_q || 'FY27'; debut date := debut_quarter('Q' || p_q || 'FY27'); res numeric;
begin
  with sem as (
    select s.compte_id, s.ca_eur, pin_proprietaire_a(s.compte_id, debut + (s.semaine - 1) * 7) pin
    from sellin_semaines s where s.quarter = qc and s.compte_id is not null
  ), reste as (
    select c.id,
           greatest(case p_q when 1 then coalesce(c.ca_q1fy27,0) when 2 then coalesce(c.ca_q2fy27,0)
                             when 3 then coalesce(c.ca_q3fy27,0) else coalesce(c.ca_q4fy27,0) end
                    - coalesce((select sum(ca_eur) from sellin_semaines x where x.compte_id = c.id and x.quarter = qc), 0), 0) reste
    from comptes c where coalesce(c.deleted,false) = false
  )
  select coalesce((select sum(ca_eur) from sem where pin = p_pin), 0)
       + coalesce((select sum(reste) from reste where reste > 0 and pin_proprietaire_a(id, debut + 84) = p_pin), 0)
  into res;
  return round(res, 2);
end $$;

create or replace function public.recalculer_ca_realise() returns void
language plpgsql security definer set search_path = public as $$
begin
  update objectifs_primes o set
    q1_ca_realise = ca_realise_cds(o.pin_cds, 1), q2_ca_realise = ca_realise_cds(o.pin_cds, 2),
    q3_ca_realise = ca_realise_cds(o.pin_cds, 3), q4_ca_realise = ca_realise_cds(o.pin_cds, 4),
    updated_at = now();
end $$;
revoke execute on function public.recalculer_ca_realise() from public, anon, authenticated;

-- Les imports SELL IN (sync-sellin, sync-sellin-semaines) écrivent ces params EN DERNIER : on recalcule alors
-- le CA par commercial avec la règle « date d'effet » (remplace le calcul « propriétaire actuel »).
create or replace function public.trg_params_recalc_ca() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.parametre in ('DATE_SYNC_SELLIN', 'SELLIN_SEMAINES_DATE') then perform recalculer_ca_realise(); end if;
  return new;
end $$;
drop trigger if exists params_recalc_ca on public.params;
create trigger params_recalc_ca after insert or update on public.params for each row execute function public.trg_params_recalc_ca();

-- ── Reprise / réattribution : atomique (verrou optimiste sur l'ancien propriétaire) ──
-- L'acteur est DÉDUIT du jeton de session (utilisateurs.token) : non falsifiable depuis le navigateur.
create or replace function public.reattribuer_compte(
  p_compte uuid, p_ancien integer, p_nouveau integer, p_token text, p_mode text, p_motif text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare p_acteur integer; v_role text; v_actif boolean; v_exp bigint; v_c record; v_suivi record; v_nom_ancien text; v_nom_nouveau text; n integer; v_id_cible text;
begin
  select pin, role, actif, token_expiry into p_acteur, v_role, v_actif, v_exp from utilisateurs where token = p_token and p_token is not null limit 1;
  if p_acteur is null or not coalesce(v_actif,false) then return jsonb_build_object('ok',false,'erreur','SESSION_INVALIDE'); end if;
  if v_exp is null or v_exp < (extract(epoch from clock_timestamp()) * 1000)::bigint then return jsonb_build_object('ok',false,'erreur','SESSION_EXPIREE'); end if;
  if p_mode not in ('REPRISE','MANAGER') then return jsonb_build_object('ok',false,'erreur','MODE_INVALIDE'); end if;
  if p_nouveau is not null and not exists (select 1 from utilisateurs where pin = p_nouveau and actif) then
    return jsonb_build_object('ok',false,'erreur','CDS_INCONNU'); end if;
  if p_nouveau is not distinct from p_ancien then return jsonb_build_object('ok',true,'inchange',true); end if;

  if p_mode = 'REPRISE' then
    if v_role not in ('ADMIN','CDS') then return jsonb_build_object('ok',false,'erreur','ROLE_NON_AUTORISE'); end if;
    if p_nouveau is distinct from p_acteur then return jsonb_build_object('ok',false,'erreur','REPRISE_POUR_SOI_UNIQUEMENT'); end if;
    select * into v_suivi from v_comptes_suivi where id = p_compte;
    if not found or not v_suivi.non_suivi then return jsonb_build_object('ok',false,'erreur','COMPTE_SUIVI'); end if;
  else
    if v_role not in ('ADMIN','CHANNEL_MANAGER') then return jsonb_build_object('ok',false,'erreur','ROLE_NON_AUTORISE'); end if;
  end if;

  select nom into v_nom_ancien  from utilisateurs where pin = p_ancien;
  select nom into v_nom_nouveau from utilisateurs where pin = p_nouveau;

  update comptes set pin_cds_assigne = p_nouveau, nom_cds = v_nom_nouveau, date_attribution = now(), updated_at = now()
   where id = p_compte and coalesce(deleted,false) = false and pin_cds_assigne is not distinct from p_ancien
  returning * into v_c;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok',false,'conflit',true,'erreur','CONFLIT'); end if;

  insert into attributions_historique (compte_id, nom_compte, ancien_pin, nouveau_pin, ancien_nom, nouveau_nom, acteur_pin, mode, motif)
  values (p_compte, v_c.nom_compte, p_ancien, p_nouveau, v_nom_ancien, v_nom_nouveau, p_acteur, p_mode,
          coalesce(p_motif, case when p_mode='REPRISE' then array_to_string((select raisons from v_comptes_suivi where id = p_compte), ',') end));

  perform recalculer_ca_realise();

  v_id_cible := coalesce(v_c.id_compte_gas, p_compte::text);
  insert into notifs (id_notif_gas, date_envoi, pin_destinataire, type_notif, message, id_cible, statut_lu)
  select 'NOTIF_' || (extract(epoch from clock_timestamp()) * 1000)::bigint || '_' || d.pin, now(), d.pin,
         case when p_mode='REPRISE' then 'COMPTE_REPRIS' else 'COMPTE_REATTRIBUE' end,
         case when p_mode='REPRISE'
              then coalesce(v_nom_nouveau,'Un commercial') || ' a repris le compte ' || v_c.nom_compte || ' (non suivi)'
              else coalesce((select nom from utilisateurs where pin=p_acteur),'Un manager') || ' a réattribué ' || v_c.nom_compte
                   || ' : ' || coalesce(v_nom_ancien,'sans propriétaire') || ' → ' || coalesce(v_nom_nouveau,'sans propriétaire') end,
         v_id_cible, false
  from (select distinct pin from (
          select p_ancien pin where p_ancien is not null
          union all select p_nouveau where p_nouveau is not null
          union all select u.pin from utilisateurs u where u.actif and u.role in ('ADMIN','CHANNEL_MANAGER')) x
        where pin is not null and pin <> p_acteur) d;

  return jsonb_build_object('ok', true, 'compte', v_c.nom_compte, 'nouveau', v_nom_nouveau);
end $$;
grant execute on function public.reattribuer_compte(uuid, integer, integer, text, text, text) to anon, authenticated;

-- Durcissement (appliqué en production) :
revoke execute on function public.trg_params_recalc_ca() from public, anon, authenticated;
alter function public.debut_quarter(text) set search_path = public;
-- NB : une 1ʳᵉ version de reattribuer_compte (6ᵉ argument entier = PIN acteur envoyé par le navigateur, donc falsifiable)
-- a existé quelques minutes en production ; son droit d'exécution a été retiré. À supprimer (DROP, confirmation requise) :
--   drop function public.reattribuer_compte(uuid, integer, integer, integer, text, text);

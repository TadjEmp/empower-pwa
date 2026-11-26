-- PROPOSITION lot 3 : NON APPLIQUÉE. À valider avant toute exécution sur la base.
-- Source unique de vérité du rattachement code postal / département -> commercial.

create table if not exists public.secteurs_cp (
  id          bigint generated always as identity primary key,
  portee      text not null check (portee in ('DEPARTEMENT','CP')),   -- CP exact prioritaire sur le département
  code        text not null,                                          -- '74', '2A', '95310'
  pin_cds     integer,                                                -- null = non attribué (file ADMIN)
  statut      text not null default 'PROPOSE' check (statut in ('PROPOSE','ACTIF','INACTIF')),
  note        text,
  maj_par     integer,
  updated_at  timestamptz not null default now(),
  unique (portee, code)
);

create table if not exists public.attributions_leads_log (
  id          bigint generated always as identity primary key,
  id_prospect text,
  cp_saisi    text,
  resultat    text not null check (resultat in ('ATTRIBUE','CP_INVALIDE','NON_COUVERT','MULTI_SECTEUR')),
  pin_cds     integer,
  regle       text,
  created_at  timestamptz not null default now()
);

alter table public.secteurs_cp enable row level security;
alter table public.attributions_leads_log enable row level security;
-- Politiques à définir avec la même logique que les autres tables : lecture ADMIN/CDS, écriture ADMIN.

create or replace function public.attribuer_lead_par_cp(p_cp text)
returns table(resultat text, pin_cds integer, regle text)
language plpgsql stable as $$
declare cp text := regexp_replace(coalesce(p_cp,''), '\s', '', 'g'); dept text; r record;
begin
  if cp !~ '^(0[1-9]|[1-8][0-9]|9[0-5]|2[AB]|97[1-6]|98[0-9])[0-9A-Z]{0,3}$' and cp !~ '^[0-9]{5}$' then
    return query select 'CP_INVALIDE', null::integer, 'format'; return; end if;
  select s.pin_cds, s.portee into r from public.secteurs_cp s
   where s.statut='ACTIF' and s.portee='CP' and s.code = cp limit 1;
  if found then return query select 'ATTRIBUE', r.pin_cds, 'CP exact'; return; end if;
  dept := case when left(cp,2) in ('97','98') then left(cp,3) else left(cp,2) end;
  select s.pin_cds into r from public.secteurs_cp s
   where s.statut='ACTIF' and s.portee='DEPARTEMENT' and s.code = dept limit 1;
  if not found then return query select 'NON_COUVERT', null::integer, 'aucun secteur actif'; return; end if;
  if r.pin_cds is null then return query select 'NON_COUVERT', null::integer, 'département non attribué'; return; end if;
  return query select 'ATTRIBUE', r.pin_cds, 'Département ' || dept;
end $$;

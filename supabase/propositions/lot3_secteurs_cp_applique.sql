create table if not exists public.secteurs_cp (
  id bigint generated always as identity primary key,
  portee text not null check (portee in ('DEPARTEMENT','CP')),
  code text not null,
  pin_cds integer,
  statut text not null default 'ACTIF' check (statut in ('PROPOSE','ACTIF','INACTIF')),
  partage boolean not null default false,
  note text,
  maj_par integer,
  updated_at timestamptz not null default now(),
  unique (portee, code)
);
create table if not exists public.attributions_leads_log (
  id bigint generated always as identity primary key,
  id_prospect text,
  cp_saisi text,
  resultat text not null check (resultat in ('ATTRIBUE','CP_INVALIDE','NON_COUVERT','MULTI_SECTEUR')),
  pin_cds integer,
  regle text,
  acteur_pin integer,
  created_at timestamptz not null default now()
);
alter table public.secteurs_cp enable row level security;
alter table public.attributions_leads_log enable row level security;

create policy secteurs_lecture on public.secteurs_cp for select to anon, authenticated
  using ((select esi_session_valide()));
create policy secteurs_ecriture on public.secteurs_cp for all to anon, authenticated
  using ((select esi_session_valide()) and (select esi_role()) in ('ADMIN','CHANNEL_MANAGER'))
  with check ((select esi_session_valide()) and (select esi_role()) in ('ADMIN','CHANNEL_MANAGER'));
create policy secteurs_service on public.secteurs_cp for all to service_role using (true) with check (true);

create policy attrlog_lecture on public.attributions_leads_log for select to anon, authenticated
  using ((select esi_session_valide()) and (select esi_role()) in ('ADMIN','CHANNEL_MANAGER'));
create policy attrlog_ajout on public.attributions_leads_log for insert to anon, authenticated
  with check ((select esi_session_valide()));
create policy attrlog_service on public.attributions_leads_log for all to service_role using (true) with check (true);

create or replace function public.attribuer_lead_par_cp(p_cp text)
returns table(resultat text, pin_cds integer, regle text)
language plpgsql stable set search_path = public as $$
declare cp text := upper(regexp_replace(coalesce(p_cp,''), '\s', '', 'g')); dept text; r record;
begin
  if cp !~ '^([0-9]{5}|2[AB][0-9]{3})$' or left(cp,2) in ('00','96','99') then
    return query select 'CP_INVALIDE'::text, null::integer, 'format du code postal'::text; return; end if;
  select s.pin_cds, s.partage into r from secteurs_cp s where s.statut='ACTIF' and s.portee='CP' and s.code = cp limit 1;
  if found and r.pin_cds is not null then return query select 'ATTRIBUE'::text, r.pin_cds, ('CP ' || cp)::text; return; end if;
  dept := case when left(cp,2) in ('97','98') then left(cp,3) else left(cp,2) end;
  select s.pin_cds, s.partage into r from secteurs_cp s where s.statut='ACTIF' and s.portee='DEPARTEMENT' and s.code = dept limit 1;
  if not found or r.pin_cds is null then return query select 'NON_COUVERT'::text, null::integer, ('département ' || dept || ' sans secteur')::text; return; end if;
  if r.partage then return query select 'MULTI_SECTEUR'::text, r.pin_cds, ('département ' || dept || ' partagé, à confirmer')::text; return; end if;
  return query select 'ATTRIBUE'::text, r.pin_cds, ('département ' || dept)::text;
end $$;

insert into public.secteurs_cp (portee, code, pin_cds, statut, partage, note) values
  ('DEPARTEMENT','01',4001,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','02',4002,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','03',1000,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','06',4001,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','10',1000,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','13',4001,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','14',4002,'ACTIF',true,'Déduit (majorité, partage) · Mapping Boulanger, partagé'),
  ('DEPARTEMENT','16',4003,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','17',4003,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','18',1000,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','21',4002,'ACTIF',false,'Règle donnée · Arbitrage 2 nov. 2026'),
  ('DEPARTEMENT','22',1000,'ACTIF',true,'Déduit (majorité, partage) · Mapping Boulanger, partagé'),
  ('DEPARTEMENT','24',4003,'ACTIF',true,'Déduit (majorité, partage) · Mapping Boulanger, partagé'),
  ('DEPARTEMENT','26',4001,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','27',1000,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','29',1000,'ACTIF',true,'Déduit (majorité, partage) · Mapping Boulanger, partagé'),
  ('DEPARTEMENT','30',4001,'ACTIF',true,'Déduit (majorité, partage) · Mapping Boulanger, partagé'),
  ('DEPARTEMENT','31',4003,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','33',4003,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','34',4001,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','35',1000,'ACTIF',true,'Déduit (majorité, partage) · Mapping Boulanger, partagé'),
  ('DEPARTEMENT','36',4003,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','37',1000,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','38',4001,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','42',4001,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','44',1000,'ACTIF',true,'Déduit (majorité, partage) · Mapping Boulanger, partagé'),
  ('DEPARTEMENT','45',1000,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','46',4003,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','47',4003,'ACTIF',true,'Déduit (majorité, partage) · Mapping Boulanger, partagé'),
  ('DEPARTEMENT','49',1000,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','50',4002,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','51',4002,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','53',1000,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','54',4002,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','56',1000,'ACTIF',true,'Déduit (majorité, partage) · Mapping Boulanger, partagé'),
  ('DEPARTEMENT','57',4002,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','59',4002,'ACTIF',true,'Déduit (majorité, partage) · Mapping Boulanger, partagé'),
  ('DEPARTEMENT','60',4002,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','62',4002,'ACTIF',true,'Déduit (majorité, partage) · Mapping Boulanger, partagé'),
  ('DEPARTEMENT','64',4003,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','65',4003,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','66',4003,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','69',4001,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','71',4001,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','72',1000,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','73',4001,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','74',4001,'ACTIF',false,'Règle donnée · Arbitrage 2 nov. 2026'),
  ('DEPARTEMENT','75',1000,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','76',4002,'ACTIF',true,'Déduit (majorité, partage) · Mapping Boulanger, partagé'),
  ('DEPARTEMENT','77',1000,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','78',1000,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','79',1000,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','80',4002,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','82',4003,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','83',4001,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','84',4001,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','85',1000,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','86',4003,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','87',4003,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','89',1000,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','91',1000,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','92',1000,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','93',1000,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','94',1000,'ACTIF',false,'Déduit (un seul commercial) · Mapping Boulanger'),
  ('DEPARTEMENT','95',4002,'ACTIF',false,'Règle donnée · Exception Île-de-France (arbitrage)')
on conflict (portee, code) do nothing;

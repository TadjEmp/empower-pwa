-- Carte : département déduit du code postal, à chaque saisie, quelle que soit la vue.
-- APPLIQUÉE le 4/11/2026 sur osqwtonwomhalxeidayp (migration carte_departement_depuis_cp), autorisée par l utilisateur.
-- L'interface applique déjà la même règle côté navigateur (js/contacts-geo.js, ESI_GEO.depDeCP) :
-- ce déclencheur couvre en plus les imports et les écritures directes.

create or replace function public.esi_dep_depuis_cp(p_cp text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_cp is null or btrim(p_cp) !~ '^[0-9]{5}$' then null
    when left(btrim(p_cp),2) = '20' then case when btrim(p_cp)::int < 20200 then '2A' else '2B' end
    when left(btrim(p_cp),2) in ('97','98') then left(btrim(p_cp),3)
    else left(btrim(p_cp),2)
  end
$$;

create or replace function public.esi_remplir_departement()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if nullif(btrim(coalesce(new.departement,'')),'') is null then
    new.departement := public.esi_dep_depuis_cp(new.code_postal);
  end if;
  return new;
end $$;

drop trigger if exists esi_remplir_dep on public.comptes;
create trigger esi_remplir_dep before insert or update of code_postal, departement on public.comptes
  for each row execute function public.esi_remplir_departement();
drop trigger if exists esi_remplir_dep on public.leads;
create trigger esi_remplir_dep before insert or update of code_postal, departement on public.leads
  for each row execute function public.esi_remplir_departement();

revoke execute on function public.esi_dep_depuis_cp(text) from public, anon;
revoke execute on function public.esi_remplir_departement() from public, anon;

-- Remplissage des fiches existantes (10 comptes ont un code postal sans département au 4/11/2026)
update public.comptes set departement = public.esi_dep_depuis_cp(code_postal)
  where nullif(btrim(coalesce(departement,'')),'') is null and public.esi_dep_depuis_cp(code_postal) is not null;
update public.leads set departement = public.esi_dep_depuis_cp(code_postal)
  where nullif(btrim(coalesce(departement,'')),'') is null and public.esi_dep_depuis_cp(code_postal) is not null;

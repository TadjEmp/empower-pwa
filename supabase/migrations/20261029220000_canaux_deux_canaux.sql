-- Deux canaux seulement : Grossiste (TD SYNNEX, INGRAM) et Empower.
--
-- Comptes : le canal est déduit du statut Empower, jamais saisi.
--   - un compte avec du CA Empower (FY25, FY26 ou FY27) est marqué Has_Empower = 'Oui' (le Sell-In ne le faisait pas :
--     15 comptes avaient du CA Empower sans être marqués, d'où des filtres Empower / Grossiste faux) ;
--   - canal = 'Empower' si Has_Empower = 'Oui', sinon 'Grossiste'.
-- Leads : REVENDEUR, IT, INGRAM, TD SYNNEX, GROSSISTE -> Grossiste ; EMPOWER -> Empower ; Mail / RDV -> mode_contact ; le reste -> à qualifier.
-- Retour arrière : voir le bas du fichier (canal_avant conserve les anciennes valeurs de securite_canaux_normalisation).

alter table public.comptes add column if not exists has_empower_avant text;
update public.comptes set has_empower_avant = has_empower where has_empower_avant is null;

create or replace function public.esi_canal_compte()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
begin
  if coalesce(new.ca_emp_fy25, 0) + coalesce(new.ca_emp_fy26, 0) + coalesce(new.ca_emp_q1fy27, 0)
     + coalesce(new.ca_emp_q2fy27, 0) + coalesce(new.ca_emp_q3fy27, 0) + coalesce(new.ca_emp_q4fy27, 0) > 0 then
    new.has_empower := 'Oui';
  end if;
  new.canal := case when lower(btrim(coalesce(new.has_empower::text, ''))) = 'oui' then 'Empower' else 'Grossiste' end;
  return new;
end $$;

drop trigger if exists esi_normaliser_canal on public.comptes;
drop trigger if exists esi_canal_compte on public.comptes;
create trigger esi_canal_compte before insert or update on public.comptes
  for each row execute function public.esi_canal_compte();

create or replace function public.esi_normaliser_canal()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
declare v text := upper(btrim(coalesce(new.canal, '')));
begin
  if v = '' then new.canal := null;
  elsif v in ('REVENDEUR', 'IT', 'IT REVENDEUR', 'REVENDEUR IT') or v like 'INGRAM%' or v like '%SYNNEX%' or v like 'TD%'
        or v like 'GROSSISTE%' or v like 'DISTRIBUTEUR%' then new.canal := 'Grossiste';
  elsif v like 'EMPOWER%' then new.canal := 'Empower';
  elsif v like 'MAIL%' then new.mode_contact := coalesce(nullif(new.mode_contact, ''), 'Mail'); new.canal := null;
  elsif v like 'RDV%' then new.mode_contact := coalesce(nullif(new.mode_contact, ''), 'RDV'); new.canal := null;
  else new.canal := null;
  end if;
  return new;
end $$;

-- Reprise de l'existant (les déclencheurs recalculent)
update public.comptes set has_empower = has_empower;
update public.leads set canal = canal where canal is not null;

-- ── Retour arrière ──
-- drop trigger esi_canal_compte on public.comptes;
-- update public.comptes set has_empower = has_empower_avant where has_empower_avant is not null;
-- update public.comptes set canal = canal_avant where canal_avant is not null;
-- alter table public.comptes drop column has_empower_avant;

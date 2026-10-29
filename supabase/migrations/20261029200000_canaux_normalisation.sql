-- Canaux : liste fermée (Revendeur IT, Grande Surface, Retail, Grossiste, Empower, Autre) + champ « mode de contact ».
--
-- Avant : la colonne canal mélangeait deux notions : le canal de vente (REVENDEUR, IT, INGRAM/ TD SYNNEX, EMPOWER...)
-- et le mode de contact du lead (Mail, RDV), avec des variantes et des fautes (« MAILM ET % », vides, INCONNU).
-- Après : canal = canal de vente normalisé (NULL = à qualifier) ; mode_contact = Mail / RDV.
-- Un déclencheur normalise à chaque écriture (formulaires, imports, synchros), donc la liste reste propre.
-- Retour arrière : voir le bas du fichier (les anciennes valeurs ne sont pas conservées : sauvegarde dans canal_avant).

alter table public.comptes add column if not exists mode_contact text;
alter table public.leads   add column if not exists mode_contact text;
alter table public.comptes add column if not exists canal_avant text;
alter table public.leads   add column if not exists canal_avant text;

create or replace function public.esi_normaliser_canal()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
declare v text := upper(btrim(coalesce(new.canal, '')));
begin
  if v = '' or v = 'INCONNU' or v = 'AUTRE' then
    new.canal := case when v = 'AUTRE' then 'Autre' else null end;
  elsif v in ('REVENDEUR', 'IT', 'IT REVENDEUR', 'REVENDEUR IT') then new.canal := 'Revendeur IT';
  elsif v like 'INGRAM%' or v like '%SYNNEX%' or v like 'GROSSISTE%' or v like 'DISTRIBUTEUR%' then new.canal := 'Grossiste';
  elsif v like 'EMPOWER%' then new.canal := 'Empower';
  elsif v like 'GRANDE SURFACE%' or v like 'GSS%' or v like 'GSA%' then new.canal := 'Grande Surface';
  elsif v like 'RETAIL%' then new.canal := 'Retail';
  elsif v like 'MAIL%' then new.mode_contact := coalesce(nullif(new.mode_contact, ''), 'Mail'); new.canal := null;
  elsif v like 'RDV%' then new.mode_contact := coalesce(nullif(new.mode_contact, ''), 'RDV'); new.canal := null;
  end if;
  return new;
end $$;

drop trigger if exists esi_normaliser_canal on public.comptes;
create trigger esi_normaliser_canal before insert or update of canal on public.comptes
  for each row execute function public.esi_normaliser_canal();
drop trigger if exists esi_normaliser_canal on public.leads;
create trigger esi_normaliser_canal before insert or update of canal on public.leads
  for each row execute function public.esi_normaliser_canal();

-- Reprise de l'existant (le déclencheur fait la normalisation ; on garde l'ancienne valeur)
update public.comptes set canal_avant = canal where canal_avant is null and canal is not null;
update public.comptes set canal = canal where canal is not null or canal = '';
update public.leads set canal_avant = canal where canal_avant is null and canal is not null;
update public.leads set canal = canal where canal is not null or canal = '';

-- ── Retour arrière ──
-- drop trigger esi_normaliser_canal on public.comptes; drop trigger esi_normaliser_canal on public.leads;
-- update public.comptes set canal = canal_avant where canal_avant is not null;
-- update public.leads set canal = canal_avant where canal_avant is not null;
-- drop function public.esi_normaliser_canal();
-- alter table public.comptes drop column mode_contact, drop column canal_avant;
-- alter table public.leads drop column mode_contact, drop column canal_avant;

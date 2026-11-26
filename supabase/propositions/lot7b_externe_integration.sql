-- ════════════════════════════════════════════════════════════════════
--  lot7b_externe_integration.sql — PROPOSITION, NON APPLIQUÉE
--  Objet : permettre à un compte EXTERNE (fournisseur de leads) d'« intégrer » un lead,
--  c'est-à-dire de créer le compte correspondant, tout en gardant la garde A1.
--  Cause constatée (5 nov. 2026) : le bouton « Intégrer » (Tracker) crée une ligne dans `comptes`.
--   · la policy RESTRICTIVE `visibilite_ecriture_i` n'accepte pas EXTERNE → erreur RLS (en anglais)
--   · si le compte existe déjà, la mise à jour de has_empower est refusée par la garde A1.
-- ════════════════════════════════════════════════════════════════════

-- 1. INSERT sur comptes : EXTERNE autorisé uniquement pour un compte issu du Tracker (source_import = 'PIPELINE').
drop policy if exists visibilite_ecriture_i on public.comptes;
create policy visibilite_ecriture_i on public.comptes as restrictive for insert
with check (
  ((select public.esi_role()) = any (array['ADMIN','CHANNEL_MANAGER']))
  or (((select public.esi_role()) = 'CDS')
      and (pin_cds_assigne is null or pin_cds_assigne::text = (select public.esi_pin())::text))
  or (((select public.esi_role()) = 'EXTERNE') and source_import = 'PIPELINE')
);

-- 2. Garde A1 : en plus des colonnes de contact, EXTERNE peut faire passer un compte à « Empower »
--    (has_empower non-Oui → Oui). Le déclencheur esi_canal_compte recalcule alors `canal`.
create or replace function public.esi_garde_externe_comptes()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  blanche text[] := array[
    'contact_nom','contact_fonction','tel','email','adresse','ville','code_postal',
    'departement','latitude','longitude','mode_contact','updated_at'
  ];
  passage_empower text[] := array['has_empower','canal','date_onboarding_empower'];
  avant jsonb; apres jsonb;
begin
  if public.esi_role() is distinct from 'EXTERNE' then
    return new;
  end if;
  if lower(btrim(coalesce(old.has_empower::text,''))) <> 'oui'
     and lower(btrim(coalesce(new.has_empower::text,''))) = 'oui' then
    blanche := blanche || passage_empower;
  end if;
  avant := to_jsonb(old) - blanche;
  apres := to_jsonb(new) - blanche;
  if avant is distinct from apres then
    raise exception 'Modification non autorisée pour ce profil (colonnes réservées)' using errcode = '42501';
  end if;
  return new;
end $$;

-- Retour arrière :
--  recréer visibilite_ecriture_i sans la branche EXTERNE (voir état antérieur : ADMIN/CHANNEL_MANAGER + CDS),
--  puis rejouer la fonction esi_garde_externe_comptes de lot7_acces_externe.sql.
-- Recette (jeton Externe) : intégrer un lead → compte créé (source_import='PIPELINE') ; compte existant → has_empower='Oui' ;
--  UPDATE comptes SET pin_cds_assigne=… → toujours refusé.

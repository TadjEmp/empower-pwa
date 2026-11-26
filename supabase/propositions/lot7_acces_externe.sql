-- ════════════════════════════════════════════════════════════════════
--  lot7_acces_externe.sql — PROPOSITION, NON APPLIQUÉE
--  Objet : limiter ce qu'un compte EXTERNE peut écrire sur `comptes` et lire
--  dans les tables Sell-In (audit sécurité, constats A1 et A2).
--  État vérifié le 5 nov. 2026 (lecture seule) :
--   · comptes.visibilite_ecriture_u (RESTRICTIVE) autorise EXTERNE à modifier TOUTES les lignes
--     et TOUTES les colonnes ; aucun déclencheur de garde n'existe.
--   · sellin_agregats / sellin_semaines / sellin_imports / attributions_historique :
--     lisibles par toute session valide (policy session_requise), Externe compris.
--  À appliquer sur un environnement de test d'abord, puis rejouer la recette en bas.
-- ════════════════════════════════════════════════════════════════════

-- ── A1. Garde de colonnes sur comptes pour le rôle EXTERNE ───────────
-- Liste blanche = informations de contact et de localisation (complétude des fiches).
-- Toute autre colonne (pin_cds_assigne, canal, has_empower, ca_*, deleted*, statut_compte…) est refusée.
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
  avant jsonb; apres jsonb;
begin
  if public.esi_role() is distinct from 'EXTERNE' then
    return new;                       -- les autres rôles restent régis par leurs policies
  end if;
  avant := to_jsonb(old) - blanche;
  apres := to_jsonb(new) - blanche;
  if avant is distinct from apres then
    raise exception 'Modification non autorisée pour ce profil (colonnes réservées)' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists esi_garde_externe_comptes on public.comptes;
create trigger esi_garde_externe_comptes
  before update on public.comptes
  for each row execute function public.esi_garde_externe_comptes();

-- ── A2. Sell-In et historique d'attributions : pas de lecture pour EXTERNE ──
-- DÉCISION À PRENDRE AVANT APPLICATION : le profil Externe de Frédéric a les droits « home » (Accueil)
-- et « coach ». Si ces écrans lisent sellin_*, ils afficheront 0 / vide pour lui. Tester d'abord.
do $$
declare t text;
begin
  foreach t in array array['sellin_agregats','sellin_semaines','sellin_imports','attributions_historique'] loop
    execute format('drop policy if exists pas_externe_lecture on public.%I', t);
    execute format(
      'create policy pas_externe_lecture on public.%I as restrictive for select to anon, authenticated '
      'using ((select public.esi_role()) is distinct from ''EXTERNE'')', t);
  end loop;
end $$;

-- ── Hors périmètre de ce fichier (décisions) ────────────────────────
-- · catalogue_produits : prix d'achat (pa_empower, pa_td, pa_ingram) lisibles par Externe. Le calculateur
--   de marge du Coach en a besoin ; les masquer casserait le calcul. Option : vue publique sans colonnes pa_*.
-- · Droits personnalisés (utilisateurs.droits) : le serveur ne connaît que le rôle.

-- ── Retour arrière ──────────────────────────────────────────────────
-- drop trigger if exists esi_garde_externe_comptes on public.comptes;
-- drop function if exists public.esi_garde_externe_comptes();
-- drop policy if exists pas_externe_lecture on public.sellin_agregats;   -- idem les 3 autres tables

-- ── Recette à rejouer (jeton Externe réel) ──────────────────────────
-- 1. UPDATE comptes SET tel='…' WHERE id=… → OK.
-- 2. UPDATE comptes SET pin_cds_assigne=…   → erreur 42501.
-- 3. UPDATE comptes SET deleted='TRUE'      → erreur 42501.
-- 4. SELECT * FROM sellin_agregats          → 0 ligne.
-- 5. ADMIN / CDS / CHANNEL_MANAGER : aucune régression (attribution, import Sell-In, fiche compte).

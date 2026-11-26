-- APPLIQUÉE en production le 6/11/2026 (migrations site_web_et_base_comptes_schema, base_comptes_donnees, enrichir_comptes_depuis_base, grant_esi_dep_depuis_cp_anon).
-- Complète les champs VIDES des comptes à partir de base_comptes (jamais d'écrasement d'une saisie existante).
-- « Direction » dans la base est une fonction, pas un nom : elle va dans contact_fonction, jamais dans contact_nom.
update public.comptes c set
  adresse          = coalesce(nullif(btrim(c.adresse), ''),     nullif(btrim(b.adresse), '')),
  code_postal      = coalesce(nullif(btrim(c.code_postal), ''), nullif(btrim(b.code_postal), '')),
  ville            = coalesce(nullif(btrim(c.ville), ''),       nullif(btrim(b.ville), '')),
  tel              = coalesce(nullif(btrim(c.tel), ''),         nullif(btrim(b.tel), '')),
  email            = coalesce(nullif(btrim(c.email), ''),       nullif(btrim(b.email), '')),
  site_web         = coalesce(nullif(btrim(c.site_web), ''),    nullif(btrim(b.site_web), '')),
  contact_nom      = coalesce(nullif(btrim(c.contact_nom), ''), case when upper(btrim(b.contact_principal)) = 'DIRECTION' then null else nullif(btrim(b.contact_principal), '') end),
  contact_fonction = coalesce(nullif(btrim(c.contact_fonction), ''), case when upper(btrim(b.contact_principal)) = 'DIRECTION' then 'Direction' else null end),
  updated_at       = now()
from public.base_comptes b
where b.compte_id = c.id and b.statut = 'ENRICHI';

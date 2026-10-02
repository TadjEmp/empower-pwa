-- Rattache les leads « INTEGRE » à leur compte (leads.id_compte_gas) quand la correspondance de nom est UNIQUE
-- (nom normalisé, puis nom sans ponctuation/espaces). Appliqué en production : 8 → 66 leads liés sur 67
-- (reste « Cash Converters Chambly/Beauvais », sans compte). Idempotent.
with cible as (
  select l.id lead_id, coalesce(
    (select c.id_compte_gas from comptes c where coalesce(c.deleted,false)=false and c.id_compte_gas is not null and norm_nom(c.nom_compte)=norm_nom(l.nom_compte)
       and (select count(*) from comptes c2 where coalesce(c2.deleted,false)=false and norm_nom(c2.nom_compte)=norm_nom(l.nom_compte))=1),
    (select c.id_compte_gas from comptes c where coalesce(c.deleted,false)=false and c.id_compte_gas is not null
       and regexp_replace(norm_nom(c.nom_compte),'[^A-Z0-9]','','g')=regexp_replace(norm_nom(l.nom_compte),'[^A-Z0-9]','','g')
       and (select count(*) from comptes c2 where coalesce(c2.deleted,false)=false and regexp_replace(norm_nom(c2.nom_compte),'[^A-Z0-9]','','g')=regexp_replace(norm_nom(l.nom_compte),'[^A-Z0-9]','','g'))=1)) id_compte_gas
  from leads l where l.statut='INTEGRE' and l.id_compte_gas is null)
update leads l set id_compte_gas = cible.id_compte_gas from cible where l.id = cible.lead_id and cible.id_compte_gas is not null;

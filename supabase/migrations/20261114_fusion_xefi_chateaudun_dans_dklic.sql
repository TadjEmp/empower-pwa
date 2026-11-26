-- Fusion : XEFI CHATEAUDUN (CPT_0260) absorbé par DKLIC INFORMATIQUE (CPT_0072, fiche conservée).
-- Déjà appliquée sur la base de production le 2026-11-13 (migration « fusion_xefi_chateaudun_dans_dklic »).
-- Restauration : update comptes set deleted=false, deleted_at=null where id_compte_gas='CPT_0260'; (puis relancer la synchro Sell-In, qui recalcule le CA)
do $$
declare k uuid; d uuid;
begin
  select id into k from comptes where id_compte_gas = 'CPT_0260' and coalesce(deleted,false) = false;
  select id into d from comptes where id_compte_gas = 'CPT_0072' and coalesce(deleted,false) = false;
  if k is null or d is null then raise exception 'Fusion impossible : compte introuvable (k=%, d=%)', k, d; end if;

  -- Fiche conservée : coordonnées reprises + CA cumulé (même résultat que le cumul par alias de la synchro Sell-In)
  update comptes t set
    tel = coalesce(nullif(t.tel,''), s.tel),
    email = coalesce(nullif(t.email,''), s.email),
    site_web = coalesce(nullif(t.site_web,''), s.site_web),
    contact_nom = coalesce(nullif(t.contact_nom,''), s.contact_nom),
    contact_fonction = coalesce(nullif(t.contact_fonction,''), s.contact_fonction),
    ca_fy25 = coalesce(t.ca_fy25,0) + coalesce(s.ca_fy25,0),
    ca_fy26 = coalesce(t.ca_fy26,0) + coalesce(s.ca_fy26,0),
    ca_q1fy27 = coalesce(t.ca_q1fy27,0) + coalesce(s.ca_q1fy27,0),
    ca_q2fy27 = coalesce(t.ca_q2fy27,0) + coalesce(s.ca_q2fy27,0),
    ca_q3fy27 = coalesce(t.ca_q3fy27,0) + coalesce(s.ca_q3fy27,0),
    ca_q4fy27 = coalesce(t.ca_q4fy27,0) + coalesce(s.ca_q4fy27,0),
    ca_emp_fy25 = coalesce(t.ca_emp_fy25,0) + coalesce(s.ca_emp_fy25,0),
    ca_emp_fy26 = coalesce(t.ca_emp_fy26,0) + coalesce(s.ca_emp_fy26,0),
    ca_emp_q1fy27 = coalesce(t.ca_emp_q1fy27,0) + coalesce(s.ca_emp_q1fy27,0),
    ca_emp_q2fy27 = coalesce(t.ca_emp_q2fy27,0) + coalesce(s.ca_emp_q2fy27,0),
    ca_emp_q3fy27 = coalesce(t.ca_emp_q3fy27,0) + coalesce(s.ca_emp_q3fy27,0),
    ca_emp_q4fy27 = coalesce(t.ca_emp_q4fy27,0) + coalesce(s.ca_emp_q4fy27,0),
    statut_compte = 'ACTIF'
  from comptes s where t.id = d and s.id = k;

  -- Sell-In : les ventes XEFI CHATEAUDUN suivent désormais DKLIC (données + alias pour les prochaines synchros)
  update sellin_semaines set compte_id = d where compte_id = k;
  update sellin_agregats set compte_id = d where compte_id = k;
  insert into sellin_alias (nom_norm, compte_id) values ('XEFI CHATEAUDUN', d)
    on conflict (nom_norm) do update set compte_id = excluded.compte_id;

  -- Base comptes : la ligne conservée reprend les coordonnées, la ligne absorbée est retirée
  update base_comptes t set
    tel = coalesce(nullif(t.tel,''), s.tel), email = coalesce(nullif(t.email,''), s.email),
    site_web = coalesce(nullif(t.site_web,''), s.site_web),
    contact_principal = coalesce(nullif(t.contact_principal,''), s.contact_principal)
  from base_comptes s where t.compte_id = d and s.compte_id = k;
  delete from base_comptes where compte_id = k;

  -- Compte absorbé : archivé (suppression logique, réversible)
  update comptes set deleted = true, deleted_at = now() where id = k;

  -- Trace dans le journal du compte conservé
  insert into comptes_notes (compte_id, type, texte, auteur_nom, auteur_role)
  values (d, 'MAJ_INFOS', 'Fusion : le compte XEFI CHATEAUDUN (CPT_0260) a été fusionné dans cette fiche (même établissement, 104 Route Nationale 28200). Coordonnées et CA repris ; les ventes « XEFI CHATEAUDUN » du Sell-In sont rattachées à ce compte.', 'Système', 'ADMIN');
end $$;

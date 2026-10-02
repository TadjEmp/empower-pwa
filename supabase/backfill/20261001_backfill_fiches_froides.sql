-- Backfill Lot 1 — regroupe les visites HORS_BASE existantes en fiches_froides.
-- Clé de regroupement : nom normalisé + ville normalisée (toutes CDS confondus).
-- Les groupes partageant un même nom normalisé sont marqués doublon_a_revoir = true
-- (JAMAIS fusionnés automatiquement) pour revue manuelle.
-- Idempotent : ne traite que les visites sans id_fiche_froide.

create temporary table _bf as
select
  v.id as visite_uuid, v.id_visite_gas, v.pin_cds, v.nom_cds, v.nom_compte, v.date_visite, v.statut,
  v.type_visite, v.resultat_visite, v.ville, v.departement, v.adresse, v.tel, v.email,
  v.interlocuteur_nom, v.interlocuteur_fonction, v.prochaine_action_texte, v.prochaine_action_date,
  v.note, v.created_at,
  upper(btrim(regexp_replace(translate(lower(v.nom_compte),'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ','aaaaaaceeeeiiiinooooouuuuyy'),'\s+',' ','g'))) as nom_norm,
  upper(btrim(regexp_replace(translate(lower(coalesce(v.ville,'')),'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ','aaaaaaceeeeiiiinooooouuuuyy'),'\s+',' ','g'))) as ville_norm
from public.visites v
where coalesce(v.deleted,false)=false
  and v.id_cible_gas = 'HORS_BASE'
  and v.id_fiche_froide is null
  and coalesce(btrim(v.nom_compte),'') <> '';

create temporary table _grp as
select
  nom_norm, ville_norm,
  'FRD-BF' || lpad((row_number() over (order by min(date_visite), nom_norm, ville_norm))::text, 4, '0') as id_fiche_gas,
  count(*) as nb_visites,
  min(date_visite) as d1, max(date_visite) as d2
from _bf group by nom_norm, ville_norm;

-- Dernière visite de chaque groupe = source des champs de contact / résultat
create temporary table _last as
select distinct on (nom_norm, ville_norm) *
from _bf order by nom_norm, ville_norm, date_visite desc, created_at desc;

insert into public.fiches_froides
 (id_fiche_gas, nom_magasin, nom_norm, ville, departement, adresse, tel, email, contact_nom, contact_fonction,
  pin_cds, nom_cds, date_premiere_visite, date_derniere_visite, resultat_derniere, prochaine_action, date_relance,
  commentaire, statut, id_compte_lie, nb_visites, doublon_a_revoir)
select
  g.id_fiche_gas, l.nom_compte, g.nom_norm, nullif(l.ville,''), nullif(l.departement,''), nullif(l.adresse,''),
  nullif(l.tel,''), nullif(l.email,''), nullif(l.interlocuteur_nom,''), nullif(l.interlocuteur_fonction,''),
  l.pin_cds, l.nom_cds, g.d1, g.d2, nullif(l.resultat_visite,''), nullif(l.prochaine_action_texte,''),
  l.prochaine_action_date, nullif(l.note,''),
  case
    when c.id_compte_gas is not null then 'CONVERTI_COMPTE'
    when exists (select 1 from _bf b where b.nom_norm=g.nom_norm and b.ville_norm=g.ville_norm
                 and (b.statut in ('planifiee','en_cours') or b.prochaine_action_date >= current_date)) then 'A_REVOIR'
    else 'HISTORIQUE'
  end,
  c.id_compte_gas,
  g.nb_visites,
  (select count(*) from _grp g2 where g2.nom_norm = g.nom_norm) > 1
from _grp g
join _last l on l.nom_norm=g.nom_norm and l.ville_norm=g.ville_norm
left join lateral (
  select id_compte_gas from public.comptes c
  where coalesce(c.deleted,false)=false
    and upper(btrim(regexp_replace(translate(lower(c.nom_compte),'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ','aaaaaaceeeeiiiinooooouuuuyy'),'\s+',' ','g'))) = g.nom_norm
  limit 1
) c on true
on conflict (id_fiche_gas) do nothing;

update public.visites v set id_fiche_froide = g.id_fiche_gas
from _bf b join _grp g on g.nom_norm=b.nom_norm and g.ville_norm=b.ville_norm
where v.id = b.visite_uuid;

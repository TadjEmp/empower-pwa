-- APPLIQUÉE en production le 6/11/2026 (migration sync_base_comptes_rpc).
-- Synchronisation de la base des comptes actifs depuis le Google Sheet « BASE COMPTES ACTIFS - MATCHES ET ENRICHIS » :
-- met à jour base_comptes (clé : nom normalisé), rattache les comptes de l'app, complète UNIQUEMENT les champs vides des comptes.
-- Appelée par l'edge function base-comptes-sync (service_role) ; jamais par le navigateur.
create or replace function public.esi_norm_nom(t text) returns text language sql immutable as $$
  select regexp_replace(upper(translate(coalesce(t,''),'àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ','AAAEEEEIIOOUUUCAAAEEEEIIOOUUUC')),'[^A-Z0-9]','','g') $$;

create or replace function public.esi_sync_base_comptes(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; v_id uuid; n_ins int := 0; n_maj int := 0; n_att int := 0; n_enr int := 0; v_statut text;
begin
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    continue when nullif(btrim(r->>'nom'), '') is null;
    v_statut := case when upper(translate(coalesce(r->>'statut',''),'ÉÈ','EE')) like 'ENRICHI%' then 'ENRICHI' else 'A COMPLETER' end;
    select id into v_id from base_comptes where esi_norm_nom(nom) = esi_norm_nom(r->>'nom') limit 1;
    if v_id is null then
      insert into base_comptes (commercial, nom, type_compte, adresse, code_postal, ville, tel, email, site_web, contact_principal, statut)
      values (nullif(btrim(r->>'commercial'),''), btrim(r->>'nom'), nullif(btrim(r->>'type_compte'),''), nullif(btrim(r->>'adresse'),''),
              nullif(btrim(r->>'code_postal'),''), nullif(btrim(r->>'ville'),''), nullif(btrim(r->>'tel'),''), nullif(btrim(r->>'email'),''),
              nullif(btrim(r->>'site_web'),''), nullif(btrim(r->>'contact_principal'),''), v_statut);
      n_ins := n_ins + 1;
    else
      update base_comptes set commercial = nullif(btrim(r->>'commercial'),''), type_compte = nullif(btrim(r->>'type_compte'),''),
        adresse = nullif(btrim(r->>'adresse'),''), code_postal = nullif(btrim(r->>'code_postal'),''), ville = nullif(btrim(r->>'ville'),''),
        tel = nullif(btrim(r->>'tel'),''), email = nullif(btrim(r->>'email'),''), site_web = nullif(btrim(r->>'site_web'),''),
        contact_principal = nullif(btrim(r->>'contact_principal'),''), statut = v_statut, updated_at = now()
      where id = v_id and (commercial, type_compte, adresse, code_postal, ville, tel, email, site_web, contact_principal, statut)
        is distinct from (nullif(btrim(r->>'commercial'),''), nullif(btrim(r->>'type_compte'),''), nullif(btrim(r->>'adresse'),''),
          nullif(btrim(r->>'code_postal'),''), nullif(btrim(r->>'ville'),''), nullif(btrim(r->>'tel'),''), nullif(btrim(r->>'email'),''),
          nullif(btrim(r->>'site_web'),''), nullif(btrim(r->>'contact_principal'),''), v_statut);
      if found then n_maj := n_maj + 1; end if;
    end if;
  end loop;

  -- Rattachement au compte de l'app (nom normalisé, premier ou second nom autour de « / »)
  update base_comptes b set compte_id = c.id
  from (select distinct on (esi_norm_nom(nom_compte)) id, esi_norm_nom(nom_compte) n from comptes where coalesce(deleted,false) = false order by esi_norm_nom(nom_compte), created_at) c
  where b.compte_id is null and (c.n = esi_norm_nom(b.nom) or c.n = esi_norm_nom(split_part(b.nom,' / ',1)) or c.n = esi_norm_nom(split_part(b.nom,' / ',2)));
  get diagnostics n_att = row_count;

  -- Enrichissement : champs VIDES seulement, jamais d'écrasement d'une saisie. « Direction » = fonction, pas un nom.
  update comptes c set
    adresse          = coalesce(nullif(btrim(c.adresse), ''),     nullif(btrim(b.adresse), '')),
    code_postal      = coalesce(nullif(btrim(c.code_postal), ''), nullif(btrim(b.code_postal), '')),
    ville            = coalesce(nullif(btrim(c.ville), ''),       nullif(btrim(b.ville), '')),
    tel              = coalesce(nullif(btrim(c.tel), ''),         nullif(btrim(b.tel), '')),
    email            = coalesce(nullif(btrim(c.email), ''),       nullif(btrim(b.email), '')),
    site_web         = coalesce(nullif(btrim(c.site_web), ''),    nullif(btrim(b.site_web), '')),
    contact_nom      = coalesce(nullif(btrim(c.contact_nom), ''), case when upper(btrim(b.contact_principal)) = 'DIRECTION' then null else nullif(btrim(b.contact_principal), '') end),
    contact_fonction = coalesce(nullif(btrim(c.contact_fonction), ''), case when upper(btrim(b.contact_principal)) = 'DIRECTION' then 'Direction' else null end),
    updated_at       = now()
  from base_comptes b
  where b.compte_id = c.id and b.statut = 'ENRICHI'
    and (coalesce(btrim(c.adresse),'') = '' or coalesce(btrim(c.code_postal),'') = '' or coalesce(btrim(c.ville),'') = '' or coalesce(btrim(c.tel),'') = ''
      or coalesce(btrim(c.email),'') = '' or coalesce(btrim(c.site_web),'') = '' or coalesce(btrim(c.contact_nom),'') = '' or coalesce(btrim(c.contact_fonction),'') = '');
  get diagnostics n_enr = row_count;

  return jsonb_build_object('ajoutees', n_ins, 'modifiees', n_maj, 'rattachees', n_att, 'comptes_enrichis', n_enr,
                            'total_base', (select count(*) from base_comptes));
end $$;
revoke all on function public.esi_sync_base_comptes(jsonb) from public, anon, authenticated;
grant execute on function public.esi_sync_base_comptes(jsonb) to service_role;

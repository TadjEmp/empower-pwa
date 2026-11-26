-- Ajout d'un compte Grossiste au Tracker par un EXTERNE (ou Channel Manager / Admin).
-- Le lead est créé par cette fonction (la RLS de leads n'autorise l'Externe qu'aux leads sans commercial attribué) :
--  · lié au compte (id_compte_gas), commercial du compte conservé, pin_channel = l'appelant (le lead apparaît dans son Tracker) ;
--  · refus si le compte est déjà Empower ou déjà dans le Tracker (hors archivés) ;
--  · le déclencheur leads_alerte_externe notifie channel, admins et commercial attribué ;
--  · la note saisie est aussi enregistrée dans le journal de notes du compte.
-- Retour arrière : drop function public.compte_vers_tracker(uuid, text);
create or replace function public.compte_vers_tracker(p_compte uuid, p_note text default null)
returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  v_pin int := (select public.esi_pin())::int;
  v_role text := (select public.esi_role());
  v_nom text; v_nom_cds text; v_c record; v_id text; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not coalesce((select public.esi_session_valide()), false) or v_role is null then
    return jsonb_build_object('ok', false, 'erreur', 'Session expirée.');
  end if;
  if v_role not in ('EXTERNE', 'CHANNEL_MANAGER', 'ADMIN') then
    return jsonb_build_object('ok', false, 'erreur', 'Action réservée à l''Externe, au Channel Manager et à l''Admin.');
  end if;
  if v_note is not null and char_length(v_note) > 2000 then
    return jsonb_build_object('ok', false, 'erreur', 'Note trop longue (2000 caractères maximum).');
  end if;

  select * into v_c from comptes where id = p_compte and coalesce(deleted, false) = false;
  if not found then return jsonb_build_object('ok', false, 'erreur', 'Compte introuvable.'); end if;
  if lower(btrim(coalesce(v_c.has_empower::text, ''))) = 'oui' then
    return jsonb_build_object('ok', false, 'erreur', 'Ce compte est déjà Empower.');
  end if;
  if exists (
    select 1 from leads l
    where coalesce(l.statut, '') <> 'ARCHIVE'
      and ((v_c.id_compte_gas is not null and l.id_compte_gas = v_c.id_compte_gas)
           or lower(btrim(coalesce(l.nom_compte, ''))) = lower(btrim(coalesce(v_c.nom_compte, ''))))
  ) then
    return jsonb_build_object('ok', false, 'erreur', 'Ce compte est déjà dans le Tracker.', 'deja', true);
  end if;

  select nom into v_nom from utilisateurs where pin::text = v_pin::text;
  select nom into v_nom_cds from utilisateurs where pin::text = v_c.pin_cds_assigne::text;
  v_id := 'PROS_' || (extract(epoch from clock_timestamp()) * 1000)::bigint || '_' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into leads (id_prospect_gas, nom_compte, adresse, ville, code_postal, departement, tel, email, contact_nom, contact_fonction,
                     canal, secteur, statut, pin_cds_assigne, nom_cds, pin_channel, nom_channel, origine, source_import,
                     date_saisie, date_attribution, note, id_compte_gas, flag_action, flag_traite, flag_converti)
  values (v_id, v_c.nom_compte, v_c.adresse, v_c.ville, v_c.code_postal, v_c.departement, v_c.tel, v_c.email, v_c.contact_nom, v_c.contact_fonction,
          v_c.canal, v_c.secteur,
          case when v_c.pin_cds_assigne is not null then 'ASSIGNE' else 'SAISIE' end,
          v_c.pin_cds_assigne, v_nom_cds, v_pin, v_nom, 'GROSSISTE_A_ONBOARDER', 'BASE_COMPTES',
          now(), case when v_c.pin_cds_assigne is not null then now() end,
          'Ajouté au Tracker depuis la base comptes par ' || coalesce(v_nom, 'un utilisateur') || ' le ' || to_char(now() at time zone 'Europe/Paris', 'DD/MM/YYYY')
            || ' (Grossiste à onboarder EMPOWER).' || coalesce(E'\n' || v_note, ''),
          v_c.id_compte_gas, 'SAISIE', 'FALSE', 'FALSE');

  if v_note is not null then
    insert into comptes_notes (compte_id, type, texte, auteur_pin, auteur_nom, auteur_role)
    values (p_compte, 'NOTE', 'Ajouté au Tracker : ' || v_note, v_pin, v_nom, v_role);
  end if;
  return jsonb_build_object('ok', true, 'id_prospect', v_id);
end $function$;
revoke all on function public.compte_vers_tracker(uuid, text) from public;
grant execute on function public.compte_vers_tracker(uuid, text) to anon, authenticated;

-- Garde Externe sur comptes : le site web du compte rejoint les colonnes que l'Externe peut renseigner.
create or replace function public.esi_garde_externe_comptes()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  blanche text[] := array[
    'contact_nom','contact_fonction','tel','email','adresse','ville','code_postal',
    'departement','latitude','longitude','mode_contact','site_web','updated_at'
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

-- Alertes d'un lead saisi par un externe : channel managers ET admins (nouveau lead), plus le commercial assigné (lead assigné).
-- Émises par la base : ne dépendent plus du poste de l'externe. Le push part ensuite via notify_push() (appareils abonnés).
create or replace function public.leads_alerte_externe() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
declare v_role text; v_nom text; v_lieu text; v_pin text := new.pin_cds_assigne::text;
begin
  if new.pin_channel is null then return new; end if;
  select role, nom into v_role, v_nom from utilisateurs where pin = new.pin_channel;
  if v_role is distinct from 'EXTERNE' then return new; end if;
  v_lieu := coalesce(new.nom_compte, '?') || case when coalesce(new.ville, '') <> '' then ', ' || new.ville else '' end;

  insert into notifs (id_notif_gas, pin_destinataire, type_notif, message, id_cible, statut_lu, date_envoi)
  select 'NOTIF_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), u.pin, 'NOUVEAU_LEAD',
         'Nouveau lead saisi par ' || coalesce(v_nom, 'un externe') || ' : ' || v_lieu || case when v_pin is null then ' (à attribuer).' else '.' end,
         new.id_prospect_gas, false, now()
  from utilisateurs u
  where u.actif and u.role in ('CHANNEL_MANAGER', 'ADMIN') and u.pin::text is distinct from v_pin;

  if v_pin is not null then
    insert into notifs (id_notif_gas, pin_destinataire, type_notif, message, id_cible, statut_lu, date_envoi)
    select 'NOTIF_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), u.pin, 'LEAD_ASSIGNE',
           'Lead assigné : ' || v_lieu || ', saisi par ' || coalesce(v_nom, 'un externe') || '. Premier contact sous 48 h.',
           new.id_prospect_gas, false, now()
    from utilisateurs u where u.actif and u.pin::text = v_pin;
  end if;
  return new;
exception when others then
  return new;
end $function$;

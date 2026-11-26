-- Push : les alertes LEAD_ATTRIBUE_AUTO et LEAD_A_ATTRIBUER (envoyées à l'ADMIN quand Alexandra, un CDS ou un externe saisit un lead)
-- ouvrent le Tracker au clic, comme dans la cloche (NotifCenter._route). Avant : elles ouvraient le tableau de bord.
-- APPLIQUÉE en production le 06/11/2026.
CREATE OR REPLACE FUNCTION public.notify_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_secret text; v_cible text; v_route text; t text := upper(coalesce(new.type_notif, ''));
begin
  if new.statut_lu is true then return new; end if;
  if not exists (select 1 from push_subscriptions s where s.pin_cds = new.pin_destinataire and s.actif) then return new; end if;
  select valeur into v_secret from push_config where cle = 'secret';
  select valeur into v_cible  from push_config where cle = 'endpoint';
  if v_secret is null or v_cible is null then return new; end if;
  -- Même table de routage que NotifCenter._route (front)
  v_route := case
    when t = 'A_CONTACTER' then '#/a-contacter'
    when new.id_cible is null or new.id_cible = '' then '#/dashboard'
    when t in ('COMPTE_CREE','VISITE_REALISEE','CONVERSION_FROID','COMPTE_REPRIS','COMPTE_REATTRIBUE') then '#/compte/' || new.id_cible
    when t in ('LEAD_ASSIGNE','NOUVEAU_LEAD','LEAD_ATTRIBUE_AUTO','LEAD_A_ATTRIBUER','STATUT_CHANGE','STATUT_ARCHIVE','STATUT_EN_COURS','STATUT_INTEGRE','IMPORT_TRACKER') then '#/empower-tracker'
    else '#/dashboard' end;
  perform net.http_post(
    url := v_cible,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body := jsonb_build_object('pin', new.pin_destinataire, 'title', 'EMPOWER', 'body', left(coalesce(new.message, 'Nouvelle notification'), 160), 'url', v_route, 'tag', coalesce(nullif(t, ''), 'NOTIF'))
  );
  return new;
exception when others then
  return new;
end $function$;

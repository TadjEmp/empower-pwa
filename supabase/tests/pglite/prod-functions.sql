-- Définitions réelles relevées en production (pg_get_functiondef), le 29/10/2026.
CREATE OR REPLACE FUNCTION public.enregistrer_push(p_token text, p_endpoint text, p_p256dh text, p_auth text, p_ua text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_pin integer; v_actif boolean; v_exp bigint;
begin
  select pin, actif, token_expiry into v_pin, v_actif, v_exp from utilisateurs where token = p_token and p_token is not null limit 1;
  if v_pin is null or not coalesce(v_actif,false) then return jsonb_build_object('ok',false,'erreur','SESSION_INVALIDE'); end if;
  if v_exp is null or v_exp < (extract(epoch from clock_timestamp()) * 1000)::bigint then return jsonb_build_object('ok',false,'erreur','SESSION_EXPIREE'); end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or p_p256dh is null or p_auth is null then return jsonb_build_object('ok',false,'erreur','ABONNEMENT_INVALIDE'); end if;
  insert into push_subscriptions (pin_cds, endpoint, p256dh, auth, user_agent, actif) values (v_pin, p_endpoint, p_p256dh, p_auth, left(p_ua, 200), true)
  on conflict (endpoint) do update set pin_cds = excluded.pin_cds, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent, actif = true;
  return jsonb_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.reporter_a_contacter(p_compte uuid, p_jours integer, p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_pin integer; v_role text; v_actif boolean; v_exp bigint; v_owner integer;
begin
  select pin, role, actif, token_expiry into v_pin, v_role, v_actif, v_exp from utilisateurs where token = p_token and p_token is not null limit 1;
  if v_pin is null or not coalesce(v_actif,false) then return jsonb_build_object('ok',false,'erreur','SESSION_INVALIDE'); end if;
  if v_exp is null or v_exp < (extract(epoch from clock_timestamp()) * 1000)::bigint then return jsonb_build_object('ok',false,'erreur','SESSION_EXPIREE'); end if;
  if p_jours is null or p_jours < 1 or p_jours > 60 then return jsonb_build_object('ok',false,'erreur','DUREE_INVALIDE'); end if;
  select pin_cds_assigne into v_owner from comptes where id = p_compte and coalesce(deleted,false) = false;
  if not found then return jsonb_build_object('ok',false,'erreur','COMPTE_INTROUVABLE'); end if;
  if v_role not in ('ADMIN','CHANNEL_MANAGER') and v_owner is distinct from v_pin then return jsonb_build_object('ok',false,'erreur','NON_AUTORISE'); end if;
  insert into a_contacter_report (compte_id, jusqu_au, par_pin, updated_at) values (p_compte, current_date + p_jours, v_pin, now())
  on conflict (compte_id) do update set jusqu_au = excluded.jusqu_au, par_pin = excluded.par_pin, updated_at = now();
  return jsonb_build_object('ok', true, 'jusqu_au', current_date + p_jours);
end $function$;

CREATE OR REPLACE FUNCTION public.supprimer_push(p_token text, p_endpoint text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_pin integer;
begin
  select pin into v_pin from utilisateurs where token = p_token and p_token is not null limit 1;
  if v_pin is null then return jsonb_build_object('ok',false,'erreur','SESSION_INVALIDE'); end if;
  update push_subscriptions set actif = false where endpoint = p_endpoint and pin_cds = v_pin;
  return jsonb_build_object('ok', true);
end $function$;

-- reattribuer_compte (variante à jeton) : corps réel plus long ; seules l'en-tête et la clause de recherche du jeton
-- (relevées en production) sont reproduites. Le reste n'est pas concerné par la migration.
CREATE OR REPLACE FUNCTION public.reattribuer_compte(p_compte uuid, p_ancien integer, p_nouveau integer, p_token text, p_mode text, p_motif text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p_acteur integer; v_role text; v_actif boolean; v_exp bigint;
begin
  -- L'acteur est DÉDUIT du jeton de session (jamais d'un PIN envoyé par le navigateur) : non falsifiable.
  select pin, role, actif, token_expiry into p_acteur, v_role, v_actif, v_exp from utilisateurs where token = p_token and p_token is not null limit 1;
  if p_acteur is null or not coalesce(v_actif,false) then return jsonb_build_object('ok',false,'erreur','SESSION_INVALIDE'); end if;
  if v_exp is null or v_exp < (extract(epoch from clock_timestamp()) * 1000)::bigint then return jsonb_build_object('ok',false,'erreur','SESSION_EXPIREE'); end if;
  return jsonb_build_object('ok', true, 'acteur', p_acteur, 'role', v_role);
end $function$;

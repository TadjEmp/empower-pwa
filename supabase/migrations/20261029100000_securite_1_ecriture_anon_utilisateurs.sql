-- Sécurité 1/2 : fermer l'écriture anonyme sur la table des utilisateurs.
--
-- Constat : la politique anon_update_token_utilisateurs (USING true) et le droit UPDATE sur
-- utilisateurs.token / token_expiry permettaient à quiconque possède la clé publique (présente dans le
-- code du navigateur) de poser un jeton de son choix sur le compte d'un administrateur, puis d'appeler
-- la fonction admin-users avec ce jeton (création d'accès, réinitialisation de mot de passe).
-- Aucun code du navigateur n'écrit dans utilisateurs : la connexion passe par la fonction auth-login
-- (service_role). Retour arrière : voir le bas du fichier.
drop policy if exists anon_update_token_utilisateurs on public.utilisateurs;
revoke update on public.utilisateurs from anon;

-- Droits inutiles (non exposés par l'API REST, mais jamais nécessaires à l'application)
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- Retour arrière (à ne lancer qu'en connaissance de cause, cela rouvre la faille) :
--   create policy anon_update_token_utilisateurs on public.utilisateurs for update to anon using (true);
--   grant update (token, token_expiry) on public.utilisateurs to anon;

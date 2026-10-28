-- Droits par utilisateur : liste des sections (tabIds) cochées à la création d'un accès.
-- NULL = droits par défaut du rôle (matrice js/permissions.js). Le rôle ADMIN ignore cette colonne.
alter table public.utilisateurs add column if not exists droits jsonb;
comment on column public.utilisateurs.droits is 'Tableau JSON de tabIds autorisés ; NULL = matrice par défaut du rôle. Lu uniquement via les Edge Functions (service_role).';

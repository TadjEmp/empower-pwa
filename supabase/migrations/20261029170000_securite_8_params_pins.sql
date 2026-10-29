-- Sécurité 8 : params. Les anciens PIN d'accès (PIN_ADMIN, PIN_CHANNEL, PIN_MANAGER, PINS_CDS) datent de l'époque
-- Google Apps Script, ne sont plus lus par l'appli et restaient lisibles par toute session. On les masque, comme
-- les clés d'API (GROQ_API_KEY, GEMINI_API_KEY). Les Edge Functions (service_role) ne sont pas concernées.
-- Retour arrière : voir le bas du fichier.

drop policy if exists anon_select_params_safe on public.params;
create policy anon_select_params_safe on public.params for select to anon
  using (parametre <> all (array['GROQ_API_KEY', 'GEMINI_API_KEY', 'PIN_ADMIN', 'PIN_CHANNEL', 'PIN_MANAGER', 'PINS_CDS']));

-- ── Retour arrière ──
-- drop policy anon_select_params_safe on public.params;
-- create policy anon_select_params_safe on public.params for select to anon
--   using (parametre <> all (array['GROQ_API_KEY', 'GEMINI_API_KEY']));

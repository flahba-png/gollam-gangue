-- =====================================================================
-- MIGRATION 29 : médias du chat (photos + notes vocales)
-- (déjà inclus dans SUPABASE_TOUT_EN_UN.sql — fichier séparé pour archive)
-- =====================================================================
alter table messages add column if not exists media_url text;
alter table messages add column if not exists media_type text;  -- 'image' | 'audio'

insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', true)
on conflict (id) do nothing;

drop policy if exists "chatmedia_read" on storage.objects;
create policy "chatmedia_read" on storage.objects for select using (bucket_id = 'chat-media');
drop policy if exists "chatmedia_insert" on storage.objects;
create policy "chatmedia_insert" on storage.objects for insert to authenticated with check (bucket_id = 'chat-media');

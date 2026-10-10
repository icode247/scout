-- A job profile's photo and showcase video, as FastApply profiles have them.
--
-- One record each on the profile (shape in src/lib/profile-media-rules.ts), written only by
-- /api/app/profile-media after it has read the stored file back. The files live in the private
-- `profile-media` bucket under <user id>/<profile id>/, uploaded by the browser through a signed
-- upload URL. A photo is never sent with applications unless the member turns that on; a video's
-- watch link (/v/<shareToken>) works only while "use in my applications" is on.
alter table public.job_profiles
  add column if not exists photo jsonb,
  add column if not exists video jsonb;

comment on column public.job_profiles.photo is
  'Profile photo: {path, mimeType, size, useInApplications, updatedAt}. Written by /api/app/profile-media only.';
comment on column public.job_profiles.video is
  'Showcase video: {path, fileName, mimeType, size, durationSeconds, width, height, useInApplications, shareToken, updatedAt}.';

-- The public watch page looks a video up by its token.
create unique index if not exists job_profiles_video_share_token_idx
  on public.job_profiles ((video->>'shareToken'))
  where video is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-media', 'profile-media', false, 52428800,
  array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users upload own profile media" on storage.objects;
create policy "Users upload own profile media" on storage.objects for insert to authenticated
with check (bucket_id = 'profile-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Users read own profile media" on storage.objects;
create policy "Users read own profile media" on storage.objects for select to authenticated
using (bucket_id = 'profile-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Users delete own profile media" on storage.objects;
create policy "Users delete own profile media" on storage.objects for delete to authenticated
using (bucket_id = 'profile-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- What was last mirrored onto the FastApply applicant (src/lib/fastapply-media.ts), so a sync
-- that finds nothing changed makes no calls, and why the last attempt failed when it did.
alter table public.fastapply_applicant_sync
  add column if not exists remote_photo_path text,
  add column if not exists remote_photo_use boolean,
  add column if not exists remote_video_path text,
  add column if not exists remote_video_use boolean,
  add column if not exists remote_video_watch_url text,
  add column if not exists media_synced_at timestamptz,
  add column if not exists media_error text;

-- =====================================================================
-- Birthday wishes wall: database + storage setup for Supabase
-- Run this whole file once in: Supabase Dashboard > SQL Editor > New query
--
-- Security model
--   * Guests can only SUBMIT a wish through submit_wish(), which checks a
--     shared passcode. They cannot insert, edit, or delete rows directly.
--   * Every wish starts unapproved. The public can read ONLY approved wishes.
--   * Photos go to a PRIVATE bucket. A photo becomes viewable (via short-lived
--     signed links) only when its wish is approved.
--   * Only users listed in public.admins can see pending items, approve,
--     unpublish, or delete.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Tables ----------------------------------------------------

create table if not exists public.wishes (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(trim(name)) between 1 and 60),
  message      text not null check (char_length(trim(message)) between 1 and 1500),
  photo_path   text check (photo_path ~ '^uploads/[0-9a-f-]{36}\.jpg$'),
  approved     boolean not null default false,
  created_at   timestamptz not null default now(),
  approved_at  timestamptz
);

create index if not exists wishes_approved_created_idx
  on public.wishes (approved, created_at desc);

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.app_settings (
  id             int primary key default 1 check (id = 1),
  passcode_hash  text not null
);

alter table public.wishes       enable row level security;
alter table public.admins       enable row level security;
alter table public.app_settings enable row level security;

-- No policies on admins / app_settings => unreadable through the API.
revoke all on public.admins       from anon, authenticated;
revoke all on public.app_settings from anon, authenticated;

-- Guests never write the table directly; only via submit_wish().
revoke insert, update, delete on public.wishes from anon;

-- ---------- Helper: is the signed-in user an admin? -------------------

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ---------- Row level security for wishes -----------------------------

drop policy if exists "Public reads approved wishes" on public.wishes;
create policy "Public reads approved wishes"
  on public.wishes for select to anon, authenticated
  using (approved);

drop policy if exists "Admins read all wishes" on public.wishes;
create policy "Admins read all wishes"
  on public.wishes for select to authenticated
  using (public.is_admin());

drop policy if exists "Admins update wishes" on public.wishes;
create policy "Admins update wishes"
  on public.wishes for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins delete wishes" on public.wishes;
create policy "Admins delete wishes"
  on public.wishes for delete to authenticated
  using (public.is_admin());

-- ---------- Guest entry points ----------------------------------------

-- Lets the form tell a guest their passcode is wrong BEFORE uploading a photo.
create or replace function public.check_passcode(p_code text)
returns boolean
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare v_hash text;
begin
  select passcode_hash into v_hash from public.app_settings where id = 1;
  return v_hash is not null
     and extensions.crypt(coalesce(p_code, ''), v_hash) = v_hash;
end;
$$;

create or replace function public.submit_wish(
  p_code text, p_name text, p_message text, p_photo_path text default null
)
returns uuid
language plpgsql security definer
set search_path = public, extensions
as $$
declare v_id uuid;
begin
  if not public.check_passcode(p_code) then
    raise exception 'The passcode is incorrect.' using errcode = '28000';
  end if;

  -- Basic flood guard: max 30 submissions per minute across the whole site.
  if (select count(*) from public.wishes
        where created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Too many wishes at once. Try again in a minute.';
  end if;

  insert into public.wishes (name, message, photo_path)
  values (trim(p_name), trim(p_message), nullif(trim(p_photo_path), ''))
  returning id into v_id;

  return v_id;  -- always inserted with approved = false
end;
$$;

revoke all on function public.check_passcode(text) from public;
revoke all on function public.submit_wish(text, text, text, text) from public;
grant execute on function public.check_passcode(text) to anon, authenticated;
grant execute on function public.submit_wish(text, text, text, text) to anon, authenticated;

-- ---------- Private photo storage -------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wish-photos', 'wish-photos', false, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Guests may upload new files into uploads/ only. No overwrite, no read.
drop policy if exists "Guests upload wish photos" on storage.objects;
create policy "Guests upload wish photos"
  on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'wish-photos'
    and (storage.foldername(name))[1] = 'uploads'
    and lower(storage.extension(name)) = 'jpg'
  );

-- A photo is readable (signed link) only once its wish is approved.
drop policy if exists "Approved wish photos are readable" on storage.objects;
create policy "Approved wish photos are readable"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'wish-photos'
    and exists (
      select 1 from public.wishes w
      where w.photo_path = storage.objects.name and w.approved
    )
  );

drop policy if exists "Admins read all wish photos" on storage.objects;
create policy "Admins read all wish photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'wish-photos' and public.is_admin());

drop policy if exists "Admins delete wish photos" on storage.objects;
create policy "Admins delete wish photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'wish-photos' and public.is_admin());

-- =====================================================================
-- AFTER running the above, run these two statements with your own values:
--
-- 1) Set the passcode you'll share with friends:
--    insert into public.app_settings (id, passcode_hash)
--    values (1, extensions.crypt('choose-a-passcode', extensions.gen_salt('bf')))
--    on conflict (id) do update set passcode_hash = excluded.passcode_hash;
--
-- 2) Make your login an admin (create the user first under
--    Authentication > Users > Add user):
--    insert into public.admins (user_id)
--    select id from auth.users where email = 'you@example.com';
-- =====================================================================

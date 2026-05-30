create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  role text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.resource_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  resource_type text not null check (resource_type in ('project', 'custom_block', 'library', 'icon')),
  file_name text not null,
  description text,
  category text not null default 'Utilities',
  sort_key text not null default 'newest',
  file_path text,
  icon_path text,
  preview_one_path text,
  preview_two_path text,
  file_size bigint,
  download_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists resource_items_type_created_idx
  on public.resource_items(resource_type, created_at desc);

create index if not exists resource_items_owner_idx
  on public.resource_items(owner_id);

create table if not exists public.java_codes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  code_name text not null,
  description text,
  source_code text not null,
  category text not null default 'Utilities',
  sort_key text not null default 'newest',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.java_codes add column if not exists description text;

create index if not exists java_codes_created_idx
  on public.java_codes(created_at desc);

create index if not exists java_codes_owner_idx
  on public.java_codes(owner_id);

create table if not exists public.favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_kind text not null check (item_kind in ('resource', 'java')),
  item_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, item_kind, item_id)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_resource_items_updated_at on public.resource_items;
create trigger set_resource_items_updated_at
before update on public.resource_items
for each row execute function public.set_updated_at();

drop trigger if exists set_java_codes_updated_at on public.java_codes;
create trigger set_java_codes_updated_at
before update on public.java_codes
for each row execute function public.set_updated_at();

create or replace function public.profile_role(profile_id uuid)
returns text
language sql
security definer
set search_path = public
as $$
  select role from public.profiles where id = profile_id;
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(public.profile_role(auth.uid()) = 'admin', false);
$$;

create or replace function public.can_manage(owner uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select auth.uid() = owner or public.is_admin();
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1), 'Member')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.increment_resource_download(item_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.resource_items
  set download_count = download_count + 1
  where id = item_id;
$$;

grant execute on function public.increment_resource_download(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.resource_items enable row level security;
alter table public.java_codes enable row level security;
alter table public.favorites enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
on public.profiles for insert
to authenticated
with check (id = auth.uid() and role = 'member');

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin"
on public.profiles for update
to authenticated
using (id = auth.uid() or public.is_admin())
with check (
  public.is_admin()
  or (id = auth.uid() and role = public.profile_role(auth.uid()))
);

drop policy if exists "resource_items_select_authenticated" on public.resource_items;
create policy "resource_items_select_authenticated"
on public.resource_items for select
to authenticated
using (true);

drop policy if exists "resource_items_insert_owner" on public.resource_items;
create policy "resource_items_insert_owner"
on public.resource_items for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "resource_items_update_owner_or_admin" on public.resource_items;
create policy "resource_items_update_owner_or_admin"
on public.resource_items for update
to authenticated
using (public.can_manage(owner_id))
with check (public.can_manage(owner_id));

drop policy if exists "resource_items_delete_owner_or_admin" on public.resource_items;
create policy "resource_items_delete_owner_or_admin"
on public.resource_items for delete
to authenticated
using (public.can_manage(owner_id));

drop policy if exists "java_codes_select_authenticated" on public.java_codes;
create policy "java_codes_select_authenticated"
on public.java_codes for select
to authenticated
using (true);

drop policy if exists "java_codes_insert_owner" on public.java_codes;
create policy "java_codes_insert_owner"
on public.java_codes for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "java_codes_update_owner_or_admin" on public.java_codes;
create policy "java_codes_update_owner_or_admin"
on public.java_codes for update
to authenticated
using (public.can_manage(owner_id))
with check (public.can_manage(owner_id));

drop policy if exists "java_codes_delete_owner_or_admin" on public.java_codes;
create policy "java_codes_delete_owner_or_admin"
on public.java_codes for delete
to authenticated
using (public.can_manage(owner_id));

drop policy if exists "favorites_select_own" on public.favorites;
create policy "favorites_select_own"
on public.favorites for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "favorites_insert_own" on public.favorites;
create policy "favorites_insert_own"
on public.favorites for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "favorites_delete_own" on public.favorites;
create policy "favorites_delete_own"
on public.favorites for delete
to authenticated
using (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('resource-files', 'resource-files', false, 104857600),
  ('resource-icons', 'resource-icons', false, 10485760),
  ('resource-previews', 'resource-previews', false, 20971520)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "storage_read_authenticated_resources" on storage.objects;
create policy "storage_read_authenticated_resources"
on storage.objects for select
to authenticated
using (bucket_id in ('resource-files', 'resource-icons', 'resource-previews'));

drop policy if exists "storage_insert_own_folder" on storage.objects;
create policy "storage_insert_own_folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id in ('resource-files', 'resource-icons', 'resource-previews')
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "storage_update_owner_or_admin" on storage.objects;
create policy "storage_update_owner_or_admin"
on storage.objects for update
to authenticated
using (
  bucket_id in ('resource-files', 'resource-icons', 'resource-previews')
  and (owner = auth.uid() or public.is_admin())
)
with check (
  bucket_id in ('resource-files', 'resource-icons', 'resource-previews')
  and (owner = auth.uid() or public.is_admin())
);

drop policy if exists "storage_delete_owner_or_admin" on storage.objects;
create policy "storage_delete_owner_or_admin"
on storage.objects for delete
to authenticated
using (
  bucket_id in ('resource-files', 'resource-icons', 'resource-previews')
  and (owner = auth.uid() or public.is_admin())
);

-- Promote a user to admin after they sign up:
-- update public.profiles set role = 'admin' where email lookup is done from auth.users in the Supabase dashboard.

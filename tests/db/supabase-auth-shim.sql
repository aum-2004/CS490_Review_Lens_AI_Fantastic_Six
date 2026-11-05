-- Test-only stand-in for the parts of Supabase that migrations depend on, so they can run
-- against a plain local PostgreSQL. Never apply this to a real Supabase project: Supabase
-- already provides the auth schema, auth.uid(), and these roles.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$$;

grant anon, authenticated to current_user;

create schema auth;
create table auth.users (id uuid primary key);

-- Same contract as Supabase: the signed-in user's id from the request JWT, or null.
create function auth.uid() returns uuid
language sql stable
as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

-- Supabase grants table access to these roles by default and relies on RLS to restrict rows.
alter default privileges in schema public grant all on tables to anon, authenticated;

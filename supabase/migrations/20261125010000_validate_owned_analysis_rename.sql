-- S3-002 review: defend the direct Supabase Data API name-update boundary.
-- The application normalizes format characters away, retaining ZWJ/ZWNJ in visible
-- multilingual/emoji names. Direct writes must also reject controls, unnormalized
-- format characters, and names consisting only of whitespace/format characters.
-- U& escapes spell out Unicode code points independently of database locale.
-- First character class: Cc/Cf, except meaningful ZWJ/ZWNJ. Second class:
-- ECMAScript trim whitespace plus those joiners, after other Cf were excluded.
-- Existing name-length/NOT NULL constraints still apply. No stored data is changed.
-- Keep this separate because the original rename grant may already be applied.
alter policy analysis_targets_update_name_own
  on public.analysis_targets
  with check (
    (select auth.uid()) = owner_id
    and name !~ U&'[\0001-\001F\007F-\009F\00AD\0600-\0605\061C\06DD\070F\0890-\0891\08E2\180E\200B\200E-\200F\202A-\202E\2060-\2064\2066-\206F\FEFF\FFF9-\FFFB\+0110BD\+0110CD\+013430-\+01343F\+01BCA0-\+01BCA3\+01D173-\+01D17A\+0E0001\+0E0020-\+0E007F]'
    and name ~ U&'[^\0009-\000D\0020\00A0\1680\2000-\200D\2028-\2029\202F\205F\3000\FEFF]'
  );

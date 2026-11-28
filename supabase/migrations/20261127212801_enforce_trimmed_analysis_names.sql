-- PR #132: enforce canonical trimmed names for direct authenticated updates.
-- The plain btrim guard covers spaces; its explicit character-set counterpart
-- also matches JavaScript trim's Unicode whitespace. Preserve meaningful emoji,
-- combining marks, and joiners, plus all existing owner/unsafe/invisible checks.
-- Forward-only policy alteration: earlier rename SQL is already applied manually.
-- No persisted names or migration-history rows are rewritten here.
alter policy analysis_targets_update_name_own
  on public.analysis_targets
  with check (
    (select auth.uid()) = owner_id
    and name = btrim(name)
    and name = btrim(name, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
    and name !~ U&'[\0001-\001F\007F-\009F\00AD\0600-\0605\061C\06DD\070F\0890-\0891\08E2\180E\200B\200E-\200F\202A-\202E\2060-\2064\2066-\206F\FEFF\FFF9-\FFFB\+0110BD\+0110CD\+013430-\+01343F\+01BCA0-\+01BCA3\+01D173-\+01D17A\+0E0001\+0E0020-\+0E007F]'
    and name ~ U&'[^\0009-\000D\0020\00A0\00AD\034F\0600-\0605\061C\06DD\070F\0890-\0891\08E2\115F-\1160\1680\17B4-\17B5\180B-\180F\2000-\200F\2028-\202F\205F-\206F\3000\3164\FE00-\FE0F\FEFF\FFA0\FFF0-\FFFB\+0110BD\+0110CD\+013430-\+01343F\+01BCA0-\+01BCA3\+01D173-\+01D17A\+0E0000-\+0E0FFF]'
  );

-- PR #132 reviewer follow-up: CGJ and variation selectors are default-ignorable
-- marks, not Cf. A name needs content beyond Unicode Default_Ignorable_Code_Point,
-- Cf, and ECMAScript whitespace. Ignore these only for the content test so valid
-- combining marks, emoji selectors, and ZWJ/ZWNJ sequences stay unchanged.
-- PostgreSQL regexes use explicit Unicode ranges instead of JS binary properties.
-- Ranges match the shared application validator (Unicode 17.0).
-- Keep the existing owner check and unsafe-character restriction. No rows change.
-- Separate migration because the preceding rename policies may already be applied.
alter policy analysis_targets_update_name_own
  on public.analysis_targets
  with check (
    (select auth.uid()) = owner_id
    and name !~ U&'[\0001-\001F\007F-\009F\00AD\0600-\0605\061C\06DD\070F\0890-\0891\08E2\180E\200B\200E-\200F\202A-\202E\2060-\2064\2066-\206F\FEFF\FFF9-\FFFB\+0110BD\+0110CD\+013430-\+01343F\+01BCA0-\+01BCA3\+01D173-\+01D17A\+0E0001\+0E0020-\+0E007F]'
    and name ~ U&'[^\0009-\000D\0020\00A0\00AD\034F\0600-\0605\061C\06DD\070F\0890-\0891\08E2\115F-\1160\1680\17B4-\17B5\180B-\180F\2000-\200F\2028-\202F\205F-\206F\3000\3164\FE00-\FE0F\FEFF\FFA0\FFF0-\FFFB\+0110BD\+0110CD\+013430-\+01343F\+01BCA0-\+01BCA3\+01D173-\+01D17A\+0E0000-\+0E0FFF]'
  );

/**
 * Makes a string safe to store in Postgres text and jsonb. Postgres rejects NUL (\u0000) and
 * lone UTF-16 surrogates (for example a cut-off emoji such as "\ud83d"), and one such character
 * would fail a whole batch insert. NUL is removed and each lone surrogate is replaced with
 * U+FFFD. Valid surrogate pairs, such as emoji, are left unchanged.
 */
export const toStorableText = (value: string): string =>
  value.split("\u0000").join("").toWellFormed();

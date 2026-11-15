import { readdirSync } from "node:fs";

/** Supabase identifies migrations by version, not by the full SQL filename. */
export function validateMigrationFilenames(filenames: readonly string[]): string[] {
  const versions = new Map<string, string[]>();
  const errors: string[] = [];
  const migrations = filenames.filter((name) => name.toLowerCase().endsWith(".sql")).sort();
  if (migrations.length === 0) errors.push("No SQL migrations found.");

  for (const name of migrations) {
    const match = /^(\d{14})_.+\.sql$/.exec(name);
    if (!match) {
      errors.push(`Invalid migration filename: ${name}; expected YYYYMMDDHHMMSS_name.sql.`);
      continue;
    }
    const version = match[1];
    const names = versions.get(version) ?? [];
    names.push(name);
    versions.set(version, names);
  }
  for (const [version, names] of versions) {
    if (names.length > 1)
      errors.push(`Duplicate migration version ${version}: ${names.join(", ")}`);
  }
  return errors;
}

export function checkMigrationDirectory(directory: string): string[] {
  return validateMigrationFilenames(
    readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name),
  );
}

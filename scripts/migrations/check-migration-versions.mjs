// Thin Node 24 entry point; validation is tested/coverage-measured in the TS module.
import { fileURLToPath } from "node:url";
import { checkMigrationDirectory } from "./migration-versions.ts";

try {
  const errors = checkMigrationDirectory(
    process.argv[2] ?? fileURLToPath(new URL("../../supabase/migrations", import.meta.url)),
  );
  if (errors.length) {
    errors.forEach((error) => console.error(error));
    process.exitCode = 1;
  } else {
    console.log("Migration filenames and timestamp versions are valid and unique.");
  }
} catch (error) {
  console.error("Unable to check migration versions:", error.message);
  process.exitCode = 2;
}

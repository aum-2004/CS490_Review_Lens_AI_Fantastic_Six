/** @jest-environment node */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import {
  checkMigrationDirectory,
  validateMigrationFilenames,
} from "../../../../scripts/migrations/migration-versions";

const SUMMARY = "20261113000000_create_review_summary.sql";
const OLD_QUOTA = "20261113000000_limit_paid_review_questions.sql";
const NEW_QUOTA = "20261115043442_limit_paid_review_questions.sql";
const CLI = resolve(__dirname, "../../../../scripts/migrations/check-migration-versions.mjs");
let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "reviewlens-migration-versions-"));
});
afterEach(() => {
  if (!resolve(directory).startsWith(resolve(tmpdir()) + sep))
    throw new Error("Refusing cleanup outside the temporary directory.");
  rmSync(directory, { recursive: true, force: true });
});

it("detects the actual S2-006/S2-009 timestamp collision despite distinct names", () => {
  expect(validateMigrationFilenames([SUMMARY, OLD_QUOTA])).toEqual([
    `Duplicate migration version 20261113000000: ${SUMMARY}, ${OLD_QUOTA}`,
  ]);
});

it("keeps S2-006 unchanged and accepts the new S2-009 version", () => {
  expect(validateMigrationFilenames([NEW_QUOTA, SUMMARY, "README.md"])).toEqual([]);
});

it.each(["bad.sql", "2026111300000_short.sql", "20261113000000_.sql", "20261113000000_name.SQL"])(
  "rejects malformed SQL migration names: %s",
  (filename) => {
    expect(validateMigrationFilenames([filename])).toEqual([
      expect.stringContaining(`Invalid migration filename: ${filename}`),
    ]);
  },
);

it.each([{ names: [] }, { names: ["README.md"] }])(
  "fails closed on an empty migration set (%#. case)",
  ({ names }) => {
    expect(validateMigrationFilenames(names)).toEqual(["No SQL migrations found."]);
  },
);

function cli(...args: string[]) {
  return spawnSync(
    process.execPath,
    ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", CLI, ...args],
    { encoding: "utf8" },
  );
}

it("rejects a combined 006/009 directory through the real CLI before SQL execution", () => {
  for (const name of [SUMMARY, OLD_QUOTA]) writeFileSync(join(directory, name), "-- fixture\n");
  const result = cli(directory);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(`Duplicate migration version 20261113000000: ${SUMMARY}`);
  expect(result.stderr).toContain(OLD_QUOTA);
  expect(result.stdout).toBe("");
});

it("checks real files, ignoring documentation and directories", () => {
  writeFileSync(join(directory, SUMMARY), "-- fixture\n");
  writeFileSync(join(directory, NEW_QUOTA), "-- fixture\n");
  writeFileSync(join(directory, "README.md"), "documentation");
  mkdirSync(join(directory, "nested.sql"));
  expect(checkMigrationDirectory(directory)).toEqual([]);
  const result = cli(directory);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("valid and unique");
  expect(result.stderr).toBe("");
});

it("fails closed when the migration directory cannot be read", () => {
  const missing = join(directory, "missing");
  expect(() => checkMigrationDirectory(missing)).toThrow();
  const result = cli(missing);
  expect(result.status).toBe(2);
  expect(result.stderr).toContain("Unable to check migration versions");
});

it("validates the repository migrations through the default CLI path", () => {
  const result = cli();
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("valid and unique");
});

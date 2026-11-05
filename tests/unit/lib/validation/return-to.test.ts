import { getProtectedReturnTo } from "@/lib/validation/return-to";

it.each(["/analysis-targets", "/analysis-targets/new", "/analysis-targets/target-a?tab=reviews"])(
  "preserves the requested protected page %s",
  (path) => expect(getProtectedReturnTo(path)).toBe(path),
);

it.each([
  undefined,
  ["/analysis-targets"],
  "https://example.com/analysis-targets",
  "//example.com/analysis-targets",
  "/\\example.com/analysis-targets",
  "/analysis-targets/../../login",
  "/analysis-targets-other",
  "/login",
  "/api/analysis-targets",
  "javascript:alert(1)",
  "/analysis-targets\n",
])("rejects an unsafe or unrelated destination %j", (value) => {
  expect(getProtectedReturnTo(value)).toBeNull();
});

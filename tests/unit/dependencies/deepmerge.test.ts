/** @jest-environment node */

import { createRequire } from "node:module";

type Merge = {
  (
    target: object,
    source: object,
    options?: { arrayMerge?: (target: unknown[], source: unknown[]) => unknown[] },
  ): Record<PropertyKey, unknown>;
  all(objects: object[]): Record<PropertyKey, unknown>;
};
const rootRequire = createRequire(__filename);
const consumerRequire = createRequire(rootRequire.resolve("jest-config"));
const merge = consumerRequire("deepmerge") as Merge;

it("runs the locally patched package actually resolved by Jest configuration", () => {
  expect(consumerRequire("deepmerge/package.json").version).toBe("4.3.1+reviewlens.1");
});

it("does not poison results from own __proto__ keys in a copied target", () => {
  const target = JSON.parse('{"__proto__":{"inheritedAdmin":true},"kept":1}');
  const result = merge(target, { added: 2 });
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  expect(result.inheritedAdmin).toBeUndefined();
  expect(result.kept).toBe(1);
  expect(result.added).toBe(2);
  expect(Object.hasOwn(result, "__proto__")).toBe(true);
  expect(Object.getOwnPropertyDescriptor(result, "__proto__")?.value).toEqual({
    inheritedAdmin: true,
  });
});

it("does not poison results when the target has no prototype", () => {
  const result = merge(Object.create(null), JSON.parse('{"__proto__":{"inheritedAdmin":true}}'));
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  expect(result.inheritedAdmin).toBeUndefined();
});

it("preserves the prototype when recursively merging an own __proto__ property", () => {
  const target = JSON.parse('{"__proto__":{"left":1}}');
  const source = JSON.parse('{"__proto__":{"inheritedAdmin":true}}');
  const result = merge(target, source);
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  expect(result.inheritedAdmin).toBeUndefined();
});

it("preserves nested object prototypes without polluting Object.prototype", () => {
  const result = merge(
    { nested: JSON.parse('{"__proto__":{"inheritedAdmin":true}}') },
    { nested: { safe: true } },
  );
  expect(Object.getPrototypeOf(result.nested)).toBe(Object.prototype);
  expect(result.nested).toEqual(expect.objectContaining({ safe: true }));
  expect(Reflect.get(Object.prototype, "inheritedAdmin")).toBeUndefined();
});

it("retains Jest's array options, symbols, cloning and all API", () => {
  const symbol = Symbol("setting");
  const target = { nested: { left: 1 }, items: [1], [symbol]: "retained" };
  expect(merge(target, { nested: { right: 2 }, items: [2] })).toEqual({
    nested: { left: 1, right: 2 },
    items: [1, 2],
    [symbol]: "retained",
  });
  expect(merge(target, { items: [2] }, { arrayMerge: (_left, right) => right }).items).toEqual([2]);
  expect(target.items).toEqual([1]);
  expect(merge.all([{ first: 1 }, { second: 2 }])).toEqual({ first: 1, second: 2 });
});

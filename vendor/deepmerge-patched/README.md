# Local deepmerge security patch

This private package derives from the MIT-licensed bundled CommonJS implementation
of `deepmerge@4.3.1`. The upstream copyright/license is retained in `LICENSE`.
It is a direct local development dependency, hoisted under the `deepmerge` module
name for Jest configuration merging. Application Q&A services do not import it.
The build-metadata version `4.3.1+reviewlens.1` preserves Jest's semver requirement
while identifying the local patch. `.npmrc` enables packing local dependencies so
clean installs do not rely on nested directory links.

Upstream has no patched release for [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).
Do not downgrade to an older release merely to suppress the advisory. The patch
replaces all three writes in `mergeObject` with `Object.defineProperty` so an own
`__proto__` key cannot invoke the inherited prototype setter. Other merge behavior
(including symbols, options, arrays and `all`) is retained. Formatting is normalized.
The private package name/version explicitly identifies this local fork.

There are no runtime dependencies or install scripts. Regression tests in
`tests/unit/dependencies/deepmerge.test.ts` exercise poisoned source/target objects,
null-prototype targets, nested objects and normal/custom array merging. The full
Jest suite additionally exercises the real consumer. A clean npm audit does not
review this local source; its patch and tests require security review under the
project's AI-assisted-development policy. Replace this local dependency with a verified
upstream fix once one becomes available, retaining the regression tests.

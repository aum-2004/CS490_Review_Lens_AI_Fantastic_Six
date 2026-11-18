import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(currentDirectory, "..", "..");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function configuredModelEvaluationResolver(
  request,
  parent,
  isMain,
  options,
) {
  let resolvedRequest = request;
  if (request === "server-only") {
    resolvedRequest = path.join(currentDirectory, "server-only-stub.cjs");
  } else if (request.startsWith("@/")) {
    resolvedRequest = path.join(repositoryRoot, "src", request.slice(2));
  }
  return originalResolveFilename.call(this, resolvedRequest, parent, isMain, options);
};

process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: "CommonJS",
  moduleResolution: "node",
  target: "ES2022",
});

const requireFromHere = createRequire(import.meta.url);
requireFromHere("ts-node/register/transpile-only");
void requireFromHere("./cli.ts").runCli();

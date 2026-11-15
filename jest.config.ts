import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  dir: "./",
});

const config: Config = {
  clearMocks: true,
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "scripts/**/*.ts",
    "!src/**/*.d.ts",
    "!src/app/layout.tsx",
  ],
  coverageProvider: "v8",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testEnvironment: "jsdom",
  testMatch: ["<rootDir>/tests/unit/**/*.test.{ts,tsx}"],
};

export default createJestConfig(config);

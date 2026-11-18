import { render, screen, within } from "@testing-library/react";
import { PasswordRequirements } from "@/components/auth/PasswordRequirements";

function requirement(password: string, index: number) {
  render(<PasswordRequirements id="requirements" password={password} />);
  return within(screen.getByRole("list", { name: "Password requirements" })).getAllByRole(
    "listitem",
  )[index];
}

it.each([
  ["Ab1!abc", false],
  ["Ab1!abcd", true],
  ["Ab1!abc ", true],
  ["Ab1!\u{1f600}\u{1f600}", false],
])(
  "checks the eight-character boundary for %s without counting an emoji twice",
  (password, met) => {
    expect(requirement(password, 0)).toHaveTextContent(met ? /^Met:/ : /^Not met:/);
  },
);

it.each([
  "!",
  "@",
  "#",
  "$",
  "%",
  "^",
  "&",
  "*",
  "(",
  ")",
  "_",
  "+",
  "-",
  "=",
  "[",
  "]",
  "{",
  "}",
  ";",
  "'",
  "\\",
  ":",
  '"',
  "|",
  "<",
  ">",
  "?",
  ",",
  ".",
  "/",
  "`",
  "~",
])("recognizes the provider's symbol %s", (symbol) => {
  expect(requirement(`Abcdef1${symbol}`, 4)).toHaveTextContent(/^Met:/);
});

it.each([" ", "\t", "\n", "\u00e9", "\u{1f600}"])(
  "does not count %j as a required symbol",
  (character) => {
    expect(requirement(`Abcdef1${character}`, 4)).toHaveTextContent(/^Not met:/);
  },
);

# `src/components/ui` — UI primitives

Reserved for shadcn/ui primitives (Button, Input, Dialog, and so on). shadcn/ui copies component
source into this folder instead of installing a runtime package.

S1-009 manually establishes `components.json` and the Button, Input, Label, Form, and Card
primitives following shadcn/ui's composition patterns. Components use PascalCase filenames
to follow S1-001. Radix primitives are imported through the approved `radix-ui` package.
The Button and Input follow the official shadcn/ui source, adapted for the team's 40px
height and two-pixel focus ring. Form composes React Hook Form and Radix Slot/Label.
Theme tokens live in `src/app/globals.css`; the existing Geist font remains pending a
separate decision about the S1-002 Inter requirement.

Reuse these primitives; add variants here instead of duplicating form styles in features.
If using the shadcn CLI later, account for its lowercase filenames so it does not generate
duplicate components beside these PascalCase files. Running the CLI is not required for setup.

Feature-specific components go in sibling folders such as `src/components/analysis-targets/`,
and components shared across features go in `src/components/shared/`.

## Supported exports and reuse

This is the subset introduced for authentication, not the complete shadcn/ui component catalog.
Use these exact imports and extend the existing shared files when a later story needs another part.

| Import                        | Supported API                                                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `@/components/ui/Button`      | `Button`; native button props, `asChild`, and `variant` values `default`, `outline`, `ghost`, `destructive`; default height 40px |
| `@/components/ui/Input`       | `Input`; native input props and React 19 ref forwarding through props                                                            |
| `@/components/ui/Label`       | `Label`; Radix Label props including `htmlFor`                                                                                   |
| `@/components/ui/Card`        | `Card`; a padded section accepting native section props                                                                          |
| `@/components/ui/Form`        | `Form` (React Hook Form provider), `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`                            |
| `@/components/shared/Spinner` | `Spinner`; shared action indicator respecting reduced motion                                                                     |
| `@/lib/utils/cn`              | `cn`; merges conditional Tailwind class names                                                                                    |

`CardHeader`, `CardContent`, `CardFooter`, `FormDescription`, and the full shadcn variant/size
APIs are not currently exported. Do not assume they exist or create a second Card/Form file;
add needed parts to the shared primitive through the story that uses them. Field controls must
be nested inside `Form`, `FormField`, and `FormItem` so IDs, labels, and errors stay linked.

The current authentication UI uses `AuthForm` and `SessionPanel` under `src/components/auth/`.
S1-010 or the owning layout story can reuse the existing sign-out Server Action in its account
menu; no second authentication client, password flow, or sign-out implementation is needed.

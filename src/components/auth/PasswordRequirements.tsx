import { Check, Circle } from "lucide-react";

// Mirrors the team's confirmed Supabase registration policy. This is guidance;
// Supabase remains authoritative and sign-in validation is not changed.
// Symbol set: https://supabase.com/docs/guides/auth/password-security
const SYMBOLS = "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~";

export function PasswordRequirements({ password, id }: { password: string; id: string }) {
  const requirements = [
    { label: "At least 8 characters", met: Array.from(password).length >= 8 },
    { label: "One uppercase letter (A-Z)", met: /[A-Z]/.test(password) },
    { label: "One lowercase letter (a-z)", met: /[a-z]/.test(password) },
    { label: "One digit (0-9)", met: /[0-9]/.test(password) },
    {
      label: "One symbol (for example, ! @ #)",
      met: Array.from(password).some((character) => SYMBOLS.includes(character)),
    },
  ];

  return (
    <div id={id} className="space-y-2 text-sm">
      <p className="font-medium">Password requirements</p>
      <ul
        aria-label="Password requirements"
        aria-live="polite"
        aria-atomic={false}
        className="space-y-1"
      >
        {requirements.map(({ label, met }) => {
          const Icon = met ? Check : Circle;
          return (
            <li
              key={label}
              className={`flex items-center gap-2 ${met ? "text-success" : "text-muted-foreground"}`}
            >
              <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span className="sr-only">{met ? "Met: " : "Not met: "}</span>
              <span>{label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

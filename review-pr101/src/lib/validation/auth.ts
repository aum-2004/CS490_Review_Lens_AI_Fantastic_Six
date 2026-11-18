import { z } from "zod";

export const authCredentialsSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter your email address.")
    .email("Enter a valid email address."),
  // Passwords must reach the provider exactly as entered, including whitespace.
  // Supabase owns password policy; do not impose a different login policy here.
  password: z.string().min(1, "Enter your password."),
});

export type AuthCredentials = z.infer<typeof authCredentialsSchema>;
export type AuthResult = {
  success: boolean;
  message?: string;
  requiresConfirmation?: boolean;
  fieldErrors?: Partial<Record<keyof AuthCredentials, string>>;
};

export type AuthIdentity = { id: string; email: string | null };

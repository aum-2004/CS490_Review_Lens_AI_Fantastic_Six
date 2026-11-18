"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { register, signIn } from "@/app/login/actions";
import { authCredentialsSchema, type AuthCredentials } from "@/lib/validation/auth";
import { Button } from "@/components/ui/Button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/Form";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/shared/Spinner";
import { getProtectedReturnTo } from "@/lib/validation/return-to";
import { PasswordRequirements } from "./PasswordRequirements";

export function AuthForm({ returnTo }: { returnTo?: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "register">("sign-in");
  const [showPassword, setShowPassword] = useState(false);
  const passwordRequirementsId = useId();
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const form = useForm<AuthCredentials>({
    resolver: zodResolver(authCredentialsSchema),
    defaultValues: { email: "", password: "" },
    mode: "onSubmit",
    reValidateMode: "onChange",
  });
  const pending = form.formState.isSubmitting;

  async function submit(values: AuthCredentials) {
    setFeedback(null);
    try {
      const result = await (mode === "register" ? register(values) : signIn(values));
      if (result.fieldErrors) {
        for (const field of ["email", "password"] as const) {
          const message = result.fieldErrors[field];
          if (message) form.setError(field, { type: "server", message });
        }
        form.setFocus(result.fieldErrors.email ? "email" : "password");
      }
      if (result.message) setFeedback({ message: result.message, error: !result.success });
      if (result.success) {
        form.resetField("password");
        if (!result.requiresConfirmation) {
          const destination = getProtectedReturnTo(returnTo) ?? "/analysis-targets";
          router.replace(destination);
          router.refresh();
        }
      }
    } catch {
      setFeedback({
        message: "We couldn't reach the sign-in service. Please try again.",
        error: true,
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2" role="group" aria-label="Account access">
        {(["sign-in", "register"] as const).map((value) => (
          <Button
            key={value}
            type="button"
            variant={mode === value ? "default" : "outline"}
            aria-pressed={mode === value}
            disabled={pending}
            onClick={() => {
              setMode(value);
              setShowPassword(false);
              setFeedback(null);
              form.clearErrors();
              form.resetField("password");
            }}
          >
            {value === "sign-in" ? "Sign in" : "Register"}
          </Button>
        ))}
      </div>
      <Form {...form}>
        <form
          noValidate
          className="space-y-4"
          aria-label={mode === "sign-in" ? "Sign in" : "Register"}
          onSubmit={(event) => {
            if (pending) {
              event.preventDefault();
              return;
            }
            setShowPassword(false);
            setFeedback(null);
            void form.handleSubmit(submit)(event);
          }}
        >
          <p className="text-sm text-muted-foreground">*Required</p>
          {Object.keys(form.formState.errors).length >= 2 && (
            <p role="alert" className="text-sm text-destructive">
              Please fix the highlighted fields.
            </p>
          )}
          {feedback && (
            <p
              role={feedback.error ? "alert" : "status"}
              className={feedback.error ? "text-sm text-destructive" : "text-sm text-foreground"}
            >
              {feedback.message}
            </p>
          )}
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email *</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="email"
                    autoComplete="email"
                    required
                    aria-required="true"
                    readOnly={pending}
                    onBlur={() => {
                      field.onBlur();
                      if (form.formState.isSubmitted) void form.trigger("email");
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password *</FormLabel>
                <div className="flex items-center gap-2">
                  <FormControl
                    aria-describedby={mode === "register" ? passwordRequirementsId : undefined}
                  >
                    <Input
                      {...field}
                      type={showPassword ? "text" : "password"}
                      className="min-w-0 flex-1"
                      autoComplete={mode === "register" ? "new-password" : "current-password"}
                      required
                      aria-required="true"
                      readOnly={pending}
                      onBlur={() => {
                        field.onBlur();
                        if (form.formState.isSubmitted) void form.trigger("password");
                      }}
                    />
                  </FormControl>
                  <Button
                    type="button"
                    variant="outline"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    disabled={pending}
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="w-20 shrink-0 px-3"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </Button>
                </div>
                {mode === "register" && (
                  <PasswordRequirements id={passwordRequirementsId} password={field.value} />
                )}
                <FormMessage />
              </FormItem>
            )}
          />
          {mode === "register" && (
            <p className="text-sm text-muted-foreground">
              You may need to confirm your email before signing in.
            </p>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={pending} className="min-w-32">
              {pending && <Spinner />}
              {pending
                ? mode === "sign-in"
                  ? "Signing in…"
                  : "Registering…"
                : mode === "sign-in"
                  ? "Sign in"
                  : "Register"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

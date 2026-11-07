"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { CircleAlert } from "lucide-react";
import { useRouter } from "next/navigation";

import { Spinner } from "@/components/shared/Spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { AnalysisTargetCreationError, createAnalysisTarget } from "@/lib/api/analysis-targets";
import {
  validateAnalysisTargetInput,
  type AnalysisTargetInputField,
  type AnalysisTargetValidationIssue,
} from "@/lib/validation/analysis-target";
import type { AnalysisTarget, CreateAnalysisTarget } from "@/types/analysis-target";

interface TargetFormProps {
  createTarget?: CreateAnalysisTarget;
}

type FieldErrors = Partial<Record<AnalysisTargetInputField, string>>;

interface FieldErrorProps {
  id: string;
  message: string;
}

function targetNameCharacterCount(value: string): number {
  // Presentation-only mirror of the shared validator's private name normalization. Keep ZWJ/ZWNJ
  // because they can be meaningful within otherwise visible names.
  const normalizedName = value.replace(/(?![\u200C\u200D])\p{Cf}/gu, "").trim();
  return Array.from(normalizedName).length;
}

function fieldErrorsFromIssues(issues: readonly AnalysisTargetValidationIssue[]): FieldErrors {
  const errors: FieldErrors = {};

  for (const issue of issues) {
    if (issue.field && errors[issue.field] === undefined) {
      errors[issue.field] = issue.message;
    }
  }

  return errors;
}

function fieldErrorFromInput(
  field: AnalysisTargetInputField,
  name: string,
  sourceUrl: string,
): string | undefined {
  const validation = validateAnalysisTargetInput({ name, sourceUrl });

  if (validation.success) {
    return undefined;
  }

  return validation.error.issues.find((issue) => issue.field === field)?.message;
}

function FieldError({ id, message }: FieldErrorProps) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm text-destructive" role="alert">
      <CircleAlert aria-label="Error" className="mt-0.5 size-4 shrink-0" role="img" />
      <span>{message}</span>
    </p>
  );
}

function TargetCreationConfirmation({ target }: { target: AnalysisTarget }) {
  return (
    <Alert role="status" aria-live="polite">
      <AlertTitle>Target created</AlertTitle>
      <AlertDescription>
        <p className="max-w-prose break-words">Opening the workspace for {target.name}…</p>
      </AlertDescription>
    </Alert>
  );
}

export function TargetForm({ createTarget = createAnalysisTarget }: TargetFormProps) {
  const { bfcacheId } = useRouter();

  return <TargetFormState key={bfcacheId} createTarget={createTarget} />;
}

function TargetFormState({ createTarget }: Required<TargetFormProps>) {
  const router = useRouter();
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const nameRef = useRef<HTMLInputElement>(null);
  const sourceUrlRef = useRef<HTMLInputElement>(null);
  const submissionInFlight = useRef(false);
  const creationComplete = useRef(false);
  const [name, setName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [createdTarget, setCreatedTarget] = useState<AnalysisTarget>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasValidationAttempted, setHasValidationAttempted] = useState(false);

  const fieldErrorCount = Object.values(fieldErrors).filter(Boolean).length;
  const targetNameLength = targetNameCharacterCount(name);
  const targetNameCountAnnouncement =
    targetNameLength > 120
      ? "Target name exceeds the 120-character limit."
      : targetNameLength === 120
        ? "Target name character limit reached."
        : targetNameLength >= 110
          ? "10 or fewer characters remaining."
          : "";

  const focusFirstInvalidField = (errors: FieldErrors) => {
    if (errors.name) {
      nameRef.current?.focus();
    } else if (errors.sourceUrl) {
      sourceUrlRef.current?.focus();
    }
  };

  const revalidateField = (
    field: AnalysisTargetInputField,
    nextName: string,
    nextSourceUrl: string,
  ) => {
    if (!hasValidationAttempted) {
      return;
    }

    const error = fieldErrorFromInput(field, nextName, nextSourceUrl);
    setFieldErrors((current) => ({ ...current, [field]: error }));
  };

  const updateName = (event: ChangeEvent<HTMLInputElement>) => {
    const nextName = event.target.value;
    setName(nextName);
    revalidateField("name", nextName, sourceUrl);
  };

  const updateSourceUrl = (event: ChangeEvent<HTMLInputElement>) => {
    const nextSourceUrl = event.target.value;
    setSourceUrl(nextSourceUrl);
    revalidateField("sourceUrl", name, nextSourceUrl);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (submissionInFlight.current || creationComplete.current) {
      return;
    }

    setFormError(undefined);

    const validation = validateAnalysisTargetInput({ name, sourceUrl });

    if (!validation.success) {
      const errors = fieldErrorsFromIssues(validation.error.issues);
      setHasValidationAttempted(true);
      setFieldErrors(errors);
      focusFirstInvalidField(errors);
      return;
    }

    setFieldErrors({});
    submissionInFlight.current = true;
    setIsSubmitting(true);

    try {
      const target = await createTarget(validation.data);
      if (!active.current) return;
      setFieldErrors({});
      creationComplete.current = true;
      setCreatedTarget(target);
      router.replace(`/analysis-targets/${encodeURIComponent(target.id)}?created=1`);
    } catch (error) {
      if (!active.current) return;
      if (error instanceof AnalysisTargetCreationError) {
        if (error.code === "AUTHENTICATION_REQUIRED") {
          router.push("/login?next=%2Fanalysis-targets%2Fnew");
          return;
        }

        const errors = fieldErrorsFromIssues(error.issues);
        const hasFieldErrors = Object.values(errors).some(Boolean);
        setFieldErrors(errors);
        if (hasFieldErrors) {
          setHasValidationAttempted(true);
        }
        setFormError(hasFieldErrors ? undefined : error.message);
        focusFirstInvalidField(errors);
      } else {
        setFormError("We couldn't create this target. Please try again.");
      }
    } finally {
      submissionInFlight.current = false;
      setIsSubmitting(false);
    }
  };

  if (createdTarget) {
    return <TargetCreationConfirmation target={createdTarget} />;
  }

  return (
    <form className="space-y-4" noValidate onSubmit={submit} aria-busy={isSubmitting}>
      <p className="text-sm text-muted-foreground">
        <span aria-hidden="true">*</span> Required
      </p>

      {formError ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Target not created</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      {fieldErrorCount >= 2 ? (
        <Alert variant="destructive" role="alert">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Please fix the highlighted fields.</AlertTitle>
        </Alert>
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor="target-name">
          Target name <span aria-hidden="true">*</span>
        </Label>
        <Input
          ref={nameRef}
          id="target-name"
          name="name"
          type="text"
          autoComplete="organization"
          placeholder="NJIT, Newark"
          value={name}
          onChange={updateName}
          onBlur={() => revalidateField("name", name, sourceUrl)}
          aria-required="true"
          aria-invalid={fieldErrors.name ? "true" : "false"}
          aria-describedby={`target-name-help${fieldErrors.name ? " target-name-error" : ""}`}
        />
        <div className="flex items-start justify-between gap-4 text-sm">
          <p id="target-name-help" className="text-muted-foreground">
            Use a name you will recognize. Leading and trailing whitespace is removed before
            validation. Maximum 120 characters.
          </p>
          <span className="shrink-0 text-muted-foreground" aria-hidden="true">
            {targetNameLength}/120
          </span>
          <span
            id="target-name-count-status"
            className="sr-only"
            aria-live="polite"
            aria-atomic="true"
          >
            {targetNameCountAnnouncement}
          </span>
        </div>
        {fieldErrors.name ? <FieldError id="target-name-error" message={fieldErrors.name} /> : null}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="review-platform">Review platform</Label>
        <Input
          id="review-platform"
          name="platform"
          value="Google Maps"
          readOnly
          aria-describedby="review-platform-help"
          className="bg-muted/40 font-medium"
        />
        <p id="review-platform-help" className="text-sm text-muted-foreground">
          ReviewLens currently supports Google Maps business listings.
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="source-url">
          Google Maps URL <span aria-hidden="true">*</span>
        </Label>
        <Input
          ref={sourceUrlRef}
          id="source-url"
          name="sourceUrl"
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="https://www.google.com/maps/place/..."
          value={sourceUrl}
          onChange={updateSourceUrl}
          onBlur={() => revalidateField("sourceUrl", name, sourceUrl)}
          aria-required="true"
          aria-invalid={fieldErrors.sourceUrl ? "true" : "false"}
          aria-describedby={`source-url-help${fieldErrors.sourceUrl ? " source-url-error" : ""}`}
        />
        <p id="source-url-help" className="text-sm text-muted-foreground">
          Open the business in Google Maps and paste its full place link.
        </p>
        {fieldErrors.sourceUrl ? (
          <FieldError id="source-url-error" message={fieldErrors.sourceUrl} />
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting}
          onClick={() => router.push("/analysis-targets")}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting} className="sm:w-36">
          {isSubmitting ? (
            <>
              <Spinner />
              Creating…
            </>
          ) : (
            "Create target"
          )}
        </Button>
      </div>
    </form>
  );
}

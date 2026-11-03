"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AnalysisTargetCreationError, createAnalysisTarget } from "@/lib/api/analysis-targets";
import {
  validateAnalysisTargetInput,
  type AnalysisTargetInputField,
  type AnalysisTargetValidationIssue,
} from "@/lib/validation/analysis-target";
import type { CreateAnalysisTarget } from "@/types/analysis-target";

interface TargetFormProps {
  createTarget?: CreateAnalysisTarget;
}

type FieldErrors = Partial<Record<AnalysisTargetInputField, string>>;

function fieldErrorsFromIssues(issues: readonly AnalysisTargetValidationIssue[]): FieldErrors {
  const errors: FieldErrors = {};

  for (const issue of issues) {
    if (issue.field && errors[issue.field] === undefined) {
      errors[issue.field] = issue.message;
    }
  }

  return errors;
}

export function TargetForm({ createTarget = createAnalysisTarget }: TargetFormProps) {
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);
  const sourceUrlRef = useRef<HTMLInputElement>(null);
  const submissionInFlight = useRef(false);
  const [name, setName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [successMessage, setSuccessMessage] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const focusFirstInvalidField = (errors: FieldErrors) => {
    if (errors.name) {
      nameRef.current?.focus();
    } else if (errors.sourceUrl) {
      sourceUrlRef.current?.focus();
    }
  };

  const updateName = (event: ChangeEvent<HTMLInputElement>) => {
    setName(event.target.value);
    setFieldErrors((current) => ({ ...current, name: undefined }));
  };

  const updateSourceUrl = (event: ChangeEvent<HTMLInputElement>) => {
    setSourceUrl(event.target.value);
    setFieldErrors((current) => ({ ...current, sourceUrl: undefined }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (submissionInFlight.current) {
      return;
    }

    setFormError(undefined);
    setSuccessMessage(undefined);

    const validation = validateAnalysisTargetInput({ name, sourceUrl });

    if (!validation.success) {
      const errors = fieldErrorsFromIssues(validation.error.issues);
      setFieldErrors(errors);
      focusFirstInvalidField(errors);
      return;
    }

    submissionInFlight.current = true;
    setIsSubmitting(true);

    try {
      const target = await createTarget(validation.data);
      setFieldErrors({});
      setSuccessMessage("Target created. You can now start ingestion.");
      router.push(`/analysis-targets/${encodeURIComponent(target.id)}?created=1`);
    } catch (error) {
      if (error instanceof AnalysisTargetCreationError) {
        if (error.code === "AUTHENTICATION_REQUIRED") {
          router.push("/login?returnTo=%2Fanalysis-targets%2Fnew");
          return;
        }

        const errors = fieldErrorsFromIssues(error.issues);
        setFieldErrors(errors);
        setFormError(error.message);
        focusFirstInvalidField(errors);
      } else {
        setFormError("We couldn't create this target. Please try again.");
      }
    } finally {
      submissionInFlight.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <form className="space-y-6" noValidate onSubmit={submit} aria-busy={isSubmitting}>
      <p className="text-sm text-muted-foreground">
        <span aria-hidden="true">*</span> Required
      </p>

      {formError ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Target not created</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      {successMessage ? (
        <Alert role="status">
          <AlertTitle>Target created</AlertTitle>
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
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
          aria-required="true"
          aria-invalid={fieldErrors.name ? "true" : "false"}
          aria-describedby={`target-name-help${fieldErrors.name ? " target-name-error" : ""}`}
        />
        <div className="flex items-start justify-between gap-4 text-sm">
          <p id="target-name-help" className="text-muted-foreground">
            Use a name you will recognize. Maximum 120 characters.
          </p>
          <span className="shrink-0 text-muted-foreground" aria-live="polite">
            {Array.from(name).length}/120
          </span>
        </div>
        {fieldErrors.name ? (
          <p id="target-name-error" className="text-sm text-destructive" role="alert">
            {fieldErrors.name}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
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

      <div className="space-y-2">
        <Label htmlFor="source-url">
          Google Maps source URL <span aria-hidden="true">*</span>
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
          aria-required="true"
          aria-invalid={fieldErrors.sourceUrl ? "true" : "false"}
          aria-describedby={`source-url-help${fieldErrors.sourceUrl ? " source-url-error" : ""}`}
        />
        <p id="source-url-help" className="text-sm text-muted-foreground">
          Open the business in Google Maps and paste its full place link.
        </p>
        {fieldErrors.sourceUrl ? (
          <p id="source-url-error" className="text-sm text-destructive" role="alert">
            {fieldErrors.sourceUrl}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={() => router.push("/analysis-targets")}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <LoaderCircle aria-hidden="true" className="animate-spin" />
              Creating target...
            </>
          ) : (
            "Create target"
          )}
        </Button>
      </div>
    </form>
  );
}

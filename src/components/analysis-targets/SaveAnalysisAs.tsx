"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type ResolverResult } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/Form";
import { ErrorAlert } from "@/components/shared/ErrorAlert";
import { Spinner } from "@/components/shared/Spinner";
import { validateAnalysisNameInput } from "@/lib/validation/analysis-target";
import { AnalysisSaveAsError, saveAnalysisAs } from "@/lib/api/analysis-targets";

const COPY_SUFFIX = " (copy)";
const MAX_NAME_CHARACTERS = 120;

/** "<name> (copy)", shortened so the suggestion is always a valid name. */
export function suggestedCopyName(name: string): string {
  const base = Array.from(name.trim())
    .slice(0, MAX_NAME_CHARACTERS - COPY_SUFFIX.length)
    .join("")
    .trimEnd();
  return `${base}${COPY_SUFFIX}`;
}

export function SaveAnalysisAs({ targetId, name }: { targetId: string; name: string }) {
  const { bfcacheId } = useRouter();
  return <SaveAsForm key={`${targetId}:${bfcacheId}`} targetId={targetId} name={name} />;
}

function SaveAsForm({ targetId, name }: { targetId: string; name: string }) {
  const router = useRouter();
  const trigger = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const request = useRef<AbortController | null>(null);
  const formId = useId();
  const helpId = useId();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const form = useForm<{ name: string }>({
    defaultValues: { name: suggestedCopyName(name) },
    resolver: (values): ResolverResult<{ name: string }> => {
      const validation = validateAnalysisNameInput(values);
      return validation.success
        ? { values: validation.data, errors: {} }
        : {
            values: {},
            errors: { name: { type: "validate", message: validation.error.issues[0]?.message } },
          };
    },
  });

  useLayoutEffect(() => {
    if (restoreFocus.current && !open && !pending) {
      trigger.current?.focus();
      restoreFocus.current = false;
    }
  }, [open, pending]);

  useLayoutEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
      restoreFocus.current = false;
      setOpen(false);
      setPending(false);
      setError(undefined);
    },
    [],
  );

  const close = () => {
    restoreFocus.current = true;
    setOpen(false);
    setError(undefined);
  };

  const submit = async (values: { name: string }) => {
    if (request.current) return;
    setError(undefined);
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    let navigating = false;
    try {
      const copy = await saveAnalysisAs(targetId, values.name, controller.signal);
      if (request.current !== controller) return;
      // Open the new analysis; the original stays exactly as it was. The form stays busy until
      // this page unmounts, so the copy cannot be submitted twice.
      navigating = true;
      router.push(`/analysis-targets/${encodeURIComponent(copy.id)}`);
    } catch (cause) {
      if (request.current !== controller) return;
      if (cause instanceof AnalysisSaveAsError) {
        if (cause.code === "AUTHENTICATION_REQUIRED") {
          router.replace(`/login?next=${encodeURIComponent(`/analysis-targets/${targetId}`)}`);
          return;
        }
        const issue = cause.issues.find((issue) => issue.field === "name");
        if (issue) {
          form.setError("name", { message: issue.message }, { shouldFocus: true });
          return;
        }
      }
      setError(
        cause instanceof AnalysisSaveAsError
          ? cause.message
          : "We couldn't save a copy of this analysis. Please try again.",
      );
    } finally {
      if (request.current === controller && !navigating) {
        request.current = null;
        setPending(false);
      }
    }
  };

  return (
    <div className="mb-6 space-y-4">
      <Button
        ref={trigger}
        type="button"
        variant="outline"
        aria-expanded={open}
        aria-controls={formId}
        disabled={pending}
        onClick={() => {
          form.reset({ name: suggestedCopyName(name) });
          setError(undefined);
          setOpen(true);
          requestAnimationFrame(() => form.setFocus("name"));
        }}
      >
        Save as new analysis
      </Button>
      {open && (
        <Card className="max-w-xl space-y-4">
          <h2 className="text-lg font-semibold">Save as new analysis</h2>
          <Form {...form}>
            <form
              id={formId}
              aria-label="Save as new analysis"
              className="space-y-4"
              noValidate
              aria-busy={pending}
              onSubmit={(event) => {
                if (request.current) {
                  event.preventDefault();
                  return;
                }
                void form.handleSubmit(submit)(event);
              }}
            >
              <p className="text-sm text-muted-foreground">* Required</p>
              {error && <ErrorAlert message={error} />}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      New analysis name <span aria-hidden="true">*</span>
                    </FormLabel>
                    <FormControl aria-describedby={helpId}>
                      <Input
                        {...field}
                        aria-required="true"
                        disabled={pending}
                        onBlur={() => {
                          field.onBlur();
                          if (form.formState.isSubmitted) void form.trigger("name");
                        }}
                      />
                    </FormControl>
                    <p id={helpId} className="text-sm text-muted-foreground">
                      Creates a separate analysis with a copy of this analysis&apos;s saved reviews
                      and ingestion summary. Q&amp;A history isn&apos;t copied. This analysis stays
                      unchanged.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" disabled={pending} onClick={close}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending} className="sm:w-36">
                  {pending ? (
                    <>
                      <Spinner />
                      Saving…
                    </>
                  ) : (
                    "Save copy"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </Card>
      )}
    </div>
  );
}

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
import { AnalysisRenameError, renameAnalysisTarget } from "@/lib/api/analysis-targets";

export function RenameAnalysis({ targetId, name }: { targetId: string; name: string }) {
  const { bfcacheId } = useRouter();
  return <RenameForm key={`${targetId}:${bfcacheId}`} targetId={targetId} name={name} />;
}

function RenameForm({ targetId, name }: { targetId: string; name: string }) {
  const router = useRouter();
  const trigger = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const request = useRef<AbortController | null>(null);
  const formId = useId();
  const helpId = useId();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState(false);
  const form = useForm<{ name: string }>({
    defaultValues: { name },
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
    // A successful save closes the form while the trigger is still disabled.
    // Restore focus after React commits the enabled button.
    if (restoreFocus.current && !editing && !pending) {
      trigger.current?.focus();
      restoreFocus.current = false;
    }
  }, [editing, pending]);

  useLayoutEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
      restoreFocus.current = false;
      setEditing(false);
      setPending(false);
      setSuccess(false);
      setError(undefined);
    },
    [],
  );

  const close = () => {
    restoreFocus.current = true;
    setEditing(false);
    setError(undefined);
  };

  const submit = async (values: { name: string }) => {
    if (request.current) return;
    setSuccess(false);
    setError(undefined);
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    try {
      await renameAnalysisTarget(targetId, values.name, controller.signal);
      if (request.current !== controller) return;
      close();
      setSuccess(true);
      router.refresh();
    } catch (cause) {
      if (request.current !== controller) return;
      if (cause instanceof AnalysisRenameError) {
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
        cause instanceof AnalysisRenameError
          ? cause.message
          : "We couldn't rename this analysis. Please try again.",
      );
    } finally {
      if (request.current === controller) {
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
        aria-expanded={editing}
        aria-controls={formId}
        disabled={pending}
        onClick={() => {
          form.reset({ name });
          setError(undefined);
          setSuccess(false);
          setEditing(true);
          requestAnimationFrame(() => form.setFocus("name"));
        }}
      >
        Rename analysis
      </Button>
      {success && (
        <p role="status" className="text-sm">
          Analysis renamed.
        </p>
      )}
      {editing && (
        <Card className="max-w-xl space-y-4">
          <h2 className="text-lg font-semibold">Rename analysis</h2>
          <Form {...form}>
            <form
              id={formId}
              aria-label="Rename analysis"
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
                      Analysis name <span aria-hidden="true">*</span>
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
                      Choose a name up to 120 characters. Leading and trailing whitespace is
                      removed. Your source, saved reviews, and Q&amp;A stay the same.
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
                      Renaming…
                    </>
                  ) : (
                    "Save name"
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

"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/Form";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/Alert";
import { Spinner } from "@/components/shared/Spinner";
import {
  askReviewQuestion,
  ReviewQuestionError,
  type ReviewAnswer,
} from "@/lib/api/review-questions";
import { reviewQuestionSchema } from "@/lib/validation/review-question";

type Props = {
  targetId: string;
  targetName: string;
  reviewsAvailable: boolean;
};

const outcomeLabels = {
  answered: "ReviewLens response",
  insufficient_evidence: "Insufficient review evidence",
  out_of_scope: "Outside the active reviews",
};

export function ReviewQuestions(props: Props) {
  const { bfcacheId } = useRouter();
  // A new target or navigation restores a fresh form, never another target's answer.
  return (
    <QuestionForm key={`${props.targetId}:${bfcacheId}:${props.reviewsAvailable}`} {...props} />
  );
}

function QuestionForm({ targetId, targetName, reviewsAvailable }: Props) {
  const router = useRouter();
  const questionHelpId = useId();
  const request = useRef<AbortController | null>(null);
  const [answer, setAnswer] = useState<ReviewAnswer | null>(null);
  const [answeredQuestion, setAnsweredQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const form = useForm<{ question: string }>({
    resolver: zodResolver(reviewQuestionSchema),
    defaultValues: { question: "" },
  });

  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
    },
    [],
  );

  const submit = async ({ question }: { question: string }) => {
    if (request.current || !reviewsAvailable) return;
    const controller = new AbortController();
    request.current = controller;
    // The provider now has separate 30s counting and generation deadlines.
    const timeout = setTimeout(() => controller.abort(), 75_000);
    setAnswer(null);
    setError(null);
    try {
      const result = await askReviewQuestion(targetId, question, controller.signal);
      if (controller.signal.aborted) return;
      setAnsweredQuestion(question);
      setAnswer(result);
    } catch (cause) {
      // Unmount aborts must not affect the newly selected workspace.
      if (request.current !== controller) return;
      if (cause instanceof ReviewQuestionError && cause.fieldErrors?.question) {
        form.setError(
          "question",
          { type: "server", message: cause.fieldErrors.question },
          { shouldFocus: true },
        );
        return;
      }
      if (cause instanceof ReviewQuestionError && cause.code === "AUTHENTICATION_REQUIRED") {
        router.replace(`/login?next=${encodeURIComponent(`/analysis-targets/${targetId}`)}`);
      }
      setError(
        cause instanceof ReviewQuestionError
          ? cause.message
          : "We couldn't answer your question. Please try again.",
      );
    } finally {
      clearTimeout(timeout);
      request.current = null;
    }
  };

  return (
    <Card className="space-y-4" aria-label="Review questions">
      <h2 className="text-xl font-semibold">Ask ReviewLens</h2>
      <p id={questionHelpId} className="max-w-prose break-words text-sm text-muted-foreground">
        Active target: <span className="font-medium text-foreground">{targetName}</span> · Google
        Maps. Ask questions about this target&apos;s saved reviews.
      </p>
      {!reviewsAvailable && (
        <p className="text-sm text-muted-foreground">
          Saved reviews must be available before you can ask questions. Complete ingestion or retry
          loading the reviews.
        </p>
      )}
      <Form {...form}>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => void form.handleSubmit(submit)(event)}
          aria-busy={form.formState.isSubmitting}
        >
          <p className="text-sm text-muted-foreground">* Required</p>
          <FormField
            control={form.control}
            name="question"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Question <span aria-hidden="true">*</span>
                </FormLabel>
                <FormControl aria-describedby={questionHelpId}>
                  <Input
                    {...field}
                    aria-required="true"
                    disabled={!reviewsAvailable}
                    readOnly={form.formState.isSubmitting}
                    placeholder="What do reviewers like about this business?"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {error && (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>Question not answered</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex justify-end">
            <Button
              type="submit"
              className="w-40"
              disabled={!reviewsAvailable || form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? (
                <>
                  <Spinner /> Asking…
                </>
              ) : (
                "Ask question"
              )}
            </Button>
          </div>
        </form>
      </Form>
      <div role="status" aria-live="polite" aria-atomic="true" className="space-y-3">
        {form.formState.isSubmitting && (
          <p className="break-words text-sm text-muted-foreground">
            ReviewLens is processing your question for {targetName}…
          </p>
        )}
        {answer && !form.formState.isSubmitting && (
          <>
            <h3 className="text-lg font-medium">{outcomeLabels[answer.outcome]}</h3>
            <p className="max-w-prose break-words text-sm text-muted-foreground">
              Question: {answeredQuestion}
            </p>
            <p className="max-w-prose whitespace-pre-wrap break-words">{answer.answer}</p>
          </>
        )}
      </div>
    </Card>
  );
}

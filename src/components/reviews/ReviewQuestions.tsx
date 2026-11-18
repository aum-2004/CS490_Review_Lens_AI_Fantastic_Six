"use client";

import { useLayoutEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
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
import { buildCitationView, type CitableReview } from "@/lib/qa/citations";
import { SupportingReviews } from "./SupportingReviews";

type Props = {
  userId: string;
  targetId: string;
  targetName: string;
  reviewsAvailable: boolean;
  unavailableMessage?: string;
  /** The active target's already-loaded reviews, used only to label citations. */
  reviews?: readonly CitableReview[];
};

const outcomeLabels = {
  answered: "ReviewLens response",
  insufficient_evidence: "Insufficient review evidence",
  out_of_scope: "Outside the active reviews",
};

export function ReviewQuestions(props: Props) {
  const { bfcacheId } = useRouter();
  // Scope state to the verified account as well as the target and navigation.
  // Back/forward restores bfcacheId; Activity cleanup below handles that transition.
  return (
    <QuestionForm
      key={`${props.userId}:${props.targetId}:${bfcacheId}:${props.reviewsAvailable}`}
      {...props}
    />
  );
}

function QuestionForm({
  targetId,
  targetName,
  reviewsAvailable,
  reviews = [],
  unavailableMessage = "No saved reviews are available for this target. Complete ingestion in the Ingestion panel before asking ReviewLens questions.",
}: Props) {
  const router = useRouter();
  const questionHelpId = useId();
  const questionKeyboardHelpId = useId();
  const unavailableHelpId = useId();
  const questionDescription = reviewsAvailable
    ? `${questionHelpId} ${questionKeyboardHelpId}`
    : `${questionHelpId} ${questionKeyboardHelpId} ${unavailableHelpId}`;
  const request = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [answer, setAnswer] = useState<ReviewAnswer | null>(null);
  const [answeredQuestion, setAnsweredQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const form = useForm<{ question: string }>({
    resolver: zodResolver(reviewQuestionSchema),
    defaultValues: { question: "" },
  });

  // Never render a response for any target other than the active one.
  const view =
    answer && answer.targetId === targetId
      ? buildCitationView(targetId, answer.answer, answer.citedReviewIds, reviews)
      : null;

  const { reset } = form;
  useLayoutEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
      // Activity preserves hidden pages; clear all transient Q&A state before restoration.
      setAnswer(null);
      setAnsweredQuestion("");
      setError(null);
      setPending(false);
      reset({ question: "" });
    },
    [reset],
  );

  const submit = async ({ question }: { question: string }) => {
    if (request.current || !reviewsAvailable) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    // The provider now has separate 30s counting and generation deadlines.
    const timeout = setTimeout(() => controller.abort(), 75_000);
    setAnswer(null);
    setError(null);
    try {
      const result = await askReviewQuestion(targetId, question, controller.signal);
      if (controller.signal.aborted || request.current !== controller) return;
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
      // Old requests must not clear a newer request after Activity restoration.
      if (request.current === controller) {
        request.current = null;
        setPending(false);
      }
    }
  };

  return (
    <Card className="space-y-4" aria-label="Review questions">
      <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-muted-foreground">
        Review intelligence
      </p>
      <h2 className="text-lg font-semibold">Ask ReviewLens</h2>
      <p className="rounded-lg bg-accent px-3 py-3 text-xs text-accent-foreground">
        Questions are answered only from this target&apos;s saved Google Maps reviews.
      </p>
      <p id={questionHelpId} className="max-w-prose break-words text-sm text-muted-foreground">
        Active target: <span className="font-medium text-foreground">{targetName}</span> · Google
        Maps. Ask questions about this target&apos;s saved reviews. Each account can make five
        attempts within 24 hours. Failed answer-service attempts also count.
      </p>
      {!reviewsAvailable && (
        <Alert role="status">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Review questions unavailable</AlertTitle>
          <AlertDescription id={unavailableHelpId}>{unavailableMessage}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        {["What stands out?", "What do customers praise?", "What could be improved?"].map(
          (question) => (
            <Button
              key={question}
              variant="outline"
              disabled={!reviewsAvailable || pending}
              onClick={() => {
                form.setValue("question", question, { shouldValidate: true });
                form.setFocus("question");
              }}
            >
              {question}
            </Button>
          ),
        )}
      </div>
      <Form {...form}>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => void form.handleSubmit(submit)(event)}
          aria-busy={pending}
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
                <FormControl aria-describedby={questionDescription}>
                  <Textarea
                    {...field}
                    aria-required="true"
                    disabled={!reviewsAvailable}
                    readOnly={pending}
                    placeholder="What do reviewers like about this business?"
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing)
                        return;
                      event.preventDefault();
                      if (reviewsAvailable && !pending) event.currentTarget.form?.requestSubmit();
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <p id={questionKeyboardHelpId} className="text-xs text-muted-foreground">
            Enter to ask. Shift+Enter for a new line.
          </p>
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
              disabled={!reviewsAvailable || pending}
              aria-describedby={reviewsAvailable ? undefined : unavailableHelpId}
            >
              {pending ? (
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
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="space-y-3 border-l-2 border-primary pl-4"
      >
        {pending && (
          <p className="break-words text-sm text-muted-foreground">
            ReviewLens is processing your question for {targetName}…
          </p>
        )}
        {answer && view && !pending && (
          <>
            <h3 className="text-lg font-medium">{outcomeLabels[answer.outcome]}</h3>
            <p className="max-w-prose break-words text-sm text-muted-foreground">
              Question: {answeredQuestion}
            </p>
            <p className="max-w-prose whitespace-pre-wrap break-words">{view.text}</p>
            {answer.outcome === "answered" && <SupportingReviews citations={view.citations} />}
          </>
        )}
      </div>
    </Card>
  );
}

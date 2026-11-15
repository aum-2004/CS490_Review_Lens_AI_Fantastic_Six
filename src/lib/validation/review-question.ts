import { z } from "zod";

export const QUESTION_REQUIRED_MESSAGE = "Enter a question about this target's reviews.";
export const QUESTION_LENGTH_MESSAGE = "Questions can be up to 2,000 characters.";

// Strip browser owner/evidence claims; only the validated question is consumed.
export const reviewQuestionSchema = z.object({
  question: z.string().trim().min(1, QUESTION_REQUIRED_MESSAGE).max(2000, QUESTION_LENGTH_MESSAGE),
});

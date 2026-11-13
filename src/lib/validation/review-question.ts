import { z } from "zod";

// Strip browser owner/evidence claims; only the validated question is consumed.
export const reviewQuestionSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, "Enter a question about this target's reviews.")
    .max(2000, "Questions can be up to 2,000 characters."),
});

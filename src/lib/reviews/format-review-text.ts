/** Converts HTML line-break markers to newlines while leaving all other text untouched. */
export function formatReviewText(text: string): string {
  return text.replace(/<br\s*\/?>/gi, "\n");
}

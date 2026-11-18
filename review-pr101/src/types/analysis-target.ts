import type {
  SupportedReviewPlatform,
  ValidatedAnalysisTargetInput,
} from "@/lib/validation/analysis-target";

export interface AnalysisTarget {
  id: string;
  name: string;
  sourceUrl: string;
  platform: SupportedReviewPlatform;
}

export type CreateAnalysisTarget = (input: ValidatedAnalysisTargetInput) => Promise<AnalysisTarget>;

import type { AnalysisTarget } from "@/services/analysis-targets/analysis-target-repository";
import type { Review } from "@/services/reviews/review-service";

import type { QaActor } from "../../helpers/qa-harness/contract";
import { scopeGuardEvaluationFixture } from "../scope-guard-evaluation";

/**
 * S2-003 synthetic Q&A datasets. Fixed IDs, timestamps, and ordering; no randomness or clock
 * reads. Everything is deep-frozen so no test can leak changes into another.
 *
 * Distinctive markers make leakage detectable: a dataset's markers, review IDs, review text, and
 * target ID must never appear in a model request built for a different dataset.
 */

export const QA_USERS = {
  /** Owns every dataset except `userBPrivate`; same owner ID as the S2-004 Restaurant A target. */
  userA: { id: scopeGuardEvaluationFixture.activeTarget.ownerId, email: "qa-user-a@example.test" },
  userB: { id: "00000000-0000-4000-8000-0000000000b2", email: "qa-user-b@example.test" },
} as const satisfies Record<string, QaActor>;

export type QaUserKey = keyof typeof QA_USERS;

export const QA_DATASET_KEYS = [
  "restaurantA",
  "mixedRatings",
  "targetA",
  "targetB",
  "userBPrivate",
  "emptyTarget",
  "malformedRows",
] as const;

export type QaDatasetKey = (typeof QA_DATASET_KEYS)[number];

export interface QaFixtureDataset {
  readonly key: QaDatasetKey;
  readonly owner: QaActor;
  readonly target: Readonly<AnalysisTarget>;
  readonly reviews: readonly Readonly<Review>[];
  /** Distinctive strings that must never reach a model request for any other dataset. */
  readonly markers: readonly string[];
  readonly description: string;
}

/** An ID that no dataset uses; requests for it must be denied like a foreign target. */
export const QA_MISSING_TARGET_ID = "10000000-0000-4000-8000-0000000000ff";

const CREATED_AT = "2026-11-01T12:00:00.000Z";

function target(id: string, owner: QaActor, name: string): AnalysisTarget {
  return {
    id,
    ownerId: owner.id,
    name,
    platform: "google_maps",
    sourceUrl: `https://www.google.com/maps/place/${encodeURIComponent(name)}`,
    googlePlaceId: null,
    createdAt: CREATED_AT,
  };
}

function review(
  id: string,
  analysisTargetId: string,
  rating: number,
  text: string,
  day: number,
): Review {
  const dd = String(day).padStart(2, "0");
  return {
    id,
    analysisTargetId,
    text,
    rating,
    sourceReviewId: `synthetic-${id.slice(0, 8)}-${dd}`,
    // Present on purpose: reviewer names must never reach the model (S2-013 data minimisation).
    reviewerName: `QA_REVIEWER_NAME_${id.slice(0, 2)}_${dd}`,
    reviewDate: `2026-10-${dd}T18:00:00.000Z`,
    reviewUrl: null,
    sourceMetadata: { syntheticDataset: "s2-003" },
    createdAt: `2026-10-${dd}T19:00:00.000Z`,
  };
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const { userA, userB } = QA_USERS;

const ids = {
  mixedRatings: "10000000-0000-4000-8000-000000000002",
  targetA: "10000000-0000-4000-8000-00000000000a",
  targetB: "10000000-0000-4000-8000-00000000000b",
  userBPrivate: "10000000-0000-4000-8000-0000000000b1",
  emptyTarget: "10000000-0000-4000-8000-0000000000e0",
  malformedRows: "10000000-0000-4000-8000-0000000000e1",
} as const;

const datasets: Record<QaDatasetKey, QaFixtureDataset> = {
  restaurantA: {
    key: "restaurantA",
    owner: userA,
    // Cloned so freezing this dataset never changes the S2-004 fixture objects themselves.
    target: structuredClone(scopeGuardEvaluationFixture.activeTarget),
    reviews: structuredClone(scopeGuardEvaluationFixture.persistedReviews),
    markers: [],
    description: "Normal dataset. The S2-004 scope-guard target and its four reviews, unchanged.",
  },
  mixedRatings: {
    key: "mixedRatings",
    owner: userA,
    target: target(ids.mixedRatings, userA, "Mixed Ratings Coffee"),
    reviews: [
      review(
        "21000000-0000-4000-8000-000000000001",
        ids.mixedRatings,
        1,
        "Cold espresso and a forty-minute wait. QA_MIXED_RATINGS_MARKER",
        1,
      ),
      review(
        "21000000-0000-4000-8000-000000000002",
        ids.mixedRatings,
        2,
        "Croissant was stale but the barista apologized.",
        2,
      ),
      review(
        "21000000-0000-4000-8000-000000000003",
        ids.mixedRatings,
        3,
        "Average latte, comfortable seating near the window.",
        3,
      ),
      review(
        "21000000-0000-4000-8000-000000000004",
        ids.mixedRatings,
        4,
        "Friendly staff and a good oat milk cortado.",
        4,
      ),
      review(
        "21000000-0000-4000-8000-000000000005",
        ids.mixedRatings,
        5,
        "Best pour-over in the neighborhood, fast service.",
        5,
      ),
    ],
    markers: ["QA_MIXED_RATINGS_MARKER"],
    description: "One review at each rating from 1 to 5.",
  },
  targetA: {
    key: "targetA",
    owner: userA,
    target: target(ids.targetA, userA, "Volt Phone Store"),
    reviews: [
      review(
        "2a000000-0000-4000-8000-000000000001",
        ids.targetA,
        5,
        "Battery life lasts two full days. QA_TARGET_A_BATTERY_MARKER",
        6,
      ),
      review(
        "2a000000-0000-4000-8000-000000000002",
        ids.targetA,
        2,
        "Battery life dropped badly after a month.",
        7,
      ),
      review(
        "2a000000-0000-4000-8000-000000000003",
        ids.targetA,
        4,
        "Good battery life, but the charger is slow.",
        8,
      ),
    ],
    markers: ["QA_TARGET_A_BATTERY_MARKER"],
    description: "S2-018 Target A: reviews repeatedly mention battery life.",
  },
  targetB: {
    key: "targetB",
    owner: userA,
    target: target(ids.targetB, userA, "Harbor Bike Repair"),
    reviews: [
      review(
        "2b000000-0000-4000-8000-000000000001",
        ids.targetB,
        5,
        "Customer service called me back within an hour. QA_TARGET_B_SERVICE_MARKER",
        9,
      ),
      review(
        "2b000000-0000-4000-8000-000000000002",
        ids.targetB,
        1,
        "Customer service never answered my emails.",
        10,
      ),
    ],
    markers: ["QA_TARGET_B_SERVICE_MARKER"],
    description: "S2-018 Target B (same owner as Target A): reviews mention customer service.",
  },
  userBPrivate: {
    key: "userBPrivate",
    owner: userB,
    target: target(ids.userBPrivate, userB, "User B Private Bakery"),
    reviews: [
      review(
        "2c000000-0000-4000-8000-000000000001",
        ids.userBPrivate,
        5,
        "The sourdough is the best I have had. QA_USER_B_PRIVATE_MARKER",
        11,
      ),
      review(
        "2c000000-0000-4000-8000-000000000002",
        ids.userBPrivate,
        3,
        "Long line on Saturday mornings.",
        12,
      ),
    ],
    markers: ["QA_USER_B_PRIVATE_MARKER"],
    description: "S2-016: owned by User B; must never reach a request made by User A.",
  },
  emptyTarget: {
    key: "emptyTarget",
    owner: userA,
    target: target(ids.emptyTarget, userA, "Empty Target Diner"),
    reviews: [],
    markers: [],
    description: "S2-020: a target with no persisted reviews.",
  },
  malformedRows: {
    key: "malformedRows",
    owner: userA,
    target: target(ids.malformedRows, userA, "Malformed Rows Grill"),
    reviews: [
      review(
        "2e000000-0000-4000-8000-000000000001",
        ids.malformedRows,
        4,
        "Solid burgers. QA_MALFORMED_ROWS_MARKER",
        13,
      ),
      // Duplicate ID, blank text, and out-of-range rating: S2-010 must fail closed, not skip rows.
      review(
        "2e000000-0000-4000-8000-000000000001",
        ids.malformedRows,
        4,
        "Duplicate of the first row.",
        14,
      ),
      review("2e000000-0000-4000-8000-000000000003", ids.malformedRows, 3, "   ", 15),
      review(
        "2e000000-0000-4000-8000-000000000004",
        ids.malformedRows,
        0,
        "Rating outside 1-5.",
        16,
      ),
    ],
    markers: ["QA_MALFORMED_ROWS_MARKER"],
    description: "Duplicate and invalid persisted rows; context building must fail closed.",
  },
};

export const QA_DATASETS: Readonly<Record<QaDatasetKey, QaFixtureDataset>> = deepFreeze(datasets);

export function getQaDataset(key: QaDatasetKey): QaFixtureDataset {
  return QA_DATASETS[key];
}

export function allQaDatasets(): readonly QaFixtureDataset[] {
  return QA_DATASET_KEYS.map(getQaDataset);
}

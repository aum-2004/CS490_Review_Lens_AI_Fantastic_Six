"use client";

import { useLayoutEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** One user-started request, as handed out by `useLatestRequest`. */
export type LatestRequest = {
  signal: AbortSignal;
  /** True only while this is the newest request of the scope that is still current and visible. */
  current: () => boolean;
  /** For `finally`: true when this request still owns its slot, so it may clear its pending state. */
  release: () => boolean;
};

/**
 * S3-009: guards an ingestion request against late responses. A response can arrive after the user
 * left the workspace (unmount or Activity hide) or after the account or target (`scope`) changed;
 * only the newest request of the current, visible scope may navigate, update shared state, or
 * clear its own pending state.
 *
 * Leaving aborts only the browser request. The ingestion attempt and any paid provider job keep
 * running server-side; nothing is cancelled and no cancel request exists. When the same scope is
 * shown again after a request was abandoned, the persisted status is reloaded (router.refresh),
 * since the server may have started the run anyway. `onLeave(abandoned)` runs on every cleanup.
 *
 * Returns `begin()`: a new request, or null while one is already in flight.
 */
export function useLatestRequest(scope: string, onLeave: (abandoned: boolean) => void) {
  const router = useRouter();
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const activeScope = useRef<string | null>(null);
  const resyncScope = useRef<string | null>(null);
  const routerRef = useRef(router);
  const onLeaveRef = useRef(onLeave);
  useLayoutEffect(() => {
    routerRef.current = router;
    onLeaveRef.current = onLeave;
  });
  useLayoutEffect(() => {
    activeScope.current = scope;
    if (resyncScope.current === scope) {
      resyncScope.current = null;
      routerRef.current.refresh();
    }
    return () => {
      generation.current += 1;
      activeScope.current = null;
      const abandoned = request.current;
      request.current = null;
      if (abandoned) {
        abandoned.abort();
        resyncScope.current = scope;
      }
      onLeaveRef.current(!!abandoned);
    };
  }, [scope]);

  return function begin(): LatestRequest | null {
    if (request.current) return null;
    const controller = new AbortController();
    const requestGeneration = ++generation.current;
    const requestScope = scope;
    request.current = controller;
    return {
      signal: controller.signal,
      current: () =>
        !controller.signal.aborted &&
        generation.current === requestGeneration &&
        activeScope.current === requestScope,
      release: () => {
        // Cleanup already reset a stale request; never clear a newer request's pending state.
        if (request.current !== controller) return false;
        request.current = null;
        return true;
      },
    };
  };
}

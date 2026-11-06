import { Suspense } from "react";
import { HomeDestination } from "@/components/shared/HomeDestination";

export default function Home() {
  return (
    <Suspense
      fallback={
        <p role="status" className="p-8 text-muted-foreground">
          Loading ReviewLens…
        </p>
      }
    >
      <HomeDestination />
    </Suspense>
  );
}

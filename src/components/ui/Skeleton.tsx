import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("rounded-md bg-muted motion-safe:animate-pulse", className)} {...props} />
  );
}

import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { ErrorAlert } from "./ErrorAlert";

export function ErrorState({ message, actions }: { message: string; actions?: ReactNode }) {
  return (
    <Card className="space-y-4">
      <ErrorAlert message={message} />
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </Card>
  );
}

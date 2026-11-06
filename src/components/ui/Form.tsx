"use client";

import * as React from "react";
import { Slot } from "radix-ui";
import {
  Controller,
  FormProvider,
  useFormContext,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { Label } from "@/components/ui/Label";
import { cn } from "@/lib/utils/cn";

// shadcn/ui's Form pattern: provider + controller + accessible field composition.
export const Form = FormProvider;
const FieldContext = React.createContext<string | null>(null);
const ItemContext = React.createContext<string | null>(null);

export function FormField<TValues extends FieldValues, TName extends FieldPath<TValues>>(
  props: ControllerProps<TValues, TName>,
) {
  return (
    <FieldContext.Provider value={props.name}>
      <Controller {...props} />
    </FieldContext.Provider>
  );
}

function useField() {
  const name = React.useContext(FieldContext);
  const id = React.useContext(ItemContext);
  const { getFieldState, formState } = useFormContext();
  if (!name || !id) throw new Error("Form controls must be inside FormField and FormItem.");
  return { id, error: getFieldState(name, formState).error };
}

export function FormItem({ className, ...props }: React.ComponentProps<"div">) {
  const id = React.useId();
  return (
    <ItemContext.Provider value={id}>
      <div className={cn("space-y-1.5", className)} {...props} />
    </ItemContext.Provider>
  );
}

export function FormLabel(props: React.ComponentProps<typeof Label>) {
  const { id } = useField();
  return <Label htmlFor={`${id}-control`} {...props} />;
}

export function FormControl(props: React.ComponentProps<typeof Slot.Root>) {
  const { id, error } = useField();
  return (
    <Slot.Root
      id={`${id}-control`}
      aria-describedby={error ? `${id}-message` : undefined}
      aria-invalid={!!error}
      {...props}
    />
  );
}

export function FormMessage() {
  const { id, error } = useField();
  if (!error?.message) return null;
  return (
    <p id={`${id}-message`} role="alert" className="text-sm text-destructive">
      <span aria-hidden="true">⚠ </span>
      {String(error.message)}
    </p>
  );
}

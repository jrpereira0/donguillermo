import * as React from "react";
import { cn } from "@/lib/utils";

/** Campo de texto de várias linhas no padrão dos campos (`.field-luxe`). */
export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "field-luxe min-h-24 w-full min-w-0 resize-y rounded-lg border border-input bg-surface px-3 py-2.5 text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

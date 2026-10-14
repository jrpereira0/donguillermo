import { cn } from "@/lib/utils";

type Props = {
  tone: "error" | "success" | "info";
  children: React.ReactNode;
  className?: string;
};

/** Aviso de formulário. `error` usa role="alert" (leitores de tela anunciam na hora). */
export function FormAlert({ tone, children, className }: Props) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-lg border px-3 py-2.5 text-sm",
        tone === "error" && "shake border-destructive/50 bg-destructive/10 text-destructive",
        tone === "success" && "border-success/50 bg-success/10 text-success",
        tone === "info" && "border-border bg-surface-2 text-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-destructive">
      {message}
    </p>
  );
}

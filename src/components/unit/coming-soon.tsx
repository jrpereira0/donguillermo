import { Hourglass } from "lucide-react";
import { LuxeFrame } from "@/components/ui/luxe-frame";
import { PageHeader } from "./page-header";

/** Página de módulo que ainda será construído. */
export function ComingSoon({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow={eyebrow} title={title} />
      <LuxeFrame className="reveal" style={{ "--d": "150ms" } as React.CSSProperties} contentClassName="flex items-center gap-4 p-6">
        <Hourglass className="size-5 text-gold" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Este módulo será construído nas próximas etapas.</p>
      </LuxeFrame>
    </div>
  );
}

import { BrandMark } from "@/components/brand/brand-mark";

/** Layout compartilhado das telas de acesso (login, recuperação, nova senha). */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-6 py-12">
      <header className="flex justify-center">
        <BrandMark />
      </header>
      <div className="rounded-xl border border-border bg-card p-6 shadow-lg shadow-black/30 sm:p-8">
        {children}
      </div>
    </main>
  );
}

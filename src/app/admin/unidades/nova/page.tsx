import type { Metadata } from "next";
import Link from "next/link";
import { UnitForm } from "@/components/admin/unit-form";
import { requireNetworkAdmin } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Nova unidade" };
export const instant = false;

export default async function NewUnitPage() {
  await requireNetworkAdmin();
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <Link href="/admin" className="label-caps hover:text-foreground">
          ← Unidades
        </Link>
        <h1 className="mt-2 text-3xl">Nova unidade</h1>
      </div>
      <UnitForm mode="create" />
    </div>
  );
}

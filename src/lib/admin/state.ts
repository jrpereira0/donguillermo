import type { FormState } from "@/lib/validation/auth";

/** Estado das actions do admin. */
export type AdminFormState = FormState & {
  createdSlug?: string;
};

export const initialAdminState: AdminFormState = { status: "idle" };

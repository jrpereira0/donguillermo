import { connection, NextResponse } from "next/server";
import { checkSupabase } from "@/lib/supabase/health";

/** GET /api/health — verificação de saúde da aplicação e do Supabase. */
export async function GET() {
  await connection(); // nunca pré-renderizar: sempre checa ao vivo
  const supabase = await checkSupabase();
  const ok = supabase.state === "connected";
  return NextResponse.json(
    {
      data: { app: "ok", supabase },
      meta: { checkedAt: new Date().toISOString() },
    },
    { status: ok ? 200 : 503 },
  );
}

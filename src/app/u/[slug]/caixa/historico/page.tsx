import { redirect } from "next/navigation";

export const instant = false;

/** A lista de fechamentos mora na página do Caixa (aba Histórico). Mantido para endereços antigos. */
export default async function CaixaHistoricoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/u/${slug}/caixa?aba=historico`);
}

import { describe, expect, it } from "vitest";
import type { Membership } from "@/lib/auth/roles";
import { navItemsFor } from "./nav";

const A = { id: "a", slug: "un-a", name: "A" };
const admin: Membership = { role: "admin_rede", unit: null };
const recepA: Membership = { role: "recepcao", unit: A };
const barbA: Membership = { role: "barbeiro", unit: A };

const labels = (m: Membership[], slug: string) => navItemsFor(m, slug).map((i) => i.label);

describe("navItemsFor", () => {
  it("recepção vê as 9 áreas da recepção, na ordem do dia a dia", () => {
    expect(labels([recepA], "un-a")).toEqual([
      "Agenda",
      "Caixa",
      "Comissões",
      "Clientes",
      "Profissionais",
      "Serviços",
      "Produtos",
      "Pacotes",
      "Configurações",
    ]);
  });
  it("admin da rede vê o mesmo menu em qualquer unidade (sem Minha agenda)", () => {
    expect(labels([admin], "qualquer")).toHaveLength(9);
    expect(labels([admin], "qualquer")).not.toContain("Minha agenda");
  });
  it("barbeiro vê só Minha agenda", () => {
    expect(labels([barbA], "un-a")).toEqual(["Minha agenda"]);
  });
  it("sem vínculo na unidade não vê nada", () => {
    expect(labels([recepA], "outra")).toEqual([]);
  });
  it("links apontam para /u/<slug>/<área>", () => {
    expect(navItemsFor([recepA], "un-a")[1]!.href).toBe("/u/un-a/caixa");
    expect(navItemsFor([recepA], "un-a")[2]!.href).toBe("/u/un-a/comissoes");
    expect(navItemsFor([recepA], "un-a")[3]!.href).toBe("/u/un-a/clientes");
  });
  it("itens vêm agrupados: Operação, Cadastros, Catálogo, Unidade", () => {
    expect(navItemsFor([recepA], "un-a").map((i) => i.group)).toEqual([
      "Operação",
      "Operação",
      "Operação",
      "Cadastros",
      "Cadastros",
      "Catálogo",
      "Catálogo",
      "Catálogo",
      "Unidade",
    ]);
  });
});

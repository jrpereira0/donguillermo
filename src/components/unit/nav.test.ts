import { describe, expect, it } from "vitest";
import type { Membership } from "@/lib/auth/roles";
import { navItemsFor } from "./nav";

const A = { id: "a", slug: "un-a", name: "A" };
const admin: Membership = { role: "admin_rede", unit: null };
const recepA: Membership = { role: "recepcao", unit: A };
const barbA: Membership = { role: "barbeiro", unit: A };

const labels = (m: Membership[], slug: string) => navItemsFor(m, slug).map((i) => i.label);

describe("navItemsFor", () => {
  it("recepção vê as 6 áreas da recepção", () => {
    expect(labels([recepA], "un-a")).toEqual([
      "Agenda",
      "Profissionais",
      "Serviços",
      "Produtos",
      "Caixa",
      "Configurações",
    ]);
  });
  it("admin da rede vê o mesmo menu em qualquer unidade (sem Minha agenda)", () => {
    expect(labels([admin], "qualquer")).toHaveLength(6);
    expect(labels([admin], "qualquer")).not.toContain("Minha agenda");
  });
  it("barbeiro vê só Minha agenda", () => {
    expect(labels([barbA], "un-a")).toEqual(["Minha agenda"]);
  });
  it("sem vínculo na unidade não vê nada", () => {
    expect(labels([recepA], "outra")).toEqual([]);
  });
  it("links apontam para /u/<slug>/<área>", () => {
    expect(navItemsFor([recepA], "un-a")[1]!.href).toBe("/u/un-a/profissionais");
  });
});

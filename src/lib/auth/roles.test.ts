import { describe, expect, it } from "vitest";
import {
  canAccessUnitArea,
  canSeeUnit,
  destinationsFor,
  resolveHome,
  type Membership,
} from "./roles";

const A = { id: "a", slug: "sao-bernardo-metropole", name: "São Bernardo - Shopping Metrópole" };
const B = { id: "b", slug: "outra-unidade", name: "Outra" };

const admin: Membership = { role: "admin_rede", unit: null };
const recepA: Membership = { role: "recepcao", unit: A };
const barbA: Membership = { role: "barbeiro", unit: A };
const barbB: Membership = { role: "barbeiro", unit: B };

describe("resolveHome", () => {
  it("sem vínculo -> none", () => {
    expect(resolveHome([])).toEqual({ kind: "none" });
  });
  it("admin -> /admin", () => {
    expect(resolveHome([admin])).toEqual({ kind: "single", href: "/admin" });
  });
  it("recepção -> agenda da unidade", () => {
    expect(resolveHome([recepA])).toEqual({
      kind: "single",
      href: "/u/sao-bernardo-metropole/agenda",
    });
  });
  it("barbeiro -> minha-agenda da unidade", () => {
    expect(resolveHome([barbA])).toEqual({
      kind: "single",
      href: "/u/sao-bernardo-metropole/minha-agenda",
    });
  });
  it("mais de um destino -> escolher", () => {
    expect(resolveHome([barbA, barbB])).toEqual({ kind: "choose" });
    expect(resolveHome([recepA, barbA])).toEqual({ kind: "choose" });
    expect(resolveHome([admin, recepA])).toEqual({ kind: "choose" });
  });
  it("vínculo sem unidade (inconsistente) é ignorado", () => {
    expect(resolveHome([{ role: "recepcao", unit: null }])).toEqual({ kind: "none" });
  });
  it("vínculos duplicados não geram escolha", () => {
    expect(resolveHome([recepA, recepA])).toEqual({
      kind: "single",
      href: "/u/sao-bernardo-metropole/agenda",
    });
  });
});

describe("destinationsFor", () => {
  it("ordena admin, recepção, barbeiro", () => {
    const roles = destinationsFor([barbA, recepA, admin]).map((d) => d.role);
    expect(roles).toEqual(["admin_rede", "recepcao", "barbeiro"]);
  });
});

describe("canAccessUnitArea", () => {
  it("recepção entra na agenda da sua unidade", () => {
    expect(canAccessUnitArea([recepA], A.slug, "agenda")).toBe(true);
  });
  it("recepção NÃO entra na agenda de outra unidade", () => {
    expect(canAccessUnitArea([recepA], B.slug, "agenda")).toBe(false);
  });
  it("recepção NÃO entra na área do barbeiro", () => {
    expect(canAccessUnitArea([recepA], A.slug, "minha-agenda")).toBe(false);
  });
  it("barbeiro NÃO entra na agenda da recepção", () => {
    expect(canAccessUnitArea([barbA], A.slug, "agenda")).toBe(false);
  });
  it("barbeiro entra na própria área, só na sua unidade", () => {
    expect(canAccessUnitArea([barbA], A.slug, "minha-agenda")).toBe(true);
    expect(canAccessUnitArea([barbA], B.slug, "minha-agenda")).toBe(false);
  });
  it("admin_rede entra em qualquer unidade", () => {
    expect(canAccessUnitArea([admin], B.slug, "agenda")).toBe(true);
    expect(canAccessUnitArea([admin], B.slug, "minha-agenda")).toBe(true);
  });
  it("sem vínculo não entra em lugar nenhum", () => {
    expect(canAccessUnitArea([], A.slug, "agenda")).toBe(false);
  });
});

describe("canSeeUnit", () => {
  it("só vê unidades onde tem vínculo", () => {
    expect(canSeeUnit([recepA], A.slug)).toBe(true);
    expect(canSeeUnit([recepA], B.slug)).toBe(false);
    expect(canSeeUnit([admin], B.slug)).toBe(true);
  });
});

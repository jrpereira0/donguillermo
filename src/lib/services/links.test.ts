import { describe, expect, it } from "vitest";
import { isValidServiceImagePath } from "./image";
import { selectionFrom } from "./links";

const U = "11111111-1111-4111-8111-111111111111";
const S = "22222222-2222-4222-8222-222222222222";
const B1 = "33333333-3333-4333-8333-333333333333";
const B2 = "44444444-4444-4444-8444-444444444444";

function form(entries: [string, string][]) {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
}

describe("selectionFrom", () => {
  it("lê os marcados e a duração própria de cada um", () => {
    const sel = selectionFrom(
      form([
        ["barberIds", B1],
        ["barberMinutes_" + B1, ""],
        ["barberIds", B2],
        ["barberMinutes_" + B2, "45"],
      ]),
      "barberIds",
      "barberMinutes_",
    );
    expect(sel).not.toBeNull();
    expect(sel?.get(B1)).toBeNull();
    expect(sel?.get(B2)).toBe(45);
    expect(sel?.size).toBe(2);
  });

  it("sem ninguém marcado devolve mapa vazio", () => {
    expect(selectionFrom(form([]), "barberIds", "barberMinutes_")?.size).toBe(0);
  });

  it("ignora repetidos", () => {
    const sel = selectionFrom(form([["barberIds", B1], ["barberIds", B1]]), "barberIds", "barberMinutes_");
    expect(sel?.size).toBe(1);
  });

  it("rejeita id que não é UUID", () => {
    expect(selectionFrom(form([["barberIds", "1; drop table"]]), "barberIds", "barberMinutes_")).toBeNull();
  });

  it("rejeita duração fora da lista ou não numérica", () => {
    for (const bad of ["7", "abc", "-30", "30.5", "1000"]) {
      const sel = selectionFrom(form([["barberIds", B1], ["barberMinutes_" + B1, bad]]), "barberIds", "barberMinutes_");
      expect(sel, bad).toBeNull();
    }
  });

  it("normaliza o id para minúsculas", () => {
    const up = B1.toUpperCase();
    const sel = selectionFrom(form([["serviceIds", up], ["serviceMinutes_" + up, "60"]]), "serviceIds", "serviceMinutes_");
    expect(sel?.get(B1)).toBe(60);
  });
});

describe("isValidServiceImagePath", () => {
  it("aceita <unidade>/<serviço>.(webp|jpg|png)", () => {
    expect(isValidServiceImagePath(`${U}/${S}.webp`, U, S)).toBe(true);
    expect(isValidServiceImagePath(`${U}/${S}.jpg`, U, S)).toBe(true);
    expect(isValidServiceImagePath(`${U}/${S}.png`, U, S)).toBe(true);
  });

  it("rejeita outra unidade, outro serviço, extensão ou caminho solto", () => {
    expect(isValidServiceImagePath(`${B1}/${S}.webp`, U, S)).toBe(false);
    expect(isValidServiceImagePath(`${U}/${B1}.webp`, U, S)).toBe(false);
    expect(isValidServiceImagePath(`${U}/${S}.gif`, U, S)).toBe(false);
    expect(isValidServiceImagePath(`${U}/../${S}.webp`, U, S)).toBe(false);
    expect(isValidServiceImagePath(`${S}.webp`, U, S)).toBe(false);
  });
});

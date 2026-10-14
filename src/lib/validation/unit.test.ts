import { describe, expect, it } from "vitest";
import {
  createUnitSchema,
  hoursToFormDefaults,
  parseOpeningHours,
  slugify,
  slugSchema,
} from "./unit";

function form(entries: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe("slugify", () => {
  it("remove acentos, espaços e símbolos", () => {
    expect(slugify("São Bernardo - Shopping Metrópole")).toBe("sao-bernardo-shopping-metropole");
    expect(slugify("  Unidade  Ação!! ")).toBe("unidade-acao");
  });
  it("respeita o limite de 60 sem terminar em hífen", () => {
    const s = slugify("a".repeat(59) + " b" + " c".repeat(10));
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith("-")).toBe(false);
  });
  it("texto sem letras vira vazio", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("slugSchema", () => {
  it("aceita slugs válidos", () => {
    expect(slugSchema.safeParse("sao-bernardo-metropole").success).toBe(true);
  });
  it.each(["ab", "Com Espaço", "-inicio", "fim-", "dois--hifens", "acentuação", "a/b", "../x"])(
    "rejeita %s",
    (v) => expect(slugSchema.safeParse(v).success).toBe(false),
  );
});

describe("createUnitSchema", () => {
  const base = { name: "Unidade X", slug: "unidade-x", address: "", phone: "", receptionEmail: "Rec@Exemplo.com", receptionName: "" };
  it("normaliza vazios para null e o e-mail para minúsculas", () => {
    const r = createUnitSchema.parse(base);
    expect(r.address).toBeNull();
    expect(r.phone).toBeNull();
    expect(r.receptionEmail).toBe("rec@exemplo.com");
  });
  it("exige e-mail válido da recepção e nome", () => {
    expect(createUnitSchema.safeParse({ ...base, receptionEmail: "x" }).success).toBe(false);
    expect(createUnitSchema.safeParse({ ...base, name: " " }).success).toBe(false);
  });
  it("rejeita telefone com letras", () => {
    expect(createUnitSchema.safeParse({ ...base, phone: "abc" }).success).toBe(false);
    expect(createUnitSchema.safeParse({ ...base, phone: "+55 (11) 4000-0000" }).success).toBe(true);
  });
});

describe("parseOpeningHours", () => {
  it("sem nada informado -> null", () => {
    expect(parseOpeningHours(form({}))).toEqual({ ok: true, value: null });
  });
  it("lê dia aberto e dia fechado", () => {
    const r = parseOpeningHours(
      form({ hours_mon_open: "09:00", hours_mon_close: "20:00", hours_sun_closed: "on" }),
    );
    expect(r).toEqual({
      ok: true,
      value: { mon: { open: "09:00", close: "20:00" }, sun: { closed: true } },
    });
  });
  it("dia fechado ignora horários digitados", () => {
    const r = parseOpeningHours(form({ hours_sat_closed: "on", hours_sat_open: "99:99" }));
    expect(r).toEqual({ ok: true, value: { sat: { closed: true } } });
  });
  it("rejeita horário incompleto, inválido ou invertido", () => {
    expect(parseOpeningHours(form({ hours_mon_open: "09:00" })).ok).toBe(false);
    expect(parseOpeningHours(form({ hours_mon_open: "25:00", hours_mon_close: "26:00" })).ok).toBe(false);
    expect(parseOpeningHours(form({ hours_mon_open: "20:00", hours_mon_close: "09:00" })).ok).toBe(false);
    expect(parseOpeningHours(form({ hours_mon_open: "09:00", hours_mon_close: "09:00" })).ok).toBe(false);
  });
});

describe("parseOpeningHours com almoço", () => {
  const day = { hours_mon_open: "09:00", hours_mon_close: "18:00" };
  it("lê o almoço quando habilitado", () => {
    const r = parseOpeningHours(form({ ...day, hours_mon_break_start: "12:00", hours_mon_break_end: "13:00" }), {
      withBreak: true,
    });
    expect(r).toEqual({
      ok: true,
      value: { mon: { open: "09:00", close: "18:00", break: { start: "12:00", end: "13:00" } } },
    });
  });
  it("sem almoço preenchido, o dia fica só com abertura e fechamento", () => {
    expect(parseOpeningHours(form(day), { withBreak: true })).toEqual({
      ok: true,
      value: { mon: { open: "09:00", close: "18:00" } },
    });
  });
  it("ignora o almoço quando não habilitado (horário da unidade)", () => {
    const r = parseOpeningHours(form({ ...day, hours_mon_break_start: "12:00", hours_mon_break_end: "13:00" }));
    expect(r).toEqual({ ok: true, value: { mon: { open: "09:00", close: "18:00" } } });
  });
  it.each([
    ["só o início", { hours_mon_break_start: "12:00" }],
    ["horário inválido", { hours_mon_break_start: "25:00", hours_mon_break_end: "26:00" }],
    ["fim antes do início", { hours_mon_break_start: "13:00", hours_mon_break_end: "12:00" }],
    ["início igual ao fim", { hours_mon_break_start: "12:00", hours_mon_break_end: "12:00" }],
    ["começa antes de abrir", { hours_mon_break_start: "08:00", hours_mon_break_end: "09:30" }],
    ["termina depois de fechar", { hours_mon_break_start: "17:00", hours_mon_break_end: "18:30" }],
  ])("rejeita almoço: %s", (_n, extra) => {
    expect(parseOpeningHours(form({ ...day, ...extra }), { withBreak: true }).ok).toBe(false);
  });
  it("dia de folga ignora o almoço", () => {
    const r = parseOpeningHours(form({ hours_mon_closed: "on", hours_mon_break_start: "99:99" }), { withBreak: true });
    expect(r).toEqual({ ok: true, value: { mon: { closed: true } } });
  });
});

describe("hoursToFormDefaults", () => {
  it("ida e volta", () => {
    const d = hoursToFormDefaults({ mon: { open: "09:00", close: "18:00" }, sun: { closed: true } });
    expect(d.mon).toEqual({ closed: false, open: "09:00", close: "18:00", breakStart: "", breakEnd: "" });
    expect(d.sun.closed).toBe(true);
    expect(d.tue).toEqual({ closed: false, open: "", close: "", breakStart: "", breakEnd: "" });
  });
  it("aceita null/lixo", () => {
    expect(hoursToFormDefaults(null).mon.open).toBe("");
    expect(hoursToFormDefaults("x").mon.open).toBe("");
  });
});

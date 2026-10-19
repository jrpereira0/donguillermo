import { describe, expect, it } from "vitest";
import {
  addDays,
  dayBoundsUtc,
  dayKeyOf,
  freeSlots,
  fromMinutes,
  gridRange,
  isIsoDate,
  outsideHoursReason,
  overlapLanes,
  roundUpTo,
  toMinutes,
  todayIso,
  unavailableSpans,
  utcToZoned,
  windowOf,
  zonedToUtc,
} from "./time";

describe("datas e horas", () => {
  it("valida datas ISO reais", () => {
    expect(isIsoDate("2026-10-14")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("14/10/2026")).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });

  it("converte HH:MM e minutos", () => {
    expect(toMinutes("09:30")).toBe(570);
    expect(toMinutes("24:00")).toBeNaN();
    expect(fromMinutes(570)).toBe("09:30");
    expect(fromMinutes(1440)).toBe("24:00");
  });

  it("soma dias atravessando mês e ano", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("acha o dia da semana", () => {
    expect(dayKeyOf("2026-10-14")).toBe("wed");
    expect(dayKeyOf("2026-10-18")).toBe("sun");
  });

  it("arredonda para cima ao passo da agenda", () => {
    expect(roundUpTo(45, 30)).toBe(60);
    expect(roundUpTo(60, 30)).toBe(60);
    expect(roundUpTo(1, 15)).toBe(15);
  });
});

describe("fuso America/Sao_Paulo", () => {
  it("converte horário local em UTC (UTC-3, sem horário de verão)", () => {
    expect(zonedToUtc("2026-10-14", "09:00").toISOString()).toBe("2026-10-14T12:00:00.000Z");
    expect(zonedToUtc("2026-01-15", "23:30").toISOString()).toBe("2026-01-16T02:30:00.000Z");
  });

  it("ida e volta é estável", () => {
    for (const [d, t] of [["2026-10-14", "00:00"], ["2026-12-31", "23:55"], ["2026-03-01", "12:15"]]) {
      const back = utcToZoned(zonedToUtc(d, t));
      expect(back.date).toBe(d);
      expect(back.time).toBe(t);
    }
  });

  it("respeita o horário de verão de um fuso que o tem", () => {
    // Nova York: UTC-5 no inverno, UTC-4 no verão.
    expect(zonedToUtc("2026-01-15", "09:00", "America/New_York").toISOString()).toBe("2026-01-15T14:00:00.000Z");
    expect(zonedToUtc("2026-07-15", "09:00", "America/New_York").toISOString()).toBe("2026-07-15T13:00:00.000Z");
  });

  it("calcula limites do dia e a data de hoje no fuso da agenda", () => {
    const { start, end } = dayBoundsUtc("2026-10-14");
    expect(start.toISOString()).toBe("2026-10-14T03:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-15T03:00:00.000Z");
    // 01:00 UTC ainda é "ontem" em São Paulo.
    expect(todayIso(new Date("2026-10-14T01:00:00Z"))).toBe("2026-10-13");
    expect(todayIso(new Date("2026-10-14T15:00:00Z"))).toBe("2026-10-14");
  });
});

const unit = { wed: { open: "09:00", close: "19:00" }, sun: { closed: true } };
const barber = { wed: { open: "10:00", close: "18:00", break: { start: "12:00", end: "13:00" } }, thu: { closed: true } };

describe("expediente", () => {
  it("lê a janela do dia", () => {
    expect(windowOf(unit, "wed")).toMatchObject({ kind: "open", open: 540, close: 1140 });
    expect(windowOf(unit, "sun")).toEqual({ kind: "closed" });
    expect(windowOf(unit, "mon")).toEqual({ kind: "unset" });
    expect(windowOf(null, "mon")).toEqual({ kind: "unset" });
  });

  const check = (date: string, s: string, e: string, b: unknown = barber) =>
    outsideHoursReason({ unitHours: unit, barberHours: b, date, start: toMinutes(s), end: toMinutes(e) });

  it("aceita dentro do expediente", () => {
    expect(check("2026-10-14", "10:00", "10:30")).toBeNull();
    expect(check("2026-10-14", "17:30", "18:00")).toBeNull();
    expect(check("2026-10-14", "13:00", "14:00")).toBeNull();
  });

  it("recusa fora do horário da unidade", () => {
    expect(check("2026-10-14", "08:00", "08:30")).toMatch(/unidade/i);
    expect(check("2026-10-14", "18:45", "19:15")).toMatch(/unidade/i);
  });

  it("recusa unidade fechada e folga do profissional", () => {
    expect(check("2026-10-18", "10:00", "10:30")).toMatch(/fecha/i);
    expect(outsideHoursReason({ unitHours: null, barberHours: barber, date: "2026-10-15", start: 600, end: 630 })).toMatch(/não trabalha/i);
  });

  it("recusa fora do expediente do profissional e no intervalo", () => {
    expect(check("2026-10-14", "09:00", "09:30")).toMatch(/expediente/i);
    expect(check("2026-10-14", "17:45", "18:15")).toMatch(/expediente/i);
    expect(check("2026-10-14", "11:45", "12:15")).toMatch(/intervalo/i);
    expect(check("2026-10-14", "12:30", "13:30")).toMatch(/intervalo/i);
  });

  it("sem horário próprio, o profissional segue a unidade", () => {
    expect(check("2026-10-14", "09:00", "09:30", null)).toBeNull();
    expect(check("2026-10-14", "08:30", "09:00", null)).toMatch(/unidade/i);
  });

  it("dia não informado não restringe", () => {
    expect(outsideHoursReason({ unitHours: unit, barberHours: barber, date: "2026-10-12", start: 60, end: 120 })).toBeNull();
  });
});

describe("trechos indisponíveis", () => {
  it("antes, intervalo e depois do expediente", () => {
    const spans = unavailableSpans({ unitHours: unit, barberHours: barber, date: "2026-10-14", from: 540, to: 1140 });
    expect(spans).toEqual([
      { start: 540, end: 600 },
      { start: 720, end: 780 },
      { start: 1080, end: 1140 },
    ]);
  });

  it("dia fechado ocupa a grade toda", () => {
    expect(unavailableSpans({ unitHours: unit, barberHours: null, date: "2026-10-18", from: 480, to: 1200 })).toEqual([{ start: 480, end: 1200 }]);
    expect(unavailableSpans({ unitHours: unit, barberHours: barber, date: "2026-10-15", from: 480, to: 1200 })).toEqual([{ start: 480, end: 1200 }]);
  });

  it("sem restrições não marca nada", () => {
    expect(unavailableSpans({ unitHours: null, barberHours: null, date: "2026-10-14", from: 480, to: 1200 })).toEqual([]);
  });
});

describe("horários livres", () => {
  it("respeita expediente, passo e ocupação", () => {
    // Barbeiro 10:00–18:00 com intervalo 12:00–13:00; unidade 09:00–19:00.
    const slots = freeSlots({
      unitHours: unit,
      barberHours: barber,
      date: "2026-10-14",
      slot: 30,
      durationMin: 30,
      busy: [{ start: 600, end: 630 }], // 10:00–10:30 ocupado
      from: 540,
      to: 1140,
    });
    expect(slots[0]).toBe("10:30");
    expect(slots).not.toContain("10:00");
    expect(slots).not.toContain("12:00");
    expect(slots).not.toContain("12:30");
    expect(slots.at(-1)).toBe("17:30");
  });

  it("cliente: horário ocupado some da lista (sem encaixe)", () => {
    const slots = freeSlots({
      unitHours: unit,
      barberHours: barber,
      date: "2026-10-14",
      slot: 30,
      durationMin: 30,
      busy: [{ start: 600, end: 660 }],
      from: 600,
      to: 720,
    });
    expect(slots).not.toContain("10:00");
    expect(slots).not.toContain("10:30");
    expect(slots).toContain("11:00");
  });

  it("recepção: allowOverlap inclui horário já ocupado (encaixe)", () => {
    const slots = freeSlots({
      unitHours: unit,
      barberHours: barber,
      date: "2026-10-14",
      slot: 30,
      durationMin: 30,
      busy: [{ start: 600, end: 660 }],
      from: 600,
      to: 720,
      allowOverlap: true,
    });
    expect(slots).toContain("10:00");
    expect(slots).toContain("10:30");
    expect(slots).toContain("11:00");
  });

  it("recepção: allowOutside oferece horário fora do expediente", () => {
    const slots = freeSlots({
      unitHours: unit,
      barberHours: barber,
      date: "2026-10-14",
      slot: 30,
      durationMin: 30,
      busy: [],
      from: 480,
      to: 660,
      allowOutside: true,
    });
    // Barbeiro só abre 10:00; com allowOutside, 09:00 entra.
    expect(slots).toContain("09:00");
    expect(slots).toContain("10:00");
  });
});

describe("faixas de sobreposição", () => {
  it("itens sem colisão ocupam a coluna inteira", () => {
    const m = overlapLanes([
      { id: "a", startMin: 600, endMin: 630 },
      { id: "b", startMin: 630, endMin: 660 },
    ]);
    expect(m.get("a")).toEqual({ lane: 0, lanes: 1 });
    expect(m.get("b")).toEqual({ lane: 0, lanes: 1 });
  });

  it("divide a coluna quando dois horários colidem", () => {
    const m = overlapLanes([
      { id: "a", startMin: 600, endMin: 660 },
      { id: "b", startMin: 630, endMin: 690 },
    ]);
    expect(m.get("a")).toEqual({ lane: 0, lanes: 2 });
    expect(m.get("b")).toEqual({ lane: 1, lanes: 2 });
  });

  it("reusa faixa quando o anterior já terminou", () => {
    const m = overlapLanes([
      { id: "a", startMin: 600, endMin: 630 },
      { id: "b", startMin: 600, endMin: 630 },
      { id: "c", startMin: 630, endMin: 660 },
    ]);
    expect(m.get("a")?.lanes).toBe(2);
    expect(m.get("b")?.lanes).toBe(2);
    expect(m.get("c")).toEqual({ lane: 0, lanes: 1 });
  });
});

describe("faixa da grade", () => {
  it("cobre unidade e profissionais, em horas cheias", () => {
    expect(gridRange({ unitHours: { wed: { open: "09:30", close: "19:15" } }, barbersHours: [barber], date: "2026-10-14" })).toEqual({ from: 540, to: 1200 });
  });

  it("usa 08:00–20:00 quando nada é informado", () => {
    expect(gridRange({ unitHours: null, barbersHours: [], date: "2026-10-14" })).toEqual({ from: 480, to: 1200 });
  });

  it("amplia para caber agendamentos fora do expediente", () => {
    expect(gridRange({ unitHours: unit, barbersHours: [], date: "2026-10-14", extra: [{ start: 420, end: 450 }, { start: 1200, end: 1230 }] })).toEqual({ from: 420, to: 1260 });
  });
});

import { describe, expect, it } from "vitest";
import {
  appointmentSchema,
  blockSchema,
  canMove,
  occupiedMinutes,
  occupiesSlot,
  STATUS_MOVES,
  totals,
} from "./appointment";

const ID = "3f2b8c1e-6a4d-4e0b-9d5a-1c2b3a4d5e6f";
const ID2 = "4f2b8c1e-6a4d-4e0b-9d5a-1c2b3a4d5e70";

const base = {
  barberId: ID,
  date: "2026-10-20",
  time: "10:00",
  serviceIds: [ID, ID2],
  customerMode: "registered",
  customerId: ID,
  customerName: "",
  customerPhone: "",
  notes: "",
  force: "",
  noPreference: "",
};

describe("appointmentSchema", () => {
  it("aceita cliente cadastrado", () => {
    const r = appointmentSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.notes).toBeNull();
      expect(r.data.force).toBe(false);
      expect(r.data.hasBarberPreference).toBe(true);
    }
  });

  it("marca sem preferência de profissional", () => {
    const r = appointmentSchema.safeParse({ ...base, noPreference: "on" });
    expect(r.success && r.data.hasBarberPreference).toBe(false);
  });

  it("aceita cliente avulso sem nome nem telefone", () => {
    const r = appointmentSchema.safeParse({
      ...base,
      customerMode: "walkin",
      customerId: "",
      customerName: "",
      customerPhone: "",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.customerName).toBe("Cliente sem cadastro");
      expect(r.data.customerPhone).toBe("");
    }
  });

  it("exige o cliente cadastrado escolhido", () => {
    const r = appointmentSchema.safeParse({ ...base, customerId: "" });
    expect(!r.success && r.error.issues[0].path[0]).toBe("customerId");
  });

  it("exige ao menos um serviço, sem repetir e até o limite", () => {
    expect(appointmentSchema.safeParse({ ...base, serviceIds: [] }).success).toBe(false);
    expect(appointmentSchema.safeParse({ ...base, serviceIds: [ID, ID] }).success).toBe(false);
    const many = Array.from({ length: 9 }, (_, i) => `4f2b8c1e-6a4d-4e0b-9d5a-1c2b3a4d5e7${i}`);
    expect(appointmentSchema.safeParse({ ...base, serviceIds: many }).success).toBe(false);
  });

  it("recusa data, hora e profissional inválidos", () => {
    expect(appointmentSchema.safeParse({ ...base, date: "2026-02-30" }).success).toBe(false);
    expect(appointmentSchema.safeParse({ ...base, time: "25:00" }).success).toBe(false);
    expect(appointmentSchema.safeParse({ ...base, barberId: "x" }).success).toBe(false);
  });

  it("limita a observação", () => {
    expect(appointmentSchema.safeParse({ ...base, notes: "x".repeat(501) }).success).toBe(false);
    const r = appointmentSchema.safeParse({ ...base, notes: " Prefere tesoura " });
    expect(r.success && r.data.notes).toBe("Prefere tesoura");
  });

  it("lê o 'encaixe' (force)", () => {
    const r = appointmentSchema.safeParse({ ...base, force: "on" });
    expect(r.success && r.data.force).toBe(true);
  });
});

describe("blockSchema", () => {
  const ok = { barberId: ID, date: "2026-10-20", start: "12:00", end: "13:00", reason: "" };

  it("aceita um profissional ou todos", () => {
    expect(blockSchema.safeParse(ok).success).toBe(true);
    expect(blockSchema.safeParse({ ...ok, barberId: "all" }).success).toBe(true);
  });

  it("exige fim depois do início", () => {
    const r = blockSchema.safeParse({ ...ok, end: "12:00" });
    expect(!r.success && r.error.issues[0].path[0]).toBe("end");
    expect(blockSchema.safeParse({ ...ok, start: "14:00" }).success).toBe(false);
  });

  it("limita o motivo", () => {
    expect(blockSchema.safeParse({ ...ok, reason: "x".repeat(201) }).success).toBe(false);
  });
});

describe("situação", () => {
  it("só cancelado e falta liberam o horário", () => {
    expect(occupiesSlot("agendado")).toBe(true);
    expect(occupiesSlot("concluido")).toBe(true);
    expect(occupiesSlot("cancelado")).toBe(false);
    expect(occupiesSlot("faltou")).toBe(false);
  });

  it("valida as mudanças permitidas", () => {
    expect(canMove("agendado", "confirmado")).toBe(true);
    expect(canMove("confirmado", "em_atendimento")).toBe(true);
    expect(canMove("em_atendimento", "concluido")).toBe(true);
    expect(canMove("agendado", "concluido")).toBe(true);
    expect(canMove("concluido", "cancelado")).toBe(true);
    expect(canMove("cancelado", "agendado")).toBe(true);
    expect(canMove("faltou", "agendado")).toBe(true);
    expect(canMove("agendado", "agendado")).toBe(false);
    expect(canMove("xyz", "agendado")).toBe(false);
  });

  it("toda situação ativa tem ao menos uma saída (cancelado é terminal na agenda)", () => {
    for (const [status, moves] of Object.entries(STATUS_MOVES)) {
      if (status === "cancelado") {
        expect(moves.length).toBe(0);
        continue;
      }
      expect(moves.length).toBeGreaterThan(0);
    }
  });
});

describe("totais", () => {
  it("soma duração e preço", () => {
    expect(totals([{ minutes: 30, priceCents: 4500 }, { minutes: 20, priceCents: 3000 }])).toEqual({ minutes: 50, priceCents: 7500 });
    expect(totals([])).toEqual({ minutes: 0, priceCents: 0 });
  });

  it("arredonda o tempo ocupado ao passo da agenda", () => {
    expect(occupiedMinutes(50, 30)).toBe(60);
    expect(occupiedMinutes(60, 30)).toBe(60);
    expect(occupiedMinutes(20, 15)).toBe(30);
    expect(occupiedMinutes(5, 30)).toBe(30);
  });
});

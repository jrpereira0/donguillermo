import { describe, expect, it } from "vitest";
import {
  PHONE_LIMIT,
  composeAddress,
  misalignedServices,
  parsePhones,
  phonesFromDb,
  primaryPhone,
  slotLabel,
  unitSettingsSchema,
} from "./unit-settings";

const base = {
  name: "  Don Guillermo - Metrópole ",
  cnpj: "",
  cep: "",
  street: "",
  streetNumber: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  slotMinutes: "30",
};

describe("dados da unidade", () => {
  it("aceita o mínimo (só nome e agenda) e limpa os vazios", () => {
    const r = unitSettingsSchema.parse(base);
    expect(r.name).toBe("Don Guillermo - Metrópole");
    expect(r.cnpj).toBeNull();
    expect(r.cep).toBeNull();
    expect(r.slotMinutes).toBe(30);
  });

  it("nome obrigatório", () => {
    expect(unitSettingsSchema.safeParse({ ...base, name: " " }).success).toBe(false);
    expect(unitSettingsSchema.safeParse({ ...base, name: "x".repeat(121) }).success).toBe(false);
  });

  it("CNPJ: válido sem máscara, inválido barrado", () => {
    expect(unitSettingsSchema.parse({ ...base, cnpj: "11.222.333/0001-81" }).cnpj).toBe("11222333000181");
    expect(unitSettingsSchema.safeParse({ ...base, cnpj: "11.222.333/0001-82" }).success).toBe(false);
  });

  it("CEP com 8 dígitos e UF com 2 letras", () => {
    const r = unitSettingsSchema.parse({ ...base, cep: "09750-000", state: "sp" });
    expect(r.cep).toBe("09750000");
    expect(r.state).toBe("SP");
    expect(unitSettingsSchema.safeParse({ ...base, cep: "123" }).success).toBe(false);
    expect(unitSettingsSchema.safeParse({ ...base, state: "SPX" }).success).toBe(false);
  });

  it("tempo da agenda: só as opções da lista", () => {
    for (const v of ["5", "10", "15", "20", "30", "60"]) {
      expect(unitSettingsSchema.safeParse({ ...base, slotMinutes: v }).success).toBe(true);
    }
    for (const v of ["", "0", "7", "45", "90", "abc"]) {
      expect(unitSettingsSchema.safeParse({ ...base, slotMinutes: v }).success).toBe(false);
    }
  });

  it("rótulo do tempo", () => {
    expect(slotLabel(15)).toBe("15 minutos");
    expect(slotLabel(60)).toBe("1 hora");
  });

  it("conta serviços que não fecham com a linha da agenda", () => {
    expect(misalignedServices([30, 45, 60], 30)).toBe(1);
    expect(misalignedServices([30, 45, 60], 15)).toBe(0);
    expect(misalignedServices([20, 25], 60)).toBe(2);
    expect(misalignedServices([], 30)).toBe(0);
  });
});

describe("telefones", () => {
  const ok = [{ label: "Recepção", number: "(11) 4002-8922", whatsapp: false }];

  it("lista vazia é permitida", () => {
    expect(parsePhones("")).toEqual({ ok: true, value: [] });
    expect(parsePhones("[]")).toEqual({ ok: true, value: [] });
  });

  it("guarda só os dígitos e mantém o rótulo e o WhatsApp", () => {
    const r = parsePhones(JSON.stringify([...ok, { label: " WhatsApp ", number: "11912345678", whatsapp: true }]));
    expect(r).toEqual({
      ok: true,
      value: [
        { label: "Recepção", number: "1140028922", whatsapp: false },
        { label: "WhatsApp", number: "11912345678", whatsapp: true },
      ],
    });
  });

  it("aponta o campo de cada linha com problema", () => {
    const r = parsePhones(
      JSON.stringify([
        { label: "", number: "(11) 4002-8922", whatsapp: false },
        { label: "Celular", number: "123", whatsapp: false },
        { label: "Outro", number: "", whatsapp: false },
      ]),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual(["phone_0_label", "phone_1_number", "phone_2_number"]);
    }
  });

  it("barra telefone repetido", () => {
    const r = parsePhones(JSON.stringify([...ok, { label: "Outro", number: "11 4002 8922", whatsapp: true }]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.phone_1_number).toMatch(/já foi informado/);
  });

  it("limite de telefones", () => {
    const many = Array.from({ length: PHONE_LIMIT + 1 }, (_, i) => ({
      label: `T${i}`,
      number: `119123456${10 + i}`,
      whatsapp: false,
    }));
    expect(parsePhones(JSON.stringify(many)).ok).toBe(false);
  });

  it("JSON quebrado ou fora do formato é barrado", () => {
    expect(parsePhones("{").ok).toBe(false);
    expect(parsePhones('{"a":1}').ok).toBe(false);
  });

  it("phonesFromDb ignora lixo", () => {
    expect(phonesFromDb(null)).toEqual([]);
    expect(phonesFromDb([1, null, { label: "A", number: "11912345678" }, { label: 2 }])).toEqual([
      { label: "A", number: "11912345678", whatsapp: false },
    ]);
  });

  it("telefone principal vem formatado", () => {
    expect(primaryPhone([])).toBeNull();
    expect(primaryPhone([{ label: "A", number: "11912345678", whatsapp: true }])).toBe("(11) 91234-5678");
  });
});

describe("endereço em uma linha", () => {
  const empty = {
    street: null,
    streetNumber: null,
    complement: null,
    neighborhood: null,
    city: null,
    state: null,
    cep: null,
  };

  it("completo", () => {
    expect(
      composeAddress({
        street: "Av. Kennedy",
        streetNumber: "700",
        complement: "Loja 12",
        neighborhood: "Jardim do Mar",
        city: "São Bernardo do Campo",
        state: "SP",
        cep: "09726263",
      }),
    ).toBe("Av. Kennedy, 700 - Loja 12, Jardim do Mar, São Bernardo do Campo/SP - CEP 09726-263");
  });

  it("parcial e vazio", () => {
    expect(composeAddress({ ...empty, street: "Rua A", city: "Santo André" })).toBe("Rua A, Santo André");
    expect(composeAddress(empty)).toBeNull();
  });
});

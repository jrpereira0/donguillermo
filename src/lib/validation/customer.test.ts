import { describe, expect, it } from "vitest";
import {
  ageFrom,
  cpfProblem,
  customerSchema,
  formatPersonName,
  isValidCpf,
  maskCpf,
  noteSchema,
} from "./customer";

const base = {
  fullName: "  Maria da Silva ",
  phone: "(11) 91234-5678",
  email: "",
  birthDate: "",
  cpf: "",
  cep: "",
  street: "",
  streetNumber: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  referralSource: "",
  marketingConsent: "",
};

describe("CPF", () => {
  it("aceita CPF válido, com ou sem máscara", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
  });
  it("rejeita dígito errado, tamanho errado e repetidos", () => {
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("1234567890")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
  });
  it("máscara enquanto digita", () => {
    expect(maskCpf("5299")).toBe("529.9");
    expect(maskCpf("52998224725")).toBe("529.982.247-25");
    expect(maskCpf("529982247259999")).toBe("529.982.247-25");
  });
  it("cpfProblem: vazio passa, inválido avisa", () => {
    expect(cpfProblem("")).toBeNull();
    expect(cpfProblem("123")).not.toBeNull();
  });
});

describe("formatPersonName", () => {
  it("capitaliza nome e sobrenome", () => {
    expect(formatPersonName("joão")).toBe("João");
    expect(formatPersonName("MARIA")).toBe("Maria");
    expect(formatPersonName("  maria DA silva ")).toBe("Maria da Silva");
    expect(formatPersonName("pedro de souza")).toBe("Pedro de Souza");
  });
});

describe("customerSchema", () => {
  it("só nome e telefone são obrigatórios", () => {
    const r = customerSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.fullName).toBe("Maria da Silva");
      expect(r.data.phone).toBe("11912345678");
      expect(r.data.email).toBeNull();
      expect(r.data.cpf).toBeNull();
      expect(r.data.referralSource).toBeNull();
      expect(r.data.marketingConsent).toBe(false);
    }
  });

  it("formata o nome ao salvar", () => {
    const r = customerSchema.safeParse({ ...base, fullName: "josé CARLOS dos santos" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.fullName).toBe("José Carlos dos Santos");
  });
  it("exige nome e telefone", () => {
    const r = customerSchema.safeParse({ ...base, fullName: "", phone: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const fields = r.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("fullName");
      expect(fields).toContain("phone");
    }
  });
  it("normaliza CPF, e-mail, origem e consentimento", () => {
    const r = customerSchema.safeParse({
      ...base,
      cpf: "529.982.247-25",
      email: " Maria@Exemplo.COM ",
      marketingConsent: "on",
      referralSource: "instagram",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.cpf).toBe("52998224725");
      expect(r.data.email).toBe("maria@exemplo.com");
      expect(r.data.marketingConsent).toBe(true);
      expect(r.data.referralSource).toBe("instagram");
    }
  });
  it("rejeita CPF, e-mail e origem inválidos", () => {
    const r = customerSchema.safeParse({
      ...base,
      cpf: "111.111.111-11",
      email: "nao-e-email",
      referralSource: "tv",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const fields = r.error.issues.map((i) => i.path[0]);
      expect(fields).toEqual(expect.arrayContaining(["cpf", "email", "referralSource"]));
    }
  });
});

describe("ageFrom", () => {
  const today = new Date("2026-10-14T12:00:00Z");
  it("conta anos completos", () => {
    expect(ageFrom("1990-10-14", today)).toBe(36);
    expect(ageFrom("1990-10-15", today)).toBe(35);
  });
  it("vazio ou inválido devolve null", () => {
    expect(ageFrom("", today)).toBeNull();
    expect(ageFrom("abc", today)).toBeNull();
    expect(ageFrom("2030-01-01", today)).toBeNull();
  });
});

describe("noteSchema", () => {
  it("aceita texto e tira os espaços das pontas", () => {
    const r = noteSchema.safeParse({ body: "  Gosta de máquina 2.  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.body).toBe("Gosta de máquina 2.");
  });
  it("rejeita vazio, só espaços e texto longo demais", () => {
    expect(noteSchema.safeParse({ body: "" }).success).toBe(false);
    expect(noteSchema.safeParse({ body: "   " }).success).toBe(false);
    expect(noteSchema.safeParse({ body: "a".repeat(1001) }).success).toBe(false);
    expect(noteSchema.safeParse({ body: "a".repeat(1000) }).success).toBe(true);
  });
});

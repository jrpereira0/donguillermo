import { describe, expect, it } from "vitest";
import {
  barberDetailsSchema,
  buildSocial,
  createBarberSchema,
  cnpjProblem,
  initialsOf,
  isValidCnpj,
  isValidPhone,
  maskCnpj,
  maskPhone,
  normalizeHandle,
  phoneProblem,
  socialLinks,
} from "./barber";

const base = {
  firstName: "João",
  lastName: "da Silva",
  displayName: "João",
  jobTitle: "barbeiro",
  phone: "",
  birthDate: "",
  cnpj: "",
  cep: "",
  street: "",
  streetNumber: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  instagram: "",
  facebook: "",
  tiktok: "",
};

describe("CNPJ", () => {
  it("aceita CNPJs válidos (numéricos e alfanuméricos), com ou sem máscara", () => {
    expect(isValidCnpj("11222333000181")).toBe(true);
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("12ABC34501DE35")).toBe(true);
    expect(isValidCnpj("12.abc.345/01de-35")).toBe(true);
  });
  it.each(["11222333000182", "11111111111111", "00000000000000", "1122233300018", "112223330001811", "12ABC34501DEAB", "abc", ""])(
    "rejeita %s",
    (v) => expect(isValidCnpj(v)).toBe(false),
  );
  it("aplica a máscara enquanto digita", () => {
    expect(maskCnpj("")).toBe("");
    expect(maskCnpj("11")).toBe("11");
    expect(maskCnpj("112223")).toBe("11.222.3");
    expect(maskCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(maskCnpj("11222333000181999")).toBe("11.222.333/0001-81");
    expect(maskCnpj("12abc34501de35")).toBe("12.ABC.345/01DE-35");
    expect(maskCnpj("112223330001AB")).toBe("11.222.333/0001");
    expect(maskCnpj(null)).toBe("");
  });
  it("mensagem de erro só quando preenchido e inválido", () => {
    expect(cnpjProblem("")).toBeNull();
    expect(cnpjProblem("11.222.333/0001-81")).toBeNull();
    expect(cnpjProblem("11.222.333/0001-82")).toMatch(/inválido/i);
  });
});

describe("telefone", () => {
  it.each(["11912345678", "(11) 91234-5678", "1132345678", "(11) 3234-5678", "+55 11 91234-5678", "5511912345678"])(
    "aceita %s",
    (v) => expect(isValidPhone(v)).toBe(true),
  );
  it.each(["", "12345", "telefone", "0112345678", "1012345678", "11812345678", "1112345678", "11999999999", "119123456789"])(
    "rejeita %s",
    (v) => expect(isValidPhone(v)).toBe(false),
  );
  it("aplica a máscara enquanto digita", () => {
    expect(maskPhone("")).toBe("");
    expect(maskPhone("1")).toBe("(1");
    expect(maskPhone("11")).toBe("(11");
    expect(maskPhone("119")).toBe("(11) 9");
    expect(maskPhone("11912")).toBe("(11) 912");
    expect(maskPhone("1132345678")).toBe("(11) 3234-5678");
    expect(maskPhone("11912345678")).toBe("(11) 91234-5678");
    expect(maskPhone("11912345678999")).toBe("(11) 91234-5678");
    expect(maskPhone("+55 11 91234-5678")).toBe("(11) 91234-5678");
    expect(maskPhone(null)).toBe("");
  });
  it("mensagem de erro só quando preenchido e inválido", () => {
    expect(phoneProblem("")).toBeNull();
    expect(phoneProblem("(11) 91234-5678")).toBeNull();
    expect(phoneProblem("(11) 1234")).toMatch(/inválido/i);
  });
});

describe("normalizeHandle", () => {
  it("extrai o usuário de @, domínio e URL completa", () => {
    expect(normalizeHandle("@don.guillermo", ["instagram.com"])).toBe("don.guillermo");
    expect(normalizeHandle("instagram.com/don.guillermo/", ["instagram.com"])).toBe("don.guillermo");
    expect(normalizeHandle("https://www.instagram.com/don.guillermo?igsh=abc", ["instagram.com"])).toBe("don.guillermo");
    expect(normalizeHandle("HTTP://m.facebook.com/don.barbearia#x", ["facebook.com", "fb.com"])).toBe("don.barbearia");
  });
});

describe("barberDetailsSchema", () => {
  it("aceita só o mínimo e normaliza vazios para null / 0", () => {
    const r = barberDetailsSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.phone).toBeNull();
      expect(r.data.cnpj).toBeNull();
      expect(r.data.birthDate).toBeNull();
      expect(r.data.instagram).toBeNull();
    }
  });

  it("normaliza CNPJ, telefone e redes sociais", () => {
    const r = barberDetailsSchema.safeParse({
      ...base,
      cnpj: "12.abc.345/01de-35",
      instagram: "https://instagram.com/joao.barber/",
      tiktok: "@joaobarber",
      facebook: "facebook.com/joao.barber",
      phone: "(11) 99999-0000",
      birthDate: "1990-05-17",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.cnpj).toBe("12ABC34501DE35");
      expect(r.data.instagram).toBe("joao.barber");
      expect(r.data.tiktok).toBe("joaobarber");
      expect(r.data.facebook).toBe("joao.barber");
      expect(r.data.phone).toBe("11999990000");
    }
  });

  it.each(["barbeiro", "recepcionista", "gerente", "lider", "auxiliar"])("aceita a função %s", (jobTitle) => {
    expect(barberDetailsSchema.safeParse({ ...base, jobTitle }).success).toBe(true);
  });

  it("normaliza o endereço (CEP só com dígitos, UF maiúscula, vazios viram null)", () => {
    const r = barberDetailsSchema.safeParse({
      ...base,
      cep: "01310-100",
      street: " Avenida Paulista ",
      streetNumber: "1000",
      state: "sp",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.cep).toBe("01310100");
      expect(r.data.street).toBe("Avenida Paulista");
      expect(r.data.state).toBe("SP");
      expect(r.data.complement).toBeNull();
      expect(r.data.city).toBeNull();
    }
  });

  it.each([
    ["firstName", "J"],
    ["lastName", ""],
    ["cep", "1234"],
    ["cep", "abcde-fgh"],
    ["state", "SPP"],
    ["street", "x".repeat(121)],
    ["jobTitle", ""],
    ["jobTitle", "dono"],
    ["displayName", ""],
    ["displayName", "x".repeat(41)],
    ["cnpj", "11.222.333/0001-82"],
    ["phone", "12345"],
    ["phone", "telefone"],
    ["phone", "(11) 1234-567"],
    ["birthDate", "2999-01-01"],
    ["birthDate", "1990-02-31"],
    ["birthDate", "17/05/1990"],
    ["instagram", "usuário com espaço"],
    ["instagram", "a".repeat(31)],
  ])("rejeita %s = %s", (field, value) => {
    const r = barberDetailsSchema.safeParse({ ...base, [field]: value });
    expect(r.success).toBe(false);
  });
});

describe("createBarberSchema", () => {
  it("exige e-mail válido e o normaliza", () => {
    expect(createBarberSchema.safeParse({ ...base, email: "" }).success).toBe(false);
    expect(createBarberSchema.safeParse({ ...base, email: "x" }).success).toBe(false);
    const r = createBarberSchema.safeParse({ ...base, email: "  Joao@Exemplo.COM " });
    expect(r.success && r.data.email).toBe("joao@exemplo.com");
  });
});

describe("helpers de exibição", () => {
  it("buildSocial guarda só o preenchido", () => {
    expect(buildSocial({ instagram: "a", facebook: null, tiktok: null })).toEqual({ instagram: "a" });
    expect(buildSocial({ instagram: null, facebook: null, tiktok: null })).toEqual({});
  });
  it("socialLinks monta os links e ignora lixo", () => {
    expect(socialLinks({ instagram: "joao", foo: "x", tiktok: 5 })).toEqual([
      { key: "instagram", label: "Instagram", href: "https://instagram.com/joao", handle: "joao" },
    ]);
    expect(socialLinks(null)).toEqual([]);
  });
  it("initialsOf", () => {
    expect(initialsOf("João da Silva")).toBe("JS");
    expect(initialsOf("pedro")).toBe("P");
    expect(initialsOf("   ")).toBe("?");
  });
});

import { z } from "zod";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Informe o e-mail.")
  .max(254, "E-mail muito longo.")
  .email("Informe um e-mail válido.");

export const loginSchema = z.object({
  email,
  // No login não validamos força: só exigimos que exista (e limitamos o tamanho).
  password: z.string().min(1, "Informe a senha.").max(200),
});

export const forgotPasswordSchema = z.object({ email });

/** Política de senha forte (definição/redefinição de senha). */
export const strongPassword = z
  .string()
  .min(10, "A senha deve ter pelo menos 10 caracteres.")
  .max(72, "A senha deve ter no máximo 72 caracteres.")
  .regex(/[a-z]/, "Inclua uma letra minúscula.")
  .regex(/[A-Z]/, "Inclua uma letra maiúscula.")
  .regex(/[0-9]/, "Inclua um número.")
  .regex(/[^A-Za-z0-9]/, "Inclua um símbolo (ex.: ! @ # $ %).");

export const newPasswordSchema = z
  .object({
    password: strongPassword,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "As senhas não conferem.",
  });

/** Estado devolvido pelas Server Actions de formulário. */
export type FormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
};

export const initialFormState: FormState = { status: "idle" };

/** Converte um ZodError em { campo: primeira mensagem }. */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

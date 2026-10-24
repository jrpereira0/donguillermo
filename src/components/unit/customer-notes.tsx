"use client";

import { useActionState, useState, useTransition } from "react";
import { Building2, Check, Loader2, NotebookPen, Pencil, Plus, Trash2, UserRound, X } from "lucide-react";
import {
  addCustomerNoteAction,
  deleteCustomerNoteAction,
  updateCustomerNoteAction,
} from "@/app/u/[slug]/clientes/actions";
import { FormAlert } from "@/components/auth/form-alert";
import { FieldError } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "./empty-state";
import { initialCustomerState, type CustomerFormState, type CustomerNote } from "@/lib/customers/types";
import { cn } from "@/lib/utils";
import { FormSection } from "./form-parts";

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

const MAX = 1000;

/** Aviso de sucesso mostrado no canto da tela (vive no pai: a observação excluída some da lista). */
type Notify = (title: string, text: string) => void;

/** Foi editada depois de criada? (tolerância de 2 s: criação e primeiro update podem coincidir) */
const wasEdited = (n: CustomerNote) => new Date(n.updatedAt).getTime() - new Date(n.createdAt).getTime() > 2000;

/** Formulário de nova observação (sempre visível no topo da lista). */
function AddNote({ slug, customerId, notify }: { slug: string; customerId: string; notify: Notify }) {
  const [state, formAction, pending] = useActionState(
    async (prev: CustomerFormState, formData: FormData) => {
      const r = await addCustomerNoteAction(slug, customerId, prev, formData);
      if (r.status === "success") notify("Observação adicionada", "Ela já aparece na lista do cliente.");
      return r;
    },
    initialCustomerState,
  );
  const [text, setText] = useState("");
  // Salvou: limpa o campo (uma vez por resposta).
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.status === "success") setText("");
  }
  const error = state.fieldErrors?.body;

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      {state.status === "error" && state.message && !error ? <FormAlert tone="error">{state.message}</FormAlert> : null}
      <label htmlFor="note-new" className="sr-only">
        Nova observação
      </label>
      <Textarea
        id="note-new"
        name="body"
        rows={3}
        maxLength={MAX}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ex.: gosta de máquina 2, alergia a produto, prefere silêncio…"
        aria-invalid={!!error}
      />
      <FieldError id="note-new-error" message={error} />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {text.length}/{MAX}
        </span>
        <Button type="submit" variant="luxe" disabled={pending || text.trim() === ""}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus />}
          {pending ? "Salvando…" : "Adicionar observação"}
        </Button>
      </div>
    </form>
  );
}

/** Uma observação: leitura, edição no próprio lugar e exclusão com confirmação. */
function NoteItem({ slug, customerId, note, notify }: { slug: string; customerId: string; note: CustomerNote; notify: Notify }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [text, setText] = useState(note.body);
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [state, formAction, pending] = useActionState(
    async (prev: CustomerFormState, formData: FormData) => {
      const r = await updateCustomerNoteAction(slug, customerId, note.id, prev, formData);
      if (r.status === "success") notify("Observação atualizada", "As alterações foram salvas.");
      return r;
    },
    initialCustomerState,
  );

  function remove() {
    setDeleteError(undefined);
    startDelete(async () => {
      const r = await deleteCustomerNoteAction(slug, customerId, note.id);
      if (r.status === "success") notify("Observação excluída", "Ela foi removida da lista do cliente.");
      else {
        setDeleteError(r.message);
        setConfirming(false);
      }
    });
  }
  // Salvou: fecha a edição (uma vez por resposta).
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.status === "success") setEditing(false);
  }
  const error = state.fieldErrors?.body;

  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <UserRound className="size-3.5 shrink-0 text-gold/80" aria-hidden="true" />
            {note.authorName ?? "Recepção"}
          </span>
          {note.unitName ? (
            <span className="flex items-center gap-1.5">
              <Building2 className="size-3.5 shrink-0 text-gold/80" aria-hidden="true" />
              {note.unitName}
            </span>
          ) : null}
          <span>
            {dateTime.format(new Date(note.createdAt))}
            {wasEdited(note) ? ` · editada em ${dateTime.format(new Date(note.updatedAt))}` : ""}
          </span>
        </p>

        {!editing ? (
          <div className="flex items-center gap-1">
            {confirming ? (
              <>
                <span className="mr-1 text-xs text-muted-foreground">Excluir esta observação?</span>
                <Button type="button" variant="outline" size="sm" className="text-destructive" disabled={deleting} onClick={remove}>
                  {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  {deleting ? "Excluindo…" : "Excluir"}
                </Button>
                <Button type="button" variant="ghost" size="sm" disabled={deleting} onClick={() => setConfirming(false)}>
                  Cancelar
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setText(note.body);
                    setEditing(true);
                  }}
                >
                  <Pencil />
                  Editar
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)} aria-label="Excluir observação">
                  <Trash2 />
                  Excluir
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {deleteError ? <FormAlert tone="error">{deleteError}</FormAlert> : null}

      {editing ? (
        <form action={formAction} className="flex flex-col gap-3" noValidate>
          {state.status === "error" && state.message && !error ? (
            <FormAlert tone="error">{state.message}</FormAlert>
          ) : null}
          <label htmlFor={`note-${note.id}`} className="sr-only">
            Editar observação
          </label>
          <Textarea
            id={`note-${note.id}`}
            name="body"
            rows={3}
            maxLength={MAX}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-invalid={!!error}
            autoFocus
          />
          <FieldError id={`note-${note.id}-error`} message={error} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {text.length}/{MAX}
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setEditing(false)}>
                <X />
                Cancelar
              </Button>
              <Button type="submit" variant="luxe" size="sm" disabled={pending || text.trim() === ""}>
                {pending ? <Loader2 className="animate-spin" /> : <Check />}
                {pending ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </div>
        </form>
      ) : (
        <p className={cn("whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground")}>{note.body}</p>
      )}
    </li>
  );
}

/**
 * Aba "Observações": lista de anotações da recepção sobre o cliente. Qualquer recepção
 * (de qualquer unidade) pode acrescentar, editar e excluir; cada uma mostra quem escreveu,
 * em qual unidade e quando.
 */
export function CustomerNotes({ slug, customerId, notes }: { slug: string; customerId: string; notes: CustomerNote[] }) {
  // `id` novo a cada aviso: o cartão reinicia (e a contagem do tempo) se vier outro em seguida.
  const [notice, setNotice] = useState<{ id: number; title: string; text: string } | null>(null);
  const notify: Notify = (title, text) => setNotice((n) => ({ id: (n?.id ?? 0) + 1, title, text }));

  return (
    <>
      {notice ? (
        <Notice key={notice.id} title={notice.title} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      ) : null}

      <FormSection
        icon={NotebookPen}
        title="Nova observação"
        description="Visível só para a recepção, em todas as unidades. Você pode adicionar quantas precisar."
      >
        <AddNote slug={slug} customerId={customerId} notify={notify} />
      </FormSection>

      <FormSection
        icon={NotebookPen}
        title={notes.length ? `Observações (${notes.length})` : "Observações"}
        description="Da mais recente para a mais antiga."
      >
        {notes.length === 0 ? (
          <EmptyState
            size="section"
            icon={NotebookPen}
            title="Nenhuma observação ainda"
            description="Anote o que ajuda a atender melhor este cliente: gostos, cuidados, combinados."
          />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {notes.map((n) => (
              <NoteItem key={n.id} slug={slug} customerId={customerId} note={n} notify={notify} />
            ))}
          </ul>
        )}
      </FormSection>
    </>
  );
}

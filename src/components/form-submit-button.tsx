"use client";

import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";

export function FormSubmitButton(props: {
  className?: string;
  disabled?: boolean;
  label: string;
  pendingLabel?: string;
  type?: "submit";
}) {
  const { pending } = useFormStatus();
  const disabled = Boolean(props.disabled || pending);

  return (
    <button
      className={props.className}
      type={props.type ?? "submit"}
      disabled={disabled}
      aria-busy={pending}
    >
      {pending ? <LoaderCircle className="button-spinner" size={17} aria-hidden="true" /> : null}
      {pending ? props.pendingLabel ?? "Memproses…" : props.label}
    </button>
  );
}

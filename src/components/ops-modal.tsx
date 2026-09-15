import type { ComponentProps, ReactNode } from "react";
import type { Route } from "next";
import Link from "next/link";
import { X } from "lucide-react";
import { FormSubmitButton } from "@/components/form-submit-button";

type OpsModalProps = {
  action: ComponentProps<"form">["action"];
  children: ReactNode;
  closeHref: Route;
  eyebrow: string;
  id: string;
  size?: "compact" | "wide";
  submitDisabled?: boolean;
  pendingLabel?: string;
  submitLabel: string;
  title: string;
};

export function OpsModal({
  action,
  children,
  closeHref,
  eyebrow,
  id,
  size,
  submitDisabled = false,
  pendingLabel,
  submitLabel,
  title,
}: OpsModalProps) {
  const className = size ? `ops-modal ${size}` : "ops-modal";

  return (
    <div className="ops-modal-backdrop" role="presentation">
      <form
        action={action}
        aria-labelledby={id}
        aria-modal="true"
        className={className}
        role="dialog"
      >
        <header className="ops-modal-head">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2 id={id}>{title}</h2>
          </div>
          <Link aria-label={`Tutup ${title}`} href={closeHref}>
            <X aria-hidden="true" size={20} />
          </Link>
        </header>

        <div className="ops-modal-body">{children}</div>

        <footer className="ops-modal-footer">
          <FormSubmitButton
            className="primary-button"
            disabled={submitDisabled}
            label={submitLabel}
            pendingLabel={pendingLabel}
          />
        </footer>
      </form>
    </div>
  );
}

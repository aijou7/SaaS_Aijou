import type { ComponentProps, ReactNode } from "react";
import type { Route } from "next";
import Link from "next/link";
import { X } from "lucide-react";

type OpsModalProps = {
  action: ComponentProps<"form">["action"];
  children: ReactNode;
  closeHref: Route;
  eyebrow: string;
  id: string;
  size?: "compact" | "wide";
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
          <button className="primary-button" type="submit">
            {submitLabel}
          </button>
        </footer>
      </form>
    </div>
  );
}

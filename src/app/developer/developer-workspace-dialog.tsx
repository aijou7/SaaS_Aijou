"use client";

import { X } from "lucide-react";
import { useId, useRef } from "react";
import type { ReactNode } from "react";

type DeveloperWorkspaceDialogProps = {
  workspaceName: string;
  ownerEmail: string;
  children: ReactNode;
};

export function DeveloperWorkspaceDialog({
  workspaceName,
  ownerEmail,
  children,
}: DeveloperWorkspaceDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  function openDialog() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;

    dialog.showModal();
    requestAnimationFrame(() => closeButtonRef.current?.focus());
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        className="developer-manage-button"
        type="button"
        aria-haspopup="dialog"
        onClick={openDialog}
      >
        Kelola
      </button>

      <dialog
        ref={dialogRef}
        className="developer-action-dialog"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}
      >
        <div className="developer-action-dialog-shell">
          <header className="developer-action-dialog-header">
            <div>
              <p className="eyebrow">Kelola workspace</p>
              <h2 id={titleId}>{workspaceName}</h2>
              <p id={descriptionId}>{ownerEmail}</p>
            </div>
            <button
              ref={closeButtonRef}
              className="developer-dialog-close"
              type="button"
              aria-label="Tutup kelola workspace"
              onClick={closeDialog}
            >
              <X size={19} aria-hidden="true" />
            </button>
          </header>
          <div className="developer-action-dialog-body">{children}</div>
        </div>
      </dialog>
    </>
  );
}

"use client";

import type { ButtonHTMLAttributes, MouseEvent } from "react";

type ConfirmSubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  confirmation: string;
};

export function ConfirmSubmitButton({
  confirmation,
  onClick,
  type = "submit",
  ...props
}: ConfirmSubmitButtonProps) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (!window.confirm(confirmation)) {
      event.preventDefault();
      return;
    }

    onClick?.(event);
  }

  return <button {...props} type={type} onClick={handleClick} />;
}

"use client";

export function PrintButton() {
  return (
    <button className="primary-button proposal-print-button" type="button" onClick={() => window.print()}>
      Print / Save as PDF
    </button>
  );
}

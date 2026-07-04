// Alert/confirm dialog (SRS §6.3.4.8, §6.3.5). Keyboard accessible: Escape
// cancels, focus starts on Cancel for danger dialogs (destructive default is
// never focused) and on Confirm otherwise, and Tab is trapped inside.
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { useEffect, useRef, type ReactNode } from "react";

export function ConfirmDialog({
  title,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    (danger ? cancelRef : confirmRef).current?.focus();
    return () => previous?.focus?.();
  }, [danger]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
    } else if (e.key === "Tab") {
      // Two-stop focus trap between Cancel and Confirm.
      const stops = [cancelRef.current, confirmRef.current].filter(
        (b): b is HTMLButtonElement => !!b && !b.disabled,
      );
      if (stops.length < 2) return;
      const idx = stops.indexOf(document.activeElement as HTMLButtonElement);
      e.preventDefault();
      stops[(idx + (e.shiftKey ? stops.length - 1 : 1)) % stops.length].focus();
    }
  };

  return (
    <div
      className="sstpa-dialog-overlay"
      onClick={danger ? undefined : onCancel}
      onKeyDown={onKeyDown}
    >
      <div
        ref={dialogRef}
        className="sstpa-frame sstpa-dialog"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        <h2>{title}</h2>
        <div style={{ fontSize: "0.88rem" }}>{children}</div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "var(--sstpa-sp-2)",
            marginTop: "var(--sstpa-sp-4)",
          }}
        >
          <button
            ref={cancelRef}
            className="sstpa-button secondary"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            className={`sstpa-button ${danger ? "danger" : ""}`}
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** "Under Construction" alert (SRS §6.3.2). */
export function UnderConstructionDialog({
  feature,
  onClose,
}: {
  feature: string;
  onClose: () => void;
}) {
  return (
    <div className="sstpa-dialog-overlay" onClick={onClose}>
      <div
        className="sstpa-frame sstpa-dialog"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-label="Under Construction"
      >
        <h2>🚧 Under Construction</h2>
        <p style={{ fontSize: "0.88rem" }}>
          {feature ? `“${feature}” is` : "This feature is"} not yet available in
          this version of SSTPA Tools.
        </p>
        <div style={{ textAlign: "right", marginTop: "var(--sstpa-sp-3)" }}>
          <button className="sstpa-button" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

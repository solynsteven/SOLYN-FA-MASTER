"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ActionResult } from "@/lib/action";

export { cn };

export function Modal({
  open, onClose, title, children, width = "max-w-lg", footer,
}: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: string; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[10vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div className={cn("card w-full border-line-strong bg-ink-900", width)} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h3 className="text-[15px] font-medium text-brand-paper">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-brand-sage hover:bg-ink-700 hover:text-brand-paper" aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({
  open, onClose, title, subtitle, children, footer, width = 560,
}: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  return (
    <div className={cn("fixed inset-0 z-40 transition", open ? "pointer-events-auto" : "pointer-events-none")}>
      <div className={cn("absolute inset-0 bg-black/50 transition-opacity", open ? "opacity-100" : "opacity-0")} onClick={onClose} />
      <aside
        style={{ width: `min(${width}px, 100vw)` }}
        className={cn(
          "absolute right-0 top-0 flex h-full flex-col border-l border-line-strong bg-ink-900 shadow-2xl transition-transform duration-200",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-medium text-brand-paper">{title}</div>
            {subtitle && <div className="mt-0.5 text-xs text-brand-sage">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="rounded p-1 text-brand-sage hover:bg-ink-700 hover:text-brand-paper" aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </aside>
    </div>
  );
}

export function Alert({ kind = "error", children }: { kind?: "error" | "success" | "info"; children: ReactNode }) {
  if (!children) return null;
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-xs",
        kind === "error" && "border-danger/40 bg-danger/10 text-danger",
        kind === "success" && "border-brand-mid/50 bg-brand-green/20 text-brand-mist",
        kind === "info" && "border-line-strong bg-ink-850 text-brand-mist",
      )}
    >
      {children}
    </div>
  );
}

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "green" | "mid" | "warn" | "danger" | "outline"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-2xs font-medium leading-4",
        tone === "neutral" && "bg-ink-700 text-brand-mist",
        tone === "green" && "bg-brand-green text-brand-paper",
        tone === "mid" && "bg-brand-mid/40 text-brand-mist",
        tone === "warn" && "bg-warn/15 text-warn",
        tone === "danger" && "bg-danger/15 text-danger",
        tone === "outline" && "border border-line-strong text-brand-sage",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** 调用 Server Action 的小工具：统一 loading / 错误 / 成功处理 */
export function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  function exec<T>(fn: () => Promise<ActionResult<T>>, onOk?: (r: { data?: T }) => void) {
    setError(null);
    setMessage(null);
    start(async () => {
      const r = await fn();
      if (r.ok) {
        setMessage(r.message ?? null);
        onOk?.(r);
      } else setError(r.error);
    });
  }
  return { pending, error, message, exec, setError };
}

export function ConfirmButton({
  onConfirm, children, className, title = "确认操作", body, confirmText = "确认", disabled,
}: { onConfirm: () => void; children: ReactNode; className?: string; title?: string; body: ReactNode; confirmText?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} disabled={disabled}>
        {children}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpen(false)}>取消</button>
            <button
              className="btn border border-danger/50 bg-danger/15 text-danger hover:bg-danger/25"
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
            >
              {confirmText}
            </button>
          </>
        }
      >
        <div className="text-sm leading-relaxed text-brand-mist">{body}</div>
      </Modal>
    </>
  );
}

export function EmptyState({ icon, title, desc, action }: { icon?: ReactNode; title: string; desc?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {icon && <div className="mb-3 text-brand-sage">{icon}</div>}
      <div className="text-sm font-medium text-brand-paper">{title}</div>
      {desc && <div className="mt-1.5 max-w-md text-xs leading-relaxed text-brand-sage">{desc}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition disabled:opacity-40",
        checked ? "bg-brand-mid" : "bg-ink-600",
      )}
    >
      <span className={cn("inline-block h-4 w-4 rounded-full bg-brand-paper transition", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
  );
}

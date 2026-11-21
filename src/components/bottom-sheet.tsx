import React, { useEffect, useId, useRef } from "react";
import { QRCode } from "antd";
import { Download, Copy, X } from "lucide-react";
import { useCopy } from "../hooks/use-copy";

export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  const titleId = useId();
  const subtitleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const sheet = sheetRef.current;
    sheet?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); }
      if (event.key !== "Tab" || !sheet) return;
      const elements = [...sheet.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex="0"]')].filter((el) => !el.matches(":disabled") && el.getClientRects().length > 0);
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); sheet.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === sheet)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === sheet)) { event.preventDefault(); first.focus(); }
    };
    sheet?.addEventListener("keydown", handleKey);
    return () => {
      sheet?.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);
  if (!open) return null;

  return (
    <div
      className="m-mask"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={sheetRef} className="m-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={subtitle ? subtitleId : undefined} tabIndex={-1}>
        <div className="m-sheet-handle" />
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0 flex-1">
            <div id={titleId} className="text-base font-extrabold leading-snug break-words">{title}</div>
            {subtitle && (
              <div id={subtitleId} className="text-[11px] font-mono text-[var(--ink-3)] mt-0.5 break-all">{subtitle}</div>
            )}
          </div>
          <button
            type="button"
            aria-label="关闭面板"
            onClick={onClose}
            className="w-8 h-8 shrink-0 rounded-sm border border-[var(--line)] flex items-center justify-center text-[var(--ink-3)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function MobileQRModal({
  open,
  onClose,
  code,
  shortUrl,
  targetLabel,
}: {
  open: boolean;
  onClose: () => void;
  code: string;
  shortUrl: string;
  targetLabel?: string;
}) {
  const copy = useCopy();
  const wrapRef = useRef<HTMLDivElement>(null);

  const handleDownload = () => {
    const canvas = wrapRef.current?.querySelector<HTMLCanvasElement>("canvas");
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `stub-${code || "qrcode"}.png`;
    a.click();
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="票据二维码 · QR Stub"
      subtitle={`/r/${code}`}
    >
      <div className="m-ticket text-center">
        <div className="text-xs font-mono font-bold text-[var(--accent)] mb-2 break-all">
          {shortUrl}
        </div>
        <div
          ref={wrapRef}
          className="inline-flex flex-col items-center gap-1.5 rounded-sm border border-[var(--line-strong)] bg-[#fbf8f1] p-3 text-[#17150f]"
        >
          <QRCode
            value={shortUrl || "https://stubapi.mikasa.wiki"}
            size={188}
            color="#17150f"
            bgColor="#fbf8f1"
            icon="/favicon.svg"
            iconSize={34}
            bordered={false}
          />
          <span className="font-mono text-[11px] font-bold text-[#4a463c]">/r/{code}</span>
        </div>
        {targetLabel && (
          <div className="text-[11px] font-mono text-[var(--ink-3)] mt-2 truncate px-2">
            目标：{targetLabel}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-dashed border-[var(--line)]">
          <button
            type="button"
            className="stub-btn stub-btn-ghost w-full py-2 text-xs"
            onClick={() => copy(shortUrl, "已复制短链")}
          >
            <Copy className="w-3.5 h-3.5" /> 复制链接
          </button>
          <button
            type="button"
            className="stub-btn stub-btn-primary w-full py-2 text-xs"
            onClick={handleDownload}
          >
            <Download className="w-3.5 h-3.5" /> 保存二维码
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

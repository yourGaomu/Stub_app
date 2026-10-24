import React, { useRef } from "react";
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
  if (!open) return null;

  return (
    <div
      className="m-mask"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="m-sheet">
        <div className="m-sheet-handle" />
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <div className="text-base font-extrabold leading-snug">{title}</div>
            {subtitle && (
              <div className="text-[11px] font-mono text-[var(--ink-3)] mt-0.5">{subtitle}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-sm border border-[var(--line)] flex items-center justify-center text-[var(--ink-3)]"
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
      subtitle={`/s/${code}`}
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
          <span className="font-mono text-[11px] font-bold text-[#4a463c]">/s/{code}</span>
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

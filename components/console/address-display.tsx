"use client";

import { Check, Copy } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";

/**
 * A labeled value with an explicit copy button that shows "已复制" feedback for
 * 2s. Copy silently no-ops if the Clipboard API is unavailable (non-HTTPS / old
 * browser); production is HTTPS so it works.
 */
export function CopyableField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function onCopy() {
    try {
      await navigator.clipboard?.writeText(value);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — leave the UI unchanged.
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="max-w-full truncate rounded bg-muted px-2 py-1 font-mono text-xs">
          {value}
        </span>
        <button
          type="button"
          onClick={() => void onCopy()}
          aria-label={`复制${label}`}
          title="复制"
          className="inline-flex shrink-0 items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-muted"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? "已复制" : "复制"}
        </button>
      </div>
    </div>
  );
}

/**
 * Scannable QR of the raw deposit address. Fixed black-on-white (with a quiet
 * zone) regardless of theme so wallet scanners get reliable contrast. Renders
 * nothing when the address is empty.
 */
export function AddressQR({
  address,
  label = "充值地址二维码",
}: {
  address: string;
  label?: string;
}) {
  if (!address) return null;
  return (
    <div className="flex w-fit flex-col items-center gap-1">
      <div className="rounded-lg bg-white p-3">
        <QRCodeSVG value={address} size={140} title={label} />
      </div>
      <span className="text-xs text-muted-foreground">扫码转账到充值地址</span>
    </div>
  );
}

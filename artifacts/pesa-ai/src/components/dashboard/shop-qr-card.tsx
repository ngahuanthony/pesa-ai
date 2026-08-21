import { useEffect, useRef, useState, useCallback } from "react";
import QRCode from "qrcode";
import { Download, QrCode } from "lucide-react";

interface ShopQRCardProps {
  businessName: string;
  phone: string; // raw phone from waStatus or business profile
}

/** Normalise any Kenyan phone format → digits only with country code, e.g. "254712345678" */
function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0"))   return "254" + digits.slice(1);
  if (digits.startsWith("7") || digits.startsWith("1")) return "254" + digits;
  return digits;
}

function displayPhone(raw: string): string {
  const n = normalisePhone(raw);
  // +254 7XX XXX XXX
  if (n.length === 12 && n.startsWith("254")) {
    return `+${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6, 9)} ${n.slice(9)}`;
  }
  return `+${n}`;
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
): number {
  const words = text.split(" ");
  let line = "";
  let currentY = y;
  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + " ";
    if (ctx.measureText(testLine).width > maxWidth && i > 0) {
      ctx.fillText(line.trim(), x, currentY);
      line = words[i] + " ";
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trim(), x, currentY);
  return currentY;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function ShopQRCard({ businessName, phone }: ShopQRCardProps) {
  const previewRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const waPhone = normalisePhone(phone);
  const waUrl   = `https://wa.me/${waPhone}`;

  /** Compose the full-res print card onto a canvas and return it */
  const buildCanvas = useCallback(async (W: number, H: number): Promise<HTMLCanvasElement> => {
    // 1. Generate QR at high resolution
    const qrSize = Math.round(W * 0.62);
    const qrDataUrl: string = await QRCode.toDataURL(waUrl, {
      width: qrSize,
      margin: 2,
      color: { dark: "#111111", light: "#ffffff" },
    });

    const qrImg = new Image();
    qrImg.src = qrDataUrl;
    await new Promise<void>((res) => { qrImg.onload = () => res(); });

    // 2. Build canvas
    const canvas = document.createElement("canvas");
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;

    const PAD = Math.round(W * 0.065);

    // Background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    // Top green header band
    const headerH = Math.round(H * 0.22);
    ctx.fillStyle = "#25D366";
    roundRect(ctx, 0, 0, W, headerH + 40, 0);
    ctx.fill();
    ctx.fillStyle = "#25D366";
    ctx.fillRect(0, headerH, W, 40);

    // WhatsApp "W" icon circle
    const iconR = Math.round(W * 0.075);
    const iconX = W / 2;
    const iconY = Math.round(headerH * 0.30);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.beginPath();
    ctx.arc(iconX, iconY, iconR + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(iconX, iconY, iconR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#25D366";
    ctx.font = `bold ${Math.round(iconR * 1.1)}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("W", iconX, iconY + 1);

    // Business name
    ctx.textBaseline = "alphabetic";
    const nameFontSize = Math.round(W * 0.058);
    ctx.font = `bold ${nameFontSize}px Arial`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    wrapCanvasText(ctx, businessName.toUpperCase(), W / 2, Math.round(headerH * 0.60), W - PAD * 2, nameFontSize * 1.25);

    // "WhatsApp Shop" sub-label
    const subFontSize = Math.round(W * 0.028);
    ctx.font = `${subFontSize}px Arial`;
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.fillText("WhatsApp Shop", W / 2, Math.round(headerH * 0.88));

    // QR code area — white card
    const qrAreaPad = PAD;
    const qrCardX = qrAreaPad;
    const qrCardY = headerH + 32;
    const qrCardW = W - qrAreaPad * 2;
    const qrCardH = Math.round(H * 0.51);
    ctx.fillStyle = "#f9fafb";
    roundRect(ctx, qrCardX, qrCardY, qrCardW, qrCardH, 16);
    ctx.fill();

    const qrDrawSize = Math.round(qrCardW * 0.82);
    const qrX = Math.round((W - qrDrawSize) / 2);
    const qrY = qrCardY + Math.round((qrCardH - qrDrawSize) / 2);
    ctx.drawImage(qrImg, qrX, qrY, qrDrawSize, qrDrawSize);

    // Divider
    const divY = qrCardY + qrCardH + Math.round(H * 0.04);
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(PAD, divY);
    ctx.lineTo(W - PAD, divY);
    ctx.stroke();
    ctx.setLineDash([]);

    // "Scan here" call to action
    const ctaFontSize = Math.round(W * 0.038);
    ctx.font = `bold ${ctaFontSize}px Arial`;
    ctx.fillStyle = "#111827";
    ctx.fillText("📱  Scan here to browse & order", W / 2, divY + Math.round(H * 0.055));

    // Phone number
    const phoneFontSize = Math.round(W * 0.03);
    ctx.font = `${phoneFontSize}px Arial`;
    ctx.fillStyle = "#6b7280";
    ctx.fillText(displayPhone(phone), W / 2, divY + Math.round(H * 0.105));

    // Powered by
    const pfSize = Math.round(W * 0.025);
    ctx.font = `${pfSize}px Arial`;
    ctx.fillStyle = "#9ca3af";
    ctx.fillText("WhatsApp Shop  ·  Pesa AI", W / 2, H - Math.round(H * 0.04));

    // Border
    ctx.strokeStyle = "#25D366";
    ctx.lineWidth = Math.round(W * 0.008);
    ctx.setLineDash([]);
    roundRect(ctx, ctx.lineWidth / 2, ctx.lineWidth / 2, W - ctx.lineWidth, H - ctx.lineWidth, 20);
    ctx.stroke();

    return canvas;
  }, [waUrl, businessName, phone]);

  // Render preview into the visible canvas
  useEffect(() => {
    if (!previewRef.current || !phone || !businessName) return;
    setReady(false);
    buildCanvas(480, 680).then((src) => {
      const dst = previewRef.current!;
      dst.width  = src.width;
      dst.height = src.height;
      dst.getContext("2d")!.drawImage(src, 0, 0);
      setReady(true);
    });
  }, [buildCanvas, phone, businessName]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      // Print-ready: ~A5 at 180 DPI
      const canvas = await buildCanvas(1050, 1480);
      const link = document.createElement("a");
      link.download = `${businessName.replace(/\s+/g, "-")}-WhatsApp-Shop-QR.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally {
      setDownloading(false);
    }
  };

  if (!phone) return null;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Preview */}
      <div className="relative rounded-xl overflow-hidden shadow-md border border-border">
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
            <QrCode className="h-8 w-8 text-muted-foreground animate-pulse" />
          </div>
        )}
        <canvas
          ref={previewRef}
          className="block max-w-[220px] w-full"
          style={{ opacity: ready ? 1 : 0 }}
        />
      </div>

      {/* Download button */}
      <button
        onClick={handleDownload}
        disabled={!ready || downloading}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-sm"
      >
        <Download className="h-4 w-4" />
        {downloading ? "Generating…" : "Download Print-Ready PNG"}
      </button>

      <p className="text-[11px] text-muted-foreground text-center max-w-[220px]">
        High-res PNG · Print on A5 or stick on your counter
      </p>
    </div>
  );
}

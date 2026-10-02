import { useEffect, useRef, useState, useCallback } from "react";
import QRCode from "qrcode";
import { Download, QrCode } from "lucide-react";
import { BRAND_NAME } from "@/constants/brand";
import { getShopEntryPrompt, normalizeKenyanWhatsAppNumber } from "@/lib/shop-entry-prompt";

interface ShopQRCardProps {
  businessName: string;
  phone: string; // raw phone from waStatus or business profile
  shopSlug?: string;
  whatsappReady: boolean;
}

/** Normalise any Kenyan phone format → digits only with country code, e.g. "254712345678" */
function normalisePhone(raw: string): string {
  return normalizeKenyanWhatsAppNumber(raw);
}

function displayPhone(raw: string): string {
  const n = normalisePhone(raw);
  // +254 7XX XXX XXX
  if (n.length === 12 && n.startsWith("254")) {
    return `+${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6, 9)} ${n.slice(9)}`;
  }
  return `+${n}`;
}

function slugifyShopName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "shop";
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

export function ShopQRCard({ businessName, phone, shopSlug, whatsappReady }: ShopQRCardProps) {
  const previewRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);

  const publicShopPath = `/shop/${encodeURIComponent(shopSlug || slugifyShopName(businessName))}`;
  const shopUrl = `${window.location.origin}${publicShopPath}`;
  const whatsappPhone = normalisePhone(phone);
  const hasWhatsappNumber = /^254\d{9}$/.test(whatsappPhone);
  const isHotel = businessName.trim().toLowerCase() === "skyview opal hotel";
  const whatsappQrReady = whatsappReady && hasWhatsappNumber;
  const whatsappUrl = hasWhatsappNumber
    ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(getShopEntryPrompt(businessName))}`
    : shopUrl;
  const canDownload = hasWhatsappNumber ? whatsappQrReady : true;

  /** Compose the full-res print card onto a canvas and return it */
  const buildCanvas = useCallback(async (W: number, H: number): Promise<HTMLCanvasElement> => {
    // 1. Generate QR at high resolution
    const qrSize = Math.round(W * 0.62);
    const qrDataUrl: string = await QRCode.toDataURL(whatsappUrl, {
      width: qrSize,
      margin: 2,
      color: { dark: "#111111", light: "#ffffff" },
    });

    const qrImg = new Image();
    qrImg.src = qrDataUrl;
    await new Promise<void>((resolve, reject) => {
      qrImg.onload = () => resolve();
      qrImg.onerror = () => reject(new Error("The QR image could not be loaded."));
    });

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
    const headerH = Math.round(H * 0.16);
    ctx.fillStyle = "#25D366";
    roundRect(ctx, 0, 0, W, headerH + 40, 0);
    ctx.fill();
    ctx.fillStyle = "#25D366";
    ctx.fillRect(0, headerH, W, 40);

    // Business name
    ctx.textBaseline = "alphabetic";
    const nameFontSize = Math.round(W * 0.058);
    ctx.font = `bold ${nameFontSize}px Arial`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    wrapCanvasText(ctx, businessName.toUpperCase(), W / 2, Math.round(headerH * 0.48), W - PAD * 2, nameFontSize * 1.25);

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
    ctx.fillText(
      hasWhatsappNumber
        ? isHotel ? "📱  Scan to explore hotel services" : "📱  Scan to ask about menu & items"
        : "📱  Scan here to browse & order",
      W / 2,
      divY + Math.round(H * 0.055)
    );

    // Phone number
    const phoneFontSize = Math.round(W * 0.03);
    ctx.font = `${phoneFontSize}px Arial`;
    ctx.fillStyle = "#6b7280";
    ctx.fillText(displayPhone(phone), W / 2, divY + Math.round(H * 0.105));

    // Powered by
    const pfSize = Math.round(W * 0.025);
    ctx.font = `${pfSize}px Arial`;
    ctx.fillStyle = "#9ca3af";
    ctx.fillText(`Powered by ${BRAND_NAME}`, W / 2, H - Math.round(H * 0.04));

    // Border
    ctx.strokeStyle = "#25D366";
    ctx.lineWidth = Math.round(W * 0.008);
    ctx.setLineDash([]);
    roundRect(ctx, ctx.lineWidth / 2, ctx.lineWidth / 2, W - ctx.lineWidth, H - ctx.lineWidth, 20);
    ctx.stroke();

    return canvas;
  }, [whatsappUrl, businessName, phone, hasWhatsappNumber, isHotel]);

  // Render preview into the visible canvas
  useEffect(() => {
    if (!previewRef.current) return;
    setReady(false);
    setQrError(null);
    if (!phone || !businessName || (hasWhatsappNumber && !whatsappReady)) {
      const context = previewRef.current.getContext("2d");
      context?.clearRect(0, 0, previewRef.current.width, previewRef.current.height);
      return;
    }
    buildCanvas(480, 680).then((src) => {
      const dst = previewRef.current!;
      dst.width  = src.width;
      dst.height = src.height;
      dst.getContext("2d")!.drawImage(src, 0, 0);
      setReady(true);
    }).catch((error) => {
      console.error("Failed to generate shop QR:", error);
      setQrError("The QR preview could not be generated. Please try again.");
    });
  }, [buildCanvas, phone, businessName, hasWhatsappNumber, whatsappReady]);

  const handleDownload = async () => {
    if (!canDownload || !ready) return;
    setDownloading(true);
    setQrError(null);
    try {
      // Print-ready: ~A5 at 180 DPI
      const canvas = await buildCanvas(1050, 1480);
      const link = document.createElement("a");
      link.download = `${businessName.replace(/\s+/g, "-")}-WhatsApp-Shop-QR.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (error) {
      console.error("Failed to download shop QR:", error);
      setQrError("The print-ready QR could not be generated. Please try again.");
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

      <p className="max-w-[280px] text-center text-sm text-muted-foreground">
        {hasWhatsappNumber && !whatsappReady
          ? "The WhatsApp QR is not ready to share yet. Customer-message readiness must be active first."
          : hasWhatsappNumber
            ? isHotel
              ? "Customers can ask about dining, rooms, the pool, conferences, and events on WhatsApp."
              : "Customers can ask on WhatsApp about your menu, items, stock, and prices."
            : "Connect a verified Duka number to enable WhatsApp chat. The web shop is available below."}
      </p>
      {qrError && <p role="alert" className="max-w-[280px] text-center text-xs text-destructive">{qrError}</p>}
      {hasWhatsappNumber && !whatsappReady && (
        <p role="status" data-testid="status-whatsapp-qr-readiness" className="max-w-[280px] text-center text-xs font-medium text-amber-700">
          Not ready to download or share as a WhatsApp QR.
        </p>
      )}
      {ready && canDownload && (
        <p role="status" className="max-w-[280px] text-center text-xs font-medium text-emerald-700">
          {hasWhatsappNumber ? "WhatsApp QR is ready to download and share." : "Web shop QR is ready to download and share."}
        </p>
      )}
      <div className="flex w-full max-w-[280px] flex-col gap-2">
        {hasWhatsappNumber && whatsappReady && (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-lg bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#20bd5a] transition-colors"
          >
            Open WhatsApp chat
          </a>
        )}
        <a
          href={shopUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center rounded-lg border border-primary/20 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5 transition-colors"
        >
          Open public web shop
        </a>
      </div>

      <p className="text-[11px] text-muted-foreground text-center max-w-[220px]">
        {hasWhatsappNumber
          ? whatsappReady ? "WhatsApp QR · Web shop link available as a fallback" : "WhatsApp QR unavailable until customer replies are active"
          : "Web shop QR"}
      </p>
    </div>
  );
}

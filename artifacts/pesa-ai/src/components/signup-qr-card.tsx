import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Download, ExternalLink, QrCode } from "lucide-react";
import { BRAND_NAME } from "@/constants/brand";

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export function SignupQRCard() {
  const previewRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const signupUrl = typeof window === "undefined" ? "/signup" : `${window.location.origin}/signup`;

  const buildCanvas = useCallback(async (width: number, height: number) => {
    const qrDataUrl = await QRCode.toDataURL(signupUrl, {
      width: Math.round(width * 0.62),
      margin: 2,
      color: { dark: "#111111", light: "#ffffff" },
    });
    const qrImage = new Image();
    qrImage.src = qrDataUrl;
    await new Promise<void>((resolve) => {
      qrImage.onload = () => resolve();
    });

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available");

    const pad = Math.round(width * 0.065);
    const headerHeight = Math.round(height * 0.2);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#0a4a3a";
    ctx.fillRect(0, 0, width, headerHeight);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = `bold ${Math.round(width * 0.055)}px Arial`;
    ctx.fillText("WHATSAPP SHOP", width / 2, Math.round(headerHeight * 0.45));
    ctx.font = `${Math.round(width * 0.032)}px Arial`;
    ctx.fillText("Create your shop in minutes", width / 2, Math.round(headerHeight * 0.7));

    const cardY = headerHeight + Math.round(height * 0.04);
    const cardHeight = Math.round(height * 0.52);
    ctx.fillStyle = "#f7faf8";
    roundRect(ctx, pad, cardY, width - pad * 2, cardHeight, 18);
    ctx.fill();
    const qrSize = Math.round((width - pad * 2) * 0.8);
    ctx.drawImage(
      qrImage,
      Math.round((width - qrSize) / 2),
      cardY + Math.round((cardHeight - qrSize) / 2),
      qrSize,
      qrSize,
    );

    ctx.fillStyle = "#0a4a3a";
    ctx.font = `bold ${Math.round(width * 0.042)}px Arial`;
    ctx.fillText("Scan to sign up", width / 2, cardY + cardHeight + Math.round(height * 0.09));
    ctx.fillStyle = "#64748b";
    ctx.font = `${Math.round(width * 0.028)}px Arial`;
    ctx.fillText("Start selling on WhatsApp", width / 2, cardY + cardHeight + Math.round(height * 0.135));
    ctx.fillStyle = "#9ca3af";
    ctx.font = `${Math.round(width * 0.024)}px Arial`;
    ctx.fillText(`Powered by ${BRAND_NAME}`, width / 2, height - Math.round(height * 0.04));

    ctx.strokeStyle = "#25D366";
    ctx.lineWidth = Math.round(width * 0.008);
    roundRect(ctx, ctx.lineWidth / 2, ctx.lineWidth / 2, width - ctx.lineWidth, height - ctx.lineWidth, 20);
    ctx.stroke();
    return canvas;
  }, [signupUrl]);

  useEffect(() => {
    if (!previewRef.current) return;
    setReady(false);
    buildCanvas(420, 560).then((source) => {
      const target = previewRef.current;
      if (!target) return;
      target.width = source.width;
      target.height = source.height;
      target.getContext("2d")?.drawImage(source, 0, 0);
      setReady(true);
    });
  }, [buildCanvas]);

  const download = async () => {
    setDownloading(true);
    try {
      const canvas = await buildCanvas(1050, 1480);
      const link = document.createElement("a");
      link.download = "pesa-ai-whatsapp-shop-signup-qr.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="w-full max-w-[310px] rounded-3xl border border-[#d9e8df] bg-white p-5 text-center shadow-sm">
      <div className="flex items-center justify-center gap-2 text-sm font-extrabold text-[#0a4a3a]">
        <QrCode className="h-4 w-4 text-[#25a85a]" />
        Print this signup QR
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        Put it on your counter or campaign flyer. Customers scan and start a WhatsApp Shop.
      </p>
      <div className="relative mx-auto mt-4 w-fit overflow-hidden rounded-xl border border-slate-100 shadow-sm">
        <canvas ref={previewRef} className="block w-[190px]" style={{ opacity: ready ? 1 : 0 }} />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#f7faf8]">
            <QrCode className="h-8 w-8 animate-pulse text-[#25a85a]" />
          </div>
        )}
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={download}
          disabled={!ready || downloading}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0a4a3a] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {downloading ? "Generating…" : "Download print-ready PNG"}
        </button>
        <a
          href="/signup"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#0a4a3a]/20 px-4 py-2.5 text-xs font-bold text-[#0a4a3a]"
        >
          <ExternalLink className="h-4 w-4" />
          Open signup
        </a>
      </div>
      <p className="mt-3 text-[11px] text-slate-400">
        A5-ready · Generic campaign QR · No merchant number required
      </p>
    </div>
  );
}
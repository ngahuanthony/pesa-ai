import { useEffect, useRef, useState } from "react";
import { Camera, ExternalLink, Link as LinkIcon, LoaderCircle, QrCode, Search, Upload, X } from "lucide-react";
import { useLocation } from "wouter";

type PublicShop = {
  name: string;
  category: string | null;
  location: string | null;
  logoUrl: string | null;
  imageUrl: string | null;
  slug: string;
  url: string;
};

function extractShopSlug(value: string): string | null {
  try {
    const parsed = new URL(value.trim(), window.location.origin);
    const match = parsed.pathname.match(/^\/shop\/([^/]+)\/?$/i);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function ShopSearch() {
  const [phone, setPhone] = useState("");
  const [shops, setShops] = useState<PublicShop[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "empty" | "error">("idle");
  const [, setLocation] = useLocation();

  async function search(event: React.FormEvent) {
    event.preventDefault();
    setState("loading");
    setShops([]);
    try {
      const response = await fetch(`/api/find-by-phone?phone=${encodeURIComponent(phone)}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "We could not find that shop");
      const foundShops = Array.isArray(body.shops) ? body.shops : [];
      setShops(foundShops);
      setState(foundShops.length ? "idle" : "empty");
      if (foundShops.length === 1) {
        setLocation(`/shop/${encodeURIComponent(foundShops[0].slug)}`);
      }
    } catch {
      setState("error");
    }
  }

  return (
    <section id="find-shop" className="rounded-3xl border border-[#d9e8df] bg-[#f7faf8] p-6 md:p-8">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#0a4a3a] text-white">
          <Search className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#25a85a]">Find a shop</p>
          <h2 className="mt-1 text-2xl font-extrabold text-[#0a4a3a]">Search by the shop number</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">Use the public WhatsApp number, such as 0792 717 918 or +254 792 717 918.</p>
        </div>
      </div>
      <form onSubmit={search} className="mt-5 flex flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor="shop-phone-search">Shop WhatsApp number</label>
        <input
          id="shop-phone-search"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          inputMode="tel"
          autoComplete="tel"
          placeholder="0792 717 918"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-[#25a85a] focus:ring-2"
        />
        <button type="submit" disabled={state === "loading"} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0a4a3a] px-5 py-3 text-sm font-bold text-white disabled:opacity-60">
          {state === "loading" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Find shop
        </button>
      </form>
      {state === "error" && <p role="alert" className="mt-3 text-sm font-medium text-red-700">Enter a complete Kenyan shop number and try again.</p>}
      {state === "empty" && <p className="mt-3 text-sm text-slate-600">No public shop is registered to that number.</p>}
      {shops.length > 0 && (
        <div className="mt-5 grid gap-3">
          {shops.map((shop) => (
            <button key={shop.slug} type="button" onClick={() => setLocation(`/shop/${encodeURIComponent(shop.slug)}`)} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-[#25a85a] hover:shadow-sm">
              {shop.imageUrl || shop.logoUrl ? <img src={shop.imageUrl || shop.logoUrl || ""} alt="" className="h-12 w-12 rounded-xl object-cover" /> : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#e7f7ed] text-lg font-extrabold text-[#0a4a3a]">{shop.name.slice(0, 1).toUpperCase()}</span>}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-[#0a4a3a]">{shop.name}</span>
                <span className="mt-1 block truncate text-xs text-slate-500">{[shop.category, shop.location].filter(Boolean).join(" · ") || "Public Pesa AI shop"}</span>
              </span>
              <ExternalLink className="h-4 w-4 shrink-0 text-[#25a85a]" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function ShopScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pastedLink, setPastedLink] = useState("");
  const [, setLocation] = useLocation();

  function openShopFromValue(value: string) {
    const slug = extractShopSlug(value);
    if (!slug) {
      setMessage("That QR code is not a Pesa AI public shop link.");
      return;
    }
    stopCamera();
    setLocation(`/shop/${encodeURIComponent(slug)}`);
  }

  function stopCamera() {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function startCamera() {
    setOpen(true);
    setMessage("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("Camera scanning is not available here. Upload a QR image or paste the shop link.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const BarcodeDetectorCtor = (window as Window & { BarcodeDetector?: new (options?: { formats?: string[] }) => { detect(source: HTMLVideoElement | File): Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector;
      if (!BarcodeDetectorCtor) {
        setMessage("Live QR scanning is not supported by this browser. Upload a QR image or paste the shop link.");
        return;
      }
      const detector = new BarcodeDetectorCtor({ formats: ["qr_code"] });
      const scan = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes[0]?.rawValue) {
            openShopFromValue(codes[0].rawValue);
            return;
          }
        } catch {
          // The next animation frame can still recover from a transient read.
        }
        frameRef.current = requestAnimationFrame(scan);
      };
      frameRef.current = requestAnimationFrame(scan);
    } catch (error) {
      setMessage(error instanceof DOMException && error.name === "NotAllowedError" ? "Camera access was blocked. Use upload or paste-link instead." : "We could not start the camera. Use upload or paste-link instead.");
    }
  }

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const BarcodeDetectorCtor = (window as Window & { BarcodeDetector?: new (options?: { formats?: string[] }) => { detect(source: HTMLVideoElement | File): Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector;
    if (!BarcodeDetectorCtor) {
      setMessage("This browser cannot read QR images. Paste the shop link instead.");
      return;
    }
    try {
      const codes = await new BarcodeDetectorCtor({ formats: ["qr_code"] }).detect(file);
      if (codes[0]?.rawValue) openShopFromValue(codes[0].rawValue);
      else setMessage("No QR code was found in that image.");
    } catch {
      setMessage("We could not read that image. Try a clearer QR photo or paste the shop link.");
    } finally {
      event.target.value = "";
    }
  }

  useEffect(() => () => stopCamera(), []);

  return (
    <section id="scan-shop" className="rounded-3xl border border-[#d9e8df] bg-white p-6 shadow-sm md:p-8">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#e7f7ed] text-[#0a4a3a]"><QrCode className="h-5 w-5" /></span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#25a85a]">Scan a shop QR</p>
          <h2 className="mt-1 text-2xl font-extrabold text-[#0a4a3a]">Open a shop without typing</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">Your camera only starts after you tap scan. Pesa AI QR codes open public shop pages, not merchant accounts.</p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={startCamera} className="inline-flex items-center gap-2 rounded-xl bg-[#0a4a3a] px-5 py-3 text-sm font-bold text-white"><Camera className="h-4 w-4" /> Scan with camera</button>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#0a4a3a]/20 px-5 py-3 text-sm font-bold text-[#0a4a3a]"><Upload className="h-4 w-4" /> Upload QR image<input type="file" accept="image/*" className="sr-only" onChange={handleImageUpload} /></label>
      </div>
      {open && (
        <div className="mt-5 rounded-2xl bg-slate-950 p-3">
          <div className="flex items-center justify-between px-1 pb-3 text-sm font-semibold text-white"><span>Point your camera at the QR code</span><button type="button" onClick={() => { stopCamera(); setOpen(false); }} aria-label="Close scanner"><X className="h-4 w-4" /></button></div>
          <video ref={videoRef} className="aspect-square w-full rounded-xl object-cover sm:max-h-[360px]" playsInline muted />
        </div>
      )}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1"><LinkIcon className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><input value={pastedLink} onChange={(event) => setPastedLink(event.target.value)} placeholder="Or paste a Pesa AI shop link" className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-[#25a85a]" /></div>
        <button type="button" onClick={() => openShopFromValue(pastedLink)} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700">Open link</button>
      </div>
      {message && <p role="alert" className="mt-3 text-sm text-amber-800">{message}</p>}
    </section>
  );
}

export function ShopDiscovery() {
  return (
    <section className="mx-auto grid max-w-6xl gap-5 px-5 py-8 md:grid-cols-2">
      <ShopScanner />
      <ShopSearch />
    </section>
  );
}

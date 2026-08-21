import { useState, useRef, useCallback } from "react";
import { useGetMe, getListProductsQueryKey } from "@workspace/api-client-react";
import { Camera, X, Check, Loader2, RotateCcw, Package, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

type Phase = "idle" | "analyzing" | "review" | "done";

interface PhotoItem {
  id: string;
  file: File;
  previewUrl: string;
}

interface Draft {
  tempId: string;
  name: string;
  suggestedPrice: number;
  description: string;
  category: string;
  imageDataUrl: string;
  filename: string;
  error?: string;
  // editable review state
  approved: boolean;
  editedName: string;
  editedPrice: string;
  editedDescription: string;
  editedStockQty: string;
}

const MAX_PHOTOS = 20;
const MAX_SIDE   = 1024; // px — resize before upload to keep payload reasonable

// Resize and JPEG-compress a File to a base64 data URL.
async function resizeAndEncode(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export function PhotoScanTab() {
  const { data: me }  = useGetMe();
  const businessId    = (me as any)?.business?.id || "";
  const { toast }     = useToast();
  const qc            = useQueryClient();

  const [phase,      setPhase]      = useState<Phase>("idle");
  const [photos,     setPhotos]     = useState<PhotoItem[]>([]);
  const [progress,   setProgress]   = useState({ done: 0, total: 0 });
  const [drafts,     setDrafts]     = useState<Draft[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [doneCount,  setDoneCount]  = useState(0);

  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    const slots  = MAX_PHOTOS - photos.length;
    const toAdd  = images.slice(0, slots).map((f) => ({
      id: `${Date.now()}-${Math.random()}`,
      file: f,
      previewUrl: URL.createObjectURL(f),
    }));
    if (toAdd.length < images.length) {
      toast({ title: `Only ${MAX_PHOTOS} photos per batch`, description: `${images.length - toAdd.length} photo(s) not added.` });
    }
    setPhotos((prev) => [...prev, ...toAdd]);
  }, [photos.length, toast]);

  const removePhoto = (id: string) => {
    setPhotos((prev) => {
      const p = prev.find((x) => x.id === id);
      if (p) URL.revokeObjectURL(p.previewUrl);
      return prev.filter((x) => x.id !== id);
    });
  };

  const handleAnalyze = async () => {
    if (!photos.length || !businessId) return;
    setPhase("analyzing");
    setProgress({ done: 0, total: photos.length });

    try {
      const encoded: { dataUrl: string; filename: string }[] = [];
      for (let i = 0; i < photos.length; i++) {
        const dataUrl = await resizeAndEncode(photos[i].file);
        encoded.push({ dataUrl, filename: photos[i].file.name });
        setProgress({ done: i + 1, total: photos.length });
      }

      const res = await fetch(`/api/businesses/${businessId}/photo-scan`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos: encoded }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || "Analysis failed");
      }

      const { drafts: raw } = await res.json();
      setDrafts(
        (raw as any[]).map((d) => ({
          ...d,
          approved:          true,
          editedName:        d.name,
          editedPrice:       d.suggestedPrice > 0 ? String(d.suggestedPrice) : "",
          editedDescription: d.description || "",
          editedStockQty:    "0",
        }))
      );
      setPhase("review");
    } catch (err: any) {
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
      setPhase("idle");
    }
  };

  const updateDraft = (tempId: string, field: keyof Draft, value: any) =>
    setDrafts((prev) => prev.map((d) => d.tempId === tempId ? { ...d, [field]: value } : d));

  const handleConfirm = async () => {
    const approved = drafts.filter((d) => d.approved);
    const invalid  = approved.filter((d) => !d.editedName.trim() || !d.editedPrice || Number(d.editedPrice) <= 0);
    if (invalid.length) {
      toast({ title: `${invalid.length} item(s) need a name and price`, variant: "destructive" });
      return;
    }

    setConfirming(true);
    try {
      const res = await fetch(`/api/businesses/${businessId}/photo-scan/confirm`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: approved.map((d) => ({
            name:        d.editedName.trim(),
            price:       Number(d.editedPrice),
            description: d.editedDescription.trim(),
            stockQty:    Number(d.editedStockQty) || 0,
          })),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || "Save failed");
      }

      const { created } = await res.json();
      setDoneCount(created);
      qc.invalidateQueries({ queryKey: getListProductsQueryKey(businessId) });
      setPhase("done");
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  };

  const reset = () => {
    photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPhotos([]);
    setDrafts([]);
    setPhase("idle");
  };

  // ── Analyzing ────────────────────────────────────────────────────────────
  if (phase === "analyzing") {
    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
        <div className="relative h-20 w-20">
          <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
          <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" style={{ animationDuration: "1s" }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <Camera className="h-8 w-8 text-primary" />
          </div>
        </div>
        <div>
          <p className="font-bold text-foreground text-lg">AI is scanning your photos…</p>
          <p className="text-sm text-muted-foreground mt-1">{progress.done} of {progress.total} analysed</p>
        </div>
        <div className="w-52 h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">This takes a few seconds per photo</p>
      </div>
    );
  }

  // ── Done ─────────────────────────────────────────────────────────────────
  if (phase === "done") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-5">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <Check className="h-8 w-8 text-emerald-600" />
        </div>
        <div>
          <p className="text-lg font-bold text-foreground">{doneCount} product{doneCount !== 1 ? "s" : ""} added to your shop!</p>
          <p className="text-sm text-muted-foreground mt-1">The AI can sell them right now.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/dashboard/products"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90"
          >
            <Package className="h-3.5 w-3.5" /> View products
          </Link>
          <button
            onClick={reset}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-4 text-sm font-medium text-foreground hover:bg-muted"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Scan more photos
          </button>
        </div>
      </div>
    );
  }

  // ── Review ───────────────────────────────────────────────────────────────
  if (phase === "review") {
    const approvedCount = drafts.filter((d) => d.approved).length;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-foreground">Review AI suggestions</p>
            <p className="text-xs text-muted-foreground mt-0.5">Fix names and prices if needed — nothing is saved until you confirm.</p>
          </div>
          <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-1 rounded-full">
            {approvedCount} / {drafts.length} selected
          </span>
        </div>

        <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
          {drafts.map((draft) => (
            <div
              key={draft.tempId}
              className={`rounded-xl border p-4 transition-all ${
                draft.approved ? "border-primary/30 bg-primary/5" : "border-border bg-muted/30 opacity-50"
              }`}
            >
              <div className="flex gap-3">
                {/* Thumbnail */}
                <div className="flex-shrink-0 w-[72px] h-[72px] rounded-lg overflow-hidden border border-border bg-muted">
                  <img src={draft.imageDataUrl} alt="" className="w-full h-full object-cover" />
                </div>

                {/* Fields */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-start gap-2">
                    <input
                      type="text"
                      value={draft.editedName}
                      onChange={(e) => updateDraft(draft.tempId, "editedName", e.target.value)}
                      placeholder="Product name"
                      className="flex-1 min-w-0 text-sm font-semibold bg-transparent border-b border-border/60 focus:border-primary outline-none pb-0.5 leading-tight"
                    />
                    {/* Approve toggle */}
                    <button
                      onClick={() => updateDraft(draft.tempId, "approved", !draft.approved)}
                      title={draft.approved ? "Deselect" : "Select"}
                      className={`flex-shrink-0 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors ${
                        draft.approved ? "bg-primary border-primary text-white" : "border-border bg-white"
                      }`}
                    >
                      {draft.approved && <Check className="h-3.5 w-3.5" />}
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <div className="flex items-center gap-1 flex-1">
                      <span className="text-xs text-muted-foreground flex-shrink-0">KSh</span>
                      <input
                        type="number"
                        value={draft.editedPrice}
                        onChange={(e) => updateDraft(draft.tempId, "editedPrice", e.target.value)}
                        placeholder="Price"
                        min="0"
                        className="w-full text-sm bg-transparent border-b border-border/60 focus:border-primary outline-none pb-0.5"
                      />
                    </div>
                    <div className="flex items-center gap-1 w-20">
                      <span className="text-xs text-muted-foreground flex-shrink-0">Qty</span>
                      <input
                        type="number"
                        value={draft.editedStockQty}
                        onChange={(e) => updateDraft(draft.tempId, "editedStockQty", e.target.value)}
                        placeholder="0"
                        min="0"
                        className="w-full text-sm bg-transparent border-b border-border/60 focus:border-primary outline-none pb-0.5"
                      />
                    </div>
                  </div>

                  {draft.error && (
                    <p className="text-[11px] text-destructive">⚠ {draft.error}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 pt-3 border-t border-border">
          <button onClick={() => setDrafts((p) => p.map((d) => ({ ...d, approved: true  })))} className="text-xs text-primary font-medium hover:underline">Select all</button>
          <span className="text-muted-foreground text-xs">·</span>
          <button onClick={() => setDrafts((p) => p.map((d) => ({ ...d, approved: false })))} className="text-xs text-muted-foreground hover:text-foreground">Deselect all</button>
          <div className="flex-1" />
          <button
            onClick={handleConfirm}
            disabled={confirming || approvedCount === 0}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-5 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {confirming
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
              : <>Add {approvedCount} product{approvedCount !== 1 ? "s" : ""} to shop →</>}
          </button>
        </div>
      </div>
    );
  }

  // ── Idle (picker) ────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/products/add"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All methods
        </Link>
      </div>

      <p className="text-sm text-muted-foreground">
        Select photos of your products — one product per photo works best. AI suggests name and price; you review and confirm before anything goes live.
      </p>

      {/* Drop zone */}
      <div
        onClick={() => fileRef.current?.click()}
        onDrop={(e) => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files)); }}
        onDragOver={(e) => e.preventDefault()}
        className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-2xl py-14 px-6 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors select-none"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-4">
          <Camera className="h-7 w-7 text-primary" />
        </div>
        <p className="font-semibold text-foreground">Tap to choose photos</p>
        <p className="text-xs text-muted-foreground mt-1">
          Gallery or camera · up to {MAX_PHOTOS} photos · JPG, PNG, WebP
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => { addFiles(Array.from(e.target.files || [])); e.target.value = ""; }}
        />
      </div>

      {/* Selected thumbnails */}
      {photos.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">
              {photos.length} photo{photos.length !== 1 ? "s" : ""} selected
            </p>
            {photos.length < MAX_PHOTOS && (
              <button onClick={() => fileRef.current?.click()} className="text-xs text-primary font-medium hover:underline">
                + Add more
              </button>
            )}
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
            {photos.map((p) => (
              <div key={p.id} className="relative aspect-square rounded-lg overflow-hidden border border-border group">
                <img src={p.previewUrl} alt="" className="w-full h-full object-cover" />
                <button
                  onClick={(e) => { e.stopPropagation(); removePhoto(p.id); }}
                  className="absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={handleAnalyze}
            className="w-full h-11 rounded-xl bg-primary text-sm font-bold text-white hover:bg-primary/90 transition-colors"
          >
            Scan {photos.length} photo{photos.length !== 1 ? "s" : ""} with AI →
          </button>
        </div>
      )}
    </div>
  );
}

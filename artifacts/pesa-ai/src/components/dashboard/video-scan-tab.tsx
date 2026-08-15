import { useState, useRef, useEffect, useCallback } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { Upload, Camera, CheckCircle2, AlertCircle, Loader2, Video, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

// ── Types ────────────────────────────────────────────────────────────────────

interface ProductDraft {
  draftId: string;
  name: string;
  price: number | null;
  description: string;
  selected: boolean;
}

interface VideoScan {
  id: string;
  status: "pending" | "processing" | "done" | "error" | "confirmed";
  frames: number;
  productCount: number;
  productDrafts: ProductDraft[];
  error?: string;
}

// ── API helpers (raw fetch — not in generated client) ────────────────────────

async function uploadVideo(businessId: string, file: File, onProgress?: (pct: number) => void): Promise<{ scanId: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/businesses/${businessId}/video-scan/upload`);
    xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
    xhr.withCredentials = true;

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch { reject(new Error("Invalid server response")); }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.error || `Upload failed (${xhr.status})`));
        } catch {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
}

async function fetchScan(businessId: string, scanId: string): Promise<VideoScan> {
  const res = await fetch(`/api/businesses/${businessId}/video-scan/${scanId}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch scan (${res.status})`);
  return res.json();
}

async function confirmScan(businessId: string, scanId: string, products: ProductDraft[]): Promise<void> {
  const res = await fetch(`/api/businesses/${businessId}/video-scan/${scanId}/confirm`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ products }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || "Failed to confirm products");
  }
}

// ── Sub-views ────────────────────────────────────────────────────────────────

function UploadView({ onUploaded }: { onUploaded: (scanId: string) => void }) {
  const { data: me } = useGetMe();
  const businessId = (me as any)?.business?.id;
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [file, setFile] = useState<File | null>(null);

  const handleFile = (f: File) => {
    if (!f.type.startsWith("video/")) {
      toast({ title: "Please select a video file", variant: "destructive" });
      return;
    }
    if (f.size > 200 * 1024 * 1024) {
      toast({ title: "Video must be under 200 MB", variant: "destructive" });
      return;
    }
    setFile(f);
  };

  const handleUpload = async () => {
    if (!file || !businessId) return;
    setUploading(true);
    setProgress(0);
    try {
      const { scanId } = await uploadVideo(businessId, file, setProgress);
      onUploaded(scanId);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Instructions */}
      <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 flex gap-3">
        <Camera className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
        <div className="text-sm text-foreground space-y-1">
          <p className="font-semibold">How to get the best results</p>
          <ul className="text-muted-foreground list-disc list-inside space-y-0.5">
            <li>Walk slowly through your shop, pointing at each product</li>
            <li>Make sure price tags are visible when possible</li>
            <li>Good lighting helps — near a window or with the lights on</li>
            <li>60–90 seconds is plenty; no need to be perfect</li>
          </ul>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onClick={() => !file && inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
          dragging ? "border-primary bg-primary/5" : file ? "border-green-400 bg-green-50" : "border-border hover:border-primary/50 hover:bg-muted/30"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />

        {file ? (
          <div className="space-y-2">
            <Video className="h-10 w-10 text-green-500 mx-auto" />
            <p className="font-semibold text-foreground">{file.name}</p>
            <p className="text-sm text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setFile(null); }}
              className="text-xs text-red-500 hover:text-red-600 underline"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <Upload className="h-10 w-10 text-muted-foreground mx-auto" />
            <div>
              <p className="font-semibold text-foreground">Drop your shop video here</p>
              <p className="text-sm text-muted-foreground mt-1">or click to browse · MP4, MOV, AVI · up to 200 MB</p>
            </div>
          </div>
        )}

        {uploading && (
          <div className="absolute inset-0 rounded-xl bg-white/80 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
            <p className="text-sm font-medium text-foreground">Uploading… {progress}%</p>
            <div className="w-48 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </div>

      <Button onClick={handleUpload} disabled={!file || uploading} className="w-full" size="lg">
        {uploading ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading…</>
        ) : (
          <><Camera className="h-4 w-4 mr-2" /> Scan Inventory</>
        )}
      </Button>
    </div>
  );
}

function ProcessingView({ businessId, scanId, onDone }: { businessId: string; scanId: string; onDone: (scan: VideoScan) => void }) {
  const [scan, setScan] = useState<VideoScan | null>(null);
  const [dots, setDots] = useState(".");

  // Animate dots
  useEffect(() => {
    const t = setInterval(() => setDots((d) => d.length >= 3 ? "." : d + "."), 600);
    return () => clearInterval(t);
  }, []);

  // Poll for status
  useEffect(() => {
    const poll = async () => {
      try {
        const s = await fetchScan(businessId, scanId);
        setScan(s);
        if (s.status === "done") { onDone(s); return; }
        if (s.status === "error") { setScan(s); return; }
      } catch { /* keep polling */ }
    };
    poll();
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [businessId, scanId, onDone]);

  if (scan?.status === "error") {
    return (
      <div className="text-center space-y-3 py-8">
        <AlertCircle className="h-10 w-10 text-red-400 mx-auto" />
        <p className="font-semibold text-foreground">Scan failed</p>
        <p className="text-sm text-muted-foreground">{scan.error || "Something went wrong processing your video."}</p>
      </div>
    );
  }

  const frameCount = scan?.frames ?? 0;
  const productCount = scan?.productCount ?? 0;

  return (
    <div className="text-center space-y-6 py-8">
      {/* Animated scanning indicator */}
      <div className="relative mx-auto w-20 h-20">
        <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
        <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        <Camera className="absolute inset-0 m-auto h-8 w-8 text-primary" />
      </div>

      <div className="space-y-1">
        <p className="text-lg font-bold text-foreground">🔍 Pesa AI is scanning your shop{dots}</p>
        <p className="text-sm text-muted-foreground">Estimated time: 2–5 minutes</p>
      </div>

      {/* Live stats */}
      {(frameCount > 0 || productCount > 0) && (
        <div className="inline-block text-left bg-muted/40 rounded-xl px-6 py-4 space-y-2">
          {frameCount > 0 && (
            <div className="flex items-center gap-2 text-sm text-foreground">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span>{frameCount} frames analysed</span>
            </div>
          )}
          {productCount > 0 && (
            <div className="flex items-center gap-2 text-sm text-foreground">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span>{productCount} products detected</span>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">You can leave this page and come back — we'll keep processing.</p>
    </div>
  );
}

function ReviewView({
  businessId,
  scanId,
  initialDrafts,
  onConfirmed,
  onBack,
}: {
  businessId: string;
  scanId: string;
  initialDrafts: ProductDraft[];
  onConfirmed: () => void;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<ProductDraft[]>(initialDrafts);
  const [confirming, setConfirming] = useState(false);

  const selected = drafts.filter((d) => d.selected);

  const update = (draftId: string, field: keyof ProductDraft, value: any) => {
    setDrafts((prev) => prev.map((d) => d.draftId === draftId ? { ...d, [field]: value } : d));
  };

  const handleConfirm = async () => {
    if (selected.length === 0) {
      toast({ title: "Select at least one product", variant: "destructive" });
      return;
    }
    const valid = selected.filter((d) => d.name.trim() && (d.price ?? 0) > 0);
    if (valid.length < selected.length) {
      toast({ title: "Some products are missing a name or price", variant: "destructive" });
      return;
    }
    setConfirming(true);
    try {
      await confirmScan(businessId, scanId, valid);
      toast({ title: `✅ ${valid.length} product${valid.length !== 1 ? "s" : ""} added to inventory!` });
      onConfirmed();
    } catch (err: any) {
      toast({ title: "Failed to save products", description: err.message, variant: "destructive" });
      setConfirming(false);
    }
  };

  if (drafts.length === 0) {
    return (
      <div className="text-center space-y-3 py-10">
        <p className="text-2xl">🎥</p>
        <p className="font-semibold text-foreground">No products detected</p>
        <p className="text-sm text-muted-foreground">Try recording again with better lighting or moving the camera more slowly.</p>
        <Button variant="outline" onClick={onBack}>Try again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-foreground">{drafts.length} product{drafts.length !== 1 ? "s" : ""} detected</p>
          <p className="text-xs text-muted-foreground">{selected.length} selected · review and edit before adding to inventory</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setDrafts((d) => d.map((x) => ({ ...x, selected: true })))}>
            Select all
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDrafts((d) => d.map((x) => ({ ...x, selected: false })))}>
            Deselect all
          </Button>
        </div>
      </div>

      {/* Product cards */}
      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
        {drafts.map((draft) => (
          <div
            key={draft.draftId}
            className={`rounded-xl border p-4 transition-colors ${
              draft.selected ? "border-primary/40 bg-primary/5" : "border-border bg-white opacity-60"
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Checkbox */}
              <button
                type="button"
                onClick={() => update(draft.draftId, "selected", !draft.selected)}
                className={`mt-1 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  draft.selected ? "bg-primary border-primary" : "border-border"
                }`}
              >
                {draft.selected && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
              </button>

              {/* Fields */}
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Product name</label>
                  <Input
                    value={draft.name}
                    onChange={(e) => update(draft.draftId, "name", e.target.value)}
                    placeholder="Product name"
                    className="h-8 text-sm"
                    disabled={!draft.selected}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Price (KES)</label>
                  <Input
                    type="number"
                    value={draft.price ?? ""}
                    onChange={(e) => update(draft.draftId, "price", e.target.value ? Number(e.target.value) : null)}
                    placeholder="e.g. 250"
                    className="h-8 text-sm"
                    disabled={!draft.selected}
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="text-xs text-muted-foreground mb-1 block">Description (optional)</label>
                  <Input
                    value={draft.description}
                    onChange={(e) => update(draft.draftId, "description", e.target.value)}
                    placeholder="Short description"
                    className="h-8 text-sm"
                    disabled={!draft.selected}
                  />
                </div>
              </div>

              {/* Remove */}
              <button
                type="button"
                onClick={() => setDrafts((d) => d.filter((x) => x.draftId !== draft.draftId))}
                className="text-muted-foreground hover:text-red-500 transition-colors mt-1"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onBack} disabled={confirming}>
          Scan again
        </Button>
        <Button onClick={handleConfirm} disabled={confirming || selected.length === 0} className="flex-1">
          {confirming ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Adding to inventory…</>
          ) : (
            <><Plus className="h-4 w-4 mr-2" /> Add {selected.length} product{selected.length !== 1 ? "s" : ""} to inventory</>
          )}
        </Button>
      </div>
    </div>
  );
}

function SuccessView({ count, onScanAgain }: { count: number; onScanAgain: () => void }) {
  return (
    <div className="text-center space-y-4 py-10">
      <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto" />
      <div>
        <p className="text-xl font-bold text-foreground">Products added! 🎉</p>
        <p className="text-sm text-muted-foreground mt-1">
          {count} product{count !== 1 ? "s are" : " is"} now live in your inventory and available to customers on WhatsApp.
        </p>
      </div>
      <div className="flex gap-3 justify-center">
        <Button variant="outline" onClick={onScanAgain}>
          <Camera className="h-4 w-4 mr-2" /> Scan again
        </Button>
        <Button asChild>
          <a href="/dashboard/products">View inventory</a>
        </Button>
      </div>
    </div>
  );
}

// ── Main tab ─────────────────────────────────────────────────────────────────

type View = "upload" | "processing" | "review" | "success";

export function VideoScanTab() {
  const { data: me } = useGetMe();
  const businessId = (me as any)?.business?.id as string | undefined;

  const [view, setView] = useState<View>("upload");
  const [scanId, setScanId] = useState<string | null>(null);
  const [scan, setScan] = useState<VideoScan | null>(null);
  const [confirmedCount, setConfirmedCount] = useState(0);

  const handleUploaded = (id: string) => {
    setScanId(id);
    setView("processing");
  };

  const handleDone = useCallback((s: VideoScan) => {
    setScan(s);
    setView("review");
  }, []);

  const handleConfirmed = () => {
    setConfirmedCount(scan?.productDrafts.filter((d) => d.selected).length ?? 0);
    setView("success");
  };

  const handleBack = () => {
    setScanId(null);
    setScan(null);
    setView("upload");
  };

  if (!businessId) return null;

  return (
    <div className="max-w-2xl mx-auto">
      {view === "upload" && <UploadView onUploaded={handleUploaded} />}
      {view === "processing" && scanId && (
        <ProcessingView businessId={businessId} scanId={scanId} onDone={handleDone} />
      )}
      {view === "review" && scan && scanId && (
        <ReviewView
          businessId={businessId}
          scanId={scanId}
          initialDrafts={scan.productDrafts}
          onConfirmed={handleConfirmed}
          onBack={handleBack}
        />
      )}
      {view === "success" && (
        <SuccessView count={confirmedCount} onScanAgain={handleBack} />
      )}
    </div>
  );
}

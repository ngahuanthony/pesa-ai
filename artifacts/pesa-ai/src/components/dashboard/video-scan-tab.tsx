import { useState, useRef, useEffect, useCallback } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { Upload, Camera, CheckCircle2, AlertCircle, Loader2, Video, Trash2, Plus, RefreshCw, History, ChevronDown, ChevronUp, X } from "lucide-react";
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
  createdAt?: string | number; // ISO string from db.now()
}

// ── API helpers ───────────────────────────────────────────────────────────────

const UPLOAD_CANCELLED = "UPLOAD_CANCELLED";

function startUpload(businessId: string, file: File, onProgress?: (pct: number) => void): {
  promise: Promise<{ scanId: string }>;
  abort: () => void;
} {
  let xhr: XMLHttpRequest;
  const promise = new Promise<{ scanId: string }>((resolve, reject) => {
    xhr = new XMLHttpRequest();
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
        try { reject(new Error(JSON.parse(xhr.responseText).error || `Upload failed (${xhr.status})`)); }
        catch { reject(new Error(`Upload failed (${xhr.status})`)); }
      }
    };
    xhr.onerror  = () => reject(new Error("Network error during upload"));
    xhr.onabort  = () => reject(new Error(UPLOAD_CANCELLED));
    xhr.send(file);
  });
  return { promise, abort: () => xhr?.abort() };
}

async function fetchScan(businessId: string, scanId: string): Promise<VideoScan> {
  const res = await fetch(`/api/businesses/${businessId}/video-scan/${scanId}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch scan (${res.status})`);
  return res.json();
}

async function fetchScans(businessId: string): Promise<VideoScan[]> {
  const res = await fetch(`/api/businesses/${businessId}/video-scan`, { credentials: "include" });
  if (!res.ok) return [];
  const data = await res.json();
  return data.scans ?? [];
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

// ── Scan History ──────────────────────────────────────────────────────────────

interface ScanHistoryProps {
  businessId: string;
  activeScanId: string | null;
  onResumeProcessing: (scanId: string) => void;
  onReviewDone: (scan: VideoScan) => void;
}

function timeAgo(ts: string | number | undefined) {
  if (!ts) return "just now";
  const ms = typeof ts === "string" ? new Date(ts).getTime() : ts;
  if (isNaN(ms)) return "just now";
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ScanHistory({ businessId, activeScanId, onResumeProcessing, onReviewDone }: ScanHistoryProps) {
  const [scans, setScans] = useState<VideoScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissing, setDismissing] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await fetchScans(businessId);
    setScans(data);
    setLoading(false);
  }, [businessId]);

  const handleDismiss = async (scanId: string) => {
    setDismissing(scanId);
    try {
      await fetch(`/api/businesses/${businessId}/video-scan/${scanId}`, {
        method: "DELETE",
        credentials: "include",
      });
      setScans((prev) => prev.filter((s) => s.id !== scanId));
    } catch { /* ignore */ } finally {
      setDismissing(null);
    }
  };

  useEffect(() => {
    load();
    // Re-poll while any scan is still processing
    const t = setInterval(async () => {
      const data = await fetchScans(businessId);
      setScans(data);
      if (!data.some((s) => s.status === "pending" || s.status === "processing")) {
        clearInterval(t);
      }
    }, 5000);
    return () => clearInterval(t);
  }, [load, businessId]);

  const visible = scans.filter((s) => s.id !== activeScanId);
  if (loading || visible.length === 0) return null;

  const statusBadge = (scan: VideoScan) => {
    switch (scan.status) {
      case "pending":
        return <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5"><Loader2 className="h-3 w-3 animate-spin" /> Queued</span>;
      case "processing":
        return <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5"><Loader2 className="h-3 w-3 animate-spin" /> Scanning…</span>;
      case "done":
        return <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-0.5"><CheckCircle2 className="h-3 w-3" /> Ready to review</span>;
      case "confirmed":
        return <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5"><CheckCircle2 className="h-3 w-3" /> Added to inventory</span>;
      case "error":
        return <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5"><AlertCircle className="h-3 w-3" /> Failed</span>;
      default:
        return null;
    }
  };

  return (
    <div className="mb-6 rounded-xl border border-border bg-white overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Recent Scans</span>
          <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">{visible.length}</span>
        </div>
        {collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
      </button>

      {/* List */}
      {!collapsed && (
        <div className="divide-y divide-border">
          {visible.map((scan) => (
            <div key={scan.id} className="flex items-center justify-between px-4 py-3 gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {statusBadge(scan)}
                  <span className="text-xs text-muted-foreground">{timeAgo(scan.createdAt)}</span>
                </div>
                {(scan.status === "done" || scan.status === "confirmed") && scan.productCount > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {scan.productCount} product{scan.productCount !== 1 ? "s" : ""} detected
                    {scan.status === "confirmed" && ` · added to inventory`}
                  </p>
                )}
                {scan.status === "error" && scan.error && (
                  <p className="text-xs text-red-500 truncate">{scan.error}</p>
                )}
                {scan.status === "processing" && scan.frames > 0 && (
                  <p className="text-xs text-muted-foreground">{scan.frames} frames analysed so far</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {(scan.status === "pending" || scan.status === "processing") && (
                  <Button size="sm" variant="outline" onClick={() => onResumeProcessing(scan.id)}>
                    View progress
                  </Button>
                )}
                {scan.status === "done" && (
                  <Button size="sm" onClick={() => onReviewDone(scan)}>
                    Review
                  </Button>
                )}
                {(scan.status === "error" || scan.status === "confirmed") && (
                  <button
                    type="button"
                    onClick={() => handleDismiss(scan.id)}
                    disabled={dismissing === scan.id}
                    className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                    title="Remove from history"
                  >
                    {dismissing === scan.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Mode Selector ─────────────────────────────────────────────────────────────

function ModeSelector({ onRecord, onUpload }: { onRecord: () => void; onUpload: () => void }) {
  return (
    <div className="space-y-6">
      {/* Tips */}
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

      {/* Two mode cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Scan Now */}
        <button
          type="button"
          onClick={onRecord}
          className="group relative flex flex-col items-center gap-4 rounded-2xl border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/60 p-8 text-center transition-all cursor-pointer"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 group-hover:bg-primary/25 transition-colors">
            <Camera className="h-7 w-7 text-primary" />
          </div>
          <div>
            <p className="font-bold text-foreground text-base">📱 Scan with Camera</p>
            <p className="text-sm text-muted-foreground mt-1">Record directly with your phone camera — no file needed</p>
          </div>
          <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-primary text-white text-[10px] font-bold uppercase tracking-wider px-3 py-0.5 rounded-full">
            Recommended
          </span>
        </button>

        {/* Upload existing */}
        <button
          type="button"
          onClick={onUpload}
          className="group flex flex-col items-center gap-4 rounded-2xl border-2 border-border hover:border-primary/40 bg-white hover:bg-muted/30 p-8 text-center transition-all cursor-pointer"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted group-hover:bg-muted/80 transition-colors">
            <Upload className="h-7 w-7 text-muted-foreground" />
          </div>
          <div>
            <p className="font-bold text-foreground text-base">📁 Upload Existing Video</p>
            <p className="text-sm text-muted-foreground mt-1">Already recorded? Upload MP4, MOV, or AVI up to 200 MB</p>
          </div>
        </button>
      </div>
    </div>
  );
}

// ── Camera Recorder ───────────────────────────────────────────────────────────

function RecordView({ onFile, onBack }: { onFile: (f: File) => void; onBack: () => void }) {
  const { toast } = useToast();
  const videoRef    = useRef<HTMLVideoElement>(null);
  const previewRef  = useRef<HTMLVideoElement>(null);
  const mrRef       = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<Blob[]>([]);
  const streamRef   = useRef<MediaStream | null>(null);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewUrl  = useRef<string>("");

  type Phase = "init" | "ready" | "recording" | "preview" | "error";
  const [phase, setPhase]           = useState<Phase>("init");
  const [seconds, setSeconds]       = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [errorMsg, setErrorMsg]     = useState("");

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const startCamera = useCallback(async () => {
    setPhase("init");
    setErrorMsg("");
    try {
      // 640×480 @ 10 fps is plenty for AI frame extraction and keeps uploads small (~3 MB for 90s)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", frameRate: { ideal: 10, max: 15 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setPhase("ready");
    } catch (err: any) {
      setErrorMsg(err.message || "Could not access camera. Please allow camera permission and try again.");
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, [startCamera, stopCamera]);

  const startRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    // Pick the best supported MIME type
    const mime = ["video/mp4", "video/webm;codecs=vp8", "video/webm"].find((m) =>
      MediaRecorder.isTypeSupported(m)
    ) ?? "";
    // 500 kbps is plenty for AI frame extraction; keeps 90s video ≈ 3–5 MB
    const mr = new MediaRecorder(streamRef.current, {
      ...(mime ? { mimeType: mime } : {}),
      videoBitsPerSecond: 500_000,
    });
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = () => {
      const type = mr.mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      setRecordedBlob(blob);
      stopCamera();
      const url = URL.createObjectURL(blob);
      previewUrl.current = url;
      if (previewRef.current) previewRef.current.src = url;
      setPhase("preview");
    };
    mr.start(250);
    mrRef.current = mr;
    setSeconds(0);
    setPhase("recording");
    timerRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s >= 89) { stopRecording(); return s; }
        return s + 1;
      });
    }, 1000);
  };

  const stopRecording = () => {
    if (mrRef.current?.state === "recording") mrRef.current.stop();
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const useVideo = () => {
    if (!recordedBlob) return;
    const ext = recordedBlob.type.includes("mp4") ? "mp4" : "webm";
    const file = new File([recordedBlob], `scan-${Date.now()}.${ext}`, { type: recordedBlob.type });
    onFile(file);
  };

  const recordAgain = () => {
    setRecordedBlob(null);
    setSeconds(0);
    if (previewUrl.current) { URL.revokeObjectURL(previewUrl.current); previewUrl.current = ""; }
    startCamera();
  };

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      {/* Back */}
      <button type="button" onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5">
        ← Back
      </button>

      {/* Viewfinder */}
      <div className="relative rounded-2xl overflow-hidden bg-black aspect-[3/4] sm:aspect-video shadow-lg">
        {/* Live camera */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover ${phase === "preview" ? "hidden" : ""}`}
        />

        {/* Recorded preview */}
        <video
          ref={previewRef}
          controls
          playsInline
          className={`w-full h-full object-cover ${phase !== "preview" ? "hidden" : ""}`}
        />

        {/* Loading */}
        {phase === "init" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center space-y-2">
              <Loader2 className="h-8 w-8 text-white animate-spin mx-auto" />
              <p className="text-white/60 text-sm">Starting camera…</p>
            </div>
          </div>
        )}

        {/* Timer overlay */}
        {phase === "recording" && (
          <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 backdrop-blur rounded-full px-3 py-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-white text-sm font-mono font-bold">{fmt(seconds)}</span>
            <span className="text-white/50 text-xs">/ 1:30</span>
          </div>
        )}

        {/* Time warning */}
        {phase === "recording" && seconds >= 75 && (
          <div className="absolute top-3 right-3 bg-amber-400 text-black text-xs font-bold rounded-full px-3 py-1">
            {90 - seconds}s left
          </div>
        )}

        {/* Preview label */}
        {phase === "preview" && (
          <div className="absolute top-3 left-3 bg-black/60 backdrop-blur rounded-full px-3 py-1.5">
            <span className="text-white text-xs font-medium">Preview · {fmt(seconds)}</span>
          </div>
        )}

        {/* Error */}
        {phase === "error" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center space-y-3 p-6">
              <AlertCircle className="h-10 w-10 text-red-400 mx-auto" />
              <p className="text-white font-semibold">Camera unavailable</p>
              <p className="text-white/60 text-sm">{errorMsg}</p>
              <Button size="sm" variant="outline" onClick={startCamera} className="text-white border-white/30 hover:bg-white/10">
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Try again
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Record controls */}
      {(phase === "ready" || phase === "recording") && (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={phase === "ready" ? startRecording : stopRecording}
            className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-xl ${
              phase === "recording"
                ? "bg-red-500 hover:bg-red-600 scale-110"
                : "bg-red-500 hover:bg-red-600"
            }`}
            aria-label={phase === "ready" ? "Start recording" : "Stop recording"}
          >
            {phase === "ready" ? (
              <div className="w-5 h-5 rounded-full bg-white" />
            ) : (
              <div className="w-5 h-5 rounded bg-white" />
            )}
          </button>
          <p className="text-xs text-muted-foreground">
            {phase === "ready"
              ? "Tap to start · Max 90 seconds"
              : "Tap to stop · Walk slowly through your shop"}
          </p>
        </div>
      )}

      {/* Preview actions */}
      {phase === "preview" && (
        <div className="flex gap-3">
          <Button variant="outline" onClick={recordAgain} className="flex-1">
            <RefreshCw className="h-4 w-4 mr-2" /> Record again
          </Button>
          <Button onClick={useVideo} className="flex-1">
            <Camera className="h-4 w-4 mr-2" /> Use this video
          </Button>
        </div>
      )}
    </div>
  );
}

// ── File Uploader ─────────────────────────────────────────────────────────────

function UploadFileView({ onFile, onBack }: { onFile: (f: File) => void; onBack: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const { toast } = useToast();

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

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5">
        ← Back
      </button>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onClick={() => !file && inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
          dragging ? "border-primary bg-primary/5" : file ? "border-green-400 bg-green-50" : "border-border hover:border-primary/50 hover:bg-muted/30"
        }`}
      >
        <input ref={inputRef} type="file" accept="video/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        {file ? (
          <div className="space-y-2">
            <Video className="h-10 w-10 text-green-500 mx-auto" />
            <p className="font-semibold text-foreground">{file.name}</p>
            <p className="text-sm text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
            <button type="button" onClick={(e) => { e.stopPropagation(); setFile(null); }}
              className="text-xs text-red-500 hover:text-red-600 underline">Remove</button>
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
      </div>

      <Button onClick={() => file && onFile(file)} disabled={!file} className="w-full" size="lg">
        <Upload className="h-4 w-4 mr-2" /> Upload & Scan
      </Button>
    </div>
  );
}

// ── Upload-with-progress (shared after both paths) ────────────────────────────

function UploadingView({ businessId, file, onUploaded, onBack }: {
  businessId: string;
  file: File;
  onUploaded: (scanId: string) => void;
  onBack: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const [error, setError]       = useState<string | null>(null);
  const started  = useRef(false);
  const abortRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const { promise, abort } = startUpload(businessId, file, setProgress);
    abortRef.current = abort;
    promise
      .then(({ scanId }) => onUploaded(scanId))
      .catch((err: any) => {
        if (err.message === UPLOAD_CANCELLED) return; // user cancelled — onBack already called
        setError(err.message || "Upload failed");
      });
  }, []); // eslint-disable-line

  const handleCancel = () => {
    abortRef.current?.();
    onBack();
  };

  const handleRetry = () => {
    setError(null);
    setProgress(0);
    started.current = false;
  };

  if (error) {
    return (
      <div className="text-center space-y-4 py-10">
        <AlertCircle className="h-12 w-12 text-red-400 mx-auto" />
        <div>
          <p className="font-semibold text-foreground">Upload failed</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">{error}</p>
        </div>
        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={onBack}>← Go back</Button>
          <Button onClick={handleRetry}>Try again</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center space-y-5 py-10">
      <div className="relative mx-auto w-20 h-20">
        <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
        <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        <Upload className="absolute inset-0 m-auto h-8 w-8 text-primary" />
      </div>
      <div>
        <p className="font-bold text-foreground">Uploading your video…</p>
        <p className="text-sm text-muted-foreground mt-1">{progress}% · {(file.size / 1024 / 1024).toFixed(1)} MB</p>
      </div>
      <div className="w-64 h-2 bg-muted rounded-full overflow-hidden mx-auto">
        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
      </div>
      <Button variant="ghost" size="sm" onClick={handleCancel} className="text-muted-foreground hover:text-foreground">
        Cancel upload
      </Button>
    </div>
  );
}

// ── Processing ────────────────────────────────────────────────────────────────

function ProcessingView({ businessId, scanId, onDone }: { businessId: string; scanId: string; onDone: (scan: VideoScan) => void }) {
  const [scan, setScan] = useState<VideoScan | null>(null);
  const [dots, setDots] = useState(".");

  useEffect(() => {
    const t = setInterval(() => setDots((d) => d.length >= 3 ? "." : d + "."), 600);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const poll = async () => {
      try {
        const s = await fetchScan(businessId, scanId);
        setScan(s);
        if (s.status === "done") { onDone(s); return; }
        if (s.status === "error") return;
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

  return (
    <div className="text-center space-y-6 py-8">
      <div className="relative mx-auto w-20 h-20">
        <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
        <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        <Camera className="absolute inset-0 m-auto h-8 w-8 text-primary" />
      </div>
      <div className="space-y-1">
        <p className="text-lg font-bold text-foreground">🔍 Pesa AI is scanning your shop{dots}</p>
        <p className="text-sm text-muted-foreground">Estimated time: 2–5 minutes</p>
      </div>
      {((scan?.frames ?? 0) > 0 || (scan?.productCount ?? 0) > 0) && (
        <div className="inline-block text-left bg-muted/40 rounded-xl px-6 py-4 space-y-2">
          {(scan?.frames ?? 0) > 0 && (
            <div className="flex items-center gap-2 text-sm text-foreground">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span>{scan!.frames} frames analysed</span>
            </div>
          )}
          {(scan?.productCount ?? 0) > 0 && (
            <div className="flex items-center gap-2 text-sm text-foreground">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span>{scan!.productCount} products detected</span>
            </div>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">You can leave this page and come back — we'll keep processing.</p>
    </div>
  );
}

// ── Review ────────────────────────────────────────────────────────────────────

function ReviewView({ businessId, scanId, initialDrafts, onConfirmed, onBack }: {
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

  const update = (draftId: string, field: keyof ProductDraft, value: any) =>
    setDrafts((prev) => prev.map((d) => d.draftId === draftId ? { ...d, [field]: value } : d));

  const handleConfirm = async () => {
    if (selected.length === 0) { toast({ title: "Select at least one product", variant: "destructive" }); return; }
    const valid = selected.filter((d) => d.name.trim() && (d.price ?? 0) > 0);
    if (valid.length < selected.length) { toast({ title: "Some products are missing a name or price", variant: "destructive" }); return; }
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
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-foreground">{drafts.length} product{drafts.length !== 1 ? "s" : ""} detected</p>
          <p className="text-xs text-muted-foreground">{selected.length} selected · review and edit before adding to inventory</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setDrafts((d) => d.map((x) => ({ ...x, selected: true })))}>Select all</Button>
          <Button variant="outline" size="sm" onClick={() => setDrafts((d) => d.map((x) => ({ ...x, selected: false })))}>Deselect all</Button>
        </div>
      </div>

      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
        {drafts.map((draft) => (
          <div key={draft.draftId} className={`rounded-xl border p-4 transition-colors ${draft.selected ? "border-primary/40 bg-primary/5" : "border-border bg-white opacity-60"}`}>
            <div className="flex items-start gap-3">
              <button type="button" onClick={() => update(draft.draftId, "selected", !draft.selected)}
                className={`mt-1 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${draft.selected ? "bg-primary border-primary" : "border-border"}`}>
                {draft.selected && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
              </button>
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Product name</label>
                  <Input value={draft.name} onChange={(e) => update(draft.draftId, "name", e.target.value)} placeholder="Product name" className="h-8 text-sm" disabled={!draft.selected} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Price (KES)</label>
                  <Input type="number" value={draft.price ?? ""} onChange={(e) => update(draft.draftId, "price", e.target.value ? Number(e.target.value) : null)} placeholder="e.g. 250" className="h-8 text-sm" disabled={!draft.selected} />
                </div>
                <div className="sm:col-span-3">
                  <label className="text-xs text-muted-foreground mb-1 block">Description (optional)</label>
                  <Input value={draft.description} onChange={(e) => update(draft.draftId, "description", e.target.value)} placeholder="Short description" className="h-8 text-sm" disabled={!draft.selected} />
                </div>
              </div>
              <button type="button" onClick={() => setDrafts((d) => d.filter((x) => x.draftId !== draft.draftId))} className="text-muted-foreground hover:text-red-500 transition-colors mt-1">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onBack} disabled={confirming}>Scan again</Button>
        <Button onClick={handleConfirm} disabled={confirming || selected.length === 0} className="flex-1">
          {confirming ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Adding to inventory…</> : <><Plus className="h-4 w-4 mr-2" /> Add {selected.length} product{selected.length !== 1 ? "s" : ""} to inventory</>}
        </Button>
      </div>
    </div>
  );
}

// ── Success ───────────────────────────────────────────────────────────────────

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
        <Button variant="outline" onClick={onScanAgain}><Camera className="h-4 w-4 mr-2" /> Scan again</Button>
        <Button asChild><a href="/dashboard/products">View inventory</a></Button>
      </div>
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

type View = "choose" | "record" | "upload" | "uploading" | "processing" | "review" | "success";

// Show history only on the "neutral" screens where the user isn't mid-flow
const HISTORY_VISIBLE_VIEWS: View[] = ["choose", "success"];

export function VideoScanTab() {
  const { data: me } = useGetMe();
  const businessId = (me as any)?.business?.id as string | undefined;

  const [view, setView]             = useState<View>("choose");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [scanId, setScanId]         = useState<string | null>(null);
  const [scan, setScan]             = useState<VideoScan | null>(null);
  const [confirmedCount, setConfirmedCount] = useState(0);

  const handleFile = (f: File) => {
    setPendingFile(f);
    setView("uploading");
  };

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
    setPendingFile(null);
    setView("choose");
  };

  // Called from history panel — resume watching a still-processing scan
  const handleResumeProcessing = useCallback((id: string) => {
    setScanId(id);
    setScan(null);
    setView("processing");
  }, []);

  // Called from history panel — open review for a completed (but unconfirmed) scan
  const handleReviewDone = useCallback((s: VideoScan) => {
    setScan(s);
    setScanId(s.id);
    setView("review");
  }, []);

  if (!businessId) return null;

  const showHistory = HISTORY_VISIBLE_VIEWS.includes(view);

  return (
    <div className="max-w-2xl mx-auto">
      {showHistory && (
        <ScanHistory
          businessId={businessId}
          activeScanId={scanId}
          onResumeProcessing={handleResumeProcessing}
          onReviewDone={handleReviewDone}
        />
      )}
      {view === "choose"     && <ModeSelector onRecord={() => setView("record")} onUpload={() => setView("upload")} />}
      {view === "record"     && <RecordView onFile={handleFile} onBack={handleBack} />}
      {view === "upload"     && <UploadFileView onFile={handleFile} onBack={handleBack} />}
      {view === "uploading"  && pendingFile && businessId && <UploadingView businessId={businessId} file={pendingFile} onUploaded={handleUploaded} onBack={handleBack} />}
      {view === "processing" && scanId && <ProcessingView businessId={businessId} scanId={scanId} onDone={handleDone} />}
      {view === "review"     && scan && scanId && <ReviewView businessId={businessId} scanId={scanId} initialDrafts={scan.productDrafts} onConfirmed={handleConfirmed} onBack={handleBack} />}
      {view === "success"    && <SuccessView count={confirmedCount} onScanAgain={handleBack} />}
    </div>
  );
}

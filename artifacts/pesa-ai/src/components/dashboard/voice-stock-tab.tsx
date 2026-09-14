import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, Check, History, Loader2, Mic, MicOff, PackageCheck, RotateCcw, ShieldAlert, Sparkles, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  useConfirmVoiceStock, useGetMe, useGetVoiceStockHistory, useInterpretVoiceStock,
  useListProducts, useTranscribeVoiceStock, getListProductsQueryKey, getGetVoiceStockHistoryQueryKey,
  VoiceStockItem, VoiceStockItemAction, VoiceStockConfirmInputItemsItemAction,
} from "@workspace/api-client-react";

type Draft = VoiceStockItem & { id: string; imageUrl?: string | null; imageUploading?: boolean; imageError?: string };
const MIN_RECORDING_MS = 800;
const MIN_AUDIO_BYTES = 1024;
const actions: Record<string, { label: string; short: string; tone: string }> = {
  receive: { label: "Receive / Add", short: "ADD", tone: "text-emerald-800 bg-emerald-100 border-emerald-200" },
  sell: { label: "Sell / Deduct", short: "SELL", tone: "text-amber-900 bg-amber-100 border-amber-200" },
  damage: { label: "Damage / Deduct", short: "DAMAGE", tone: "text-rose-800 bg-rose-100 border-rose-200" },
  missing: { label: "Missing / Deduct", short: "MISSING", tone: "text-rose-800 bg-rose-100 border-rose-200" },
  adjustment: { label: "Adjust / Set", short: "SET", tone: "text-sky-800 bg-sky-100 border-sky-200" },
};

function normalizedProductText(value: unknown) {
  return String(value || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function normalizedProductTokens(value: unknown) {
  return normalizedProductText(value)
    .split(" ")
    .filter(Boolean)
    .map((token) => {
      if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
      if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
      return token;
    });
}

function productMatchScore(candidate: string, productName: string) {
  const target = normalizedProductText(candidate);
  const name = normalizedProductText(productName);
  if (!target || !name) return 0;
  if (target === name) return 1;

  const targetTokens = normalizedProductTokens(target);
  const nameTokens = normalizedProductTokens(name);
  if ([...targetTokens].sort().join(" ") === [...nameTokens].sort().join(" ")) return 0.98;
  if (target.includes(name) || name.includes(target)) return 0.92;

  const targetSet = new Set(targetTokens);
  const nameSet = new Set(nameTokens);
  const overlap = nameTokens.filter((token) => targetSet.has(token)).length;
  if (!overlap) return 0;
  const precision = overlap / Math.max(targetSet.size, 1);
  const recall = overlap / Math.max(nameSet.size, 1);
  return (2 * precision * recall) / Math.max(precision + recall, 1);
}

function rankedProductMatches(candidate: string | null | undefined, products: Array<{ id: string; name: string }>) {
  if (!normalizedProductText(candidate)) return [];
  return products
    .map((product) => ({ product, score: productMatchScore(String(candidate), product.name) }))
    .filter((match) => match.score >= 0.55)
    .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name));
}

function findSafeProductMatch(candidate: string | null | undefined, products: Array<{ id: string; name: string }>) {
  const ranked = rankedProductMatches(candidate, products);
  const best = ranked[0];
  const second = ranked[1];
  if (!best || best.score < 0.86 || (second && best.score - second.score < 0.08)) return null;
  return best.product;
}

export function VoiceStockTab() {
  const { data: me } = useGetMe();
  const businessId = me?.business?.id ?? "";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: products = [], isLoading: productsLoading } = useListProducts(businessId, { query: { enabled: !!businessId, queryKey: getListProductsQueryKey(businessId) } });
  const { data: history = [], isLoading: historyLoading } = useGetVoiceStockHistory(businessId, undefined, { query: { enabled: !!businessId, queryKey: getGetVoiceStockHistoryQueryKey(businessId) } });
  const interpret = useInterpretVoiceStock();
  const transcribe = useTranscribeVoiceStock();
  const confirm = useConfirmVoiceStock();
  const [transcript, setTranscript] = useState("");
  const [draft, setDraft] = useState<Draft[] | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [micError, setMicError] = useState("");
  const [lastProvider, setLastProvider] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const confirmationRequestId = useRef(crypto.randomUUID());
  const pressActive = useRef(false);
  const recordingStartedAt = useRef<number | null>(null);
  const photoInput = useRef<HTMLInputElement | null>(null);
  const photoTargetId = useRef<string | null>(null);
  const confirming = confirm.isPending;

  const interpretText = useCallback((text: string) => {
    if (!text.trim() || !businessId) return;
    interpret.mutate({ businessId, data: { transcript: text.trim() } }, {
      onSuccess: (result) => {
        setTranscript(result.normalizedTranscript || result.transcript);
        confirmationRequestId.current = crypto.randomUUID();
        setDraft(result.items.map((item) => {
          const suggestedProduct = item.productId ? null : findSafeProductMatch(item.productName, products);
          const resolvedProductId = item.productId || suggestedProduct?.id || null;
          const autoResolvedMatch = !item.productId && Boolean(suggestedProduct) &&
            item.warning === "Choose a product from your catalogue to continue.";
          const existing = products.find((product) => product.id === resolvedProductId);
          const existingVariant = existing?.colorStock?.find((variant) => variant.color.toLowerCase() === (item.color || "").toLowerCase());
          return {
            ...item,
            id: crypto.randomUUID(),
            productId: resolvedProductId,
            productName: existing?.name || item.productName,
            confidenceLevel: autoResolvedMatch ? "review" : item.confidenceLevel,
            warning: autoResolvedMatch ? null : item.warning,
            imageUrl: existingVariant?.imageUrl || null,
          };
        }));
        if (!result.items.length) toast({ title: "Nothing to review", description: "Try saying a product, quantity, and action." });
      },
      onError: () => toast({ title: "Could not understand that", description: "Check the transcript and try again.", variant: "destructive" }),
    });
  }, [businessId, interpret, products, toast]);

  const updatePhotoState = useCallback((id: string, patch: Partial<Draft>) => {
    setDraft((items) => items?.map((item) => item.id === id ? { ...item, ...patch } : item) ?? null);
  }, []);

  const openPhotoPicker = (id: string) => {
    photoTargetId.current = id;
    if (photoInput.current) {
      photoInput.current.value = "";
      photoInput.current.click();
    }
  };

  const compressProductPhoto = async (file: File) => {
    const sourceUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = sourceUrl;
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("The product photo could not be read"));
      });
      const canvas = document.createElement("canvas");
      canvas.width = 500;
      canvas.height = 500;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Photo compression is not available in this browser");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, 500, 500);
      const scale = Math.min(500 / image.naturalWidth, 500 / image.naturalHeight);
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.drawImage(image, Math.round((500 - width) / 2), Math.round((500 - height) / 2), width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.6));
      if (!blob || blob.type !== "image/webp") throw new Error("This browser cannot create WebP product photos");
      return blob;
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
  };

  const handlePhotoSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const id = photoTargetId.current;
    event.target.value = "";
    if (!file || !id || !businessId) return;
    const item = draft?.find((candidate) => candidate.id === id);
    if (!item?.productId) {
      toast({ title: "Choose a product first", description: "A photo must belong to a matched catalogue product.", variant: "destructive" });
      return;
    }
    updatePhotoState(id, { imageUploading: true, imageError: "" });
    try {
      const blob = await compressProductPhoto(file);
      const color = item.color?.trim() || "default";
      const response = await fetch(`/api/businesses/${encodeURIComponent(businessId)}/voice-stock/variant-image?productId=${encodeURIComponent(item.productId)}&color=${encodeURIComponent(color)}`, {
        method: "POST",
        headers: { "Content-Type": "image/webp" },
        body: blob,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.imageUrl) throw new Error(payload.error || "Product photo upload failed");
      updatePhotoState(id, { imageUrl: payload.imageUrl, imageUploading: false, imageError: "" });
      toast({ title: "Product photo saved", description: "This photo will be attached to the variant when you confirm." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Product photo upload failed";
      updatePhotoState(id, { imageUploading: false, imageError: message });
      toast({ title: "Photo not saved", description: message, variant: "destructive" });
    }
  };

  const stopRecording = useCallback(() => {
    pressActive.current = false;
    const activeRecorder = recorder.current;
    if (!activeRecorder || activeRecorder.state === "inactive") return;
    setRecording(false);
    if (timer.current) clearInterval(timer.current);
    // Safari needs the MediaRecorder to finalize the MP4 container before its
    // tracks are stopped. Stopping tracks first can send Groq an invalid file.
    activeRecorder.stop();
  }, []);

  const startRecording = async () => {
    if (recording || transcribe.isPending || interpret.isPending) return;
    pressActive.current = true;
    setMicError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      pressActive.current = false;
      setMicError("Voice recording is not available here. Type the update below instead."); return;
    }
    try {
      const liveStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = liveStream; chunks.current = [];
      const preferredMimeTypes = ["audio/webm;codecs=opus", "audio/mp4", "audio/m4a", "audio/ogg;codecs=opus", "audio/webm"];
      const mimeType = preferredMimeTypes.find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const next = mimeType ? new MediaRecorder(liveStream, { mimeType }) : new MediaRecorder(liveStream);
      recorder.current = next;
      next.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      next.onstop = () => {
        // Finalize the container first, then release the input tracks.
        liveStream.getTracks().forEach((track) => track.stop());
        if (stream.current === liveStream) stream.current = null;
        const blob = new Blob(chunks.current, { type: next.mimeType || mimeType || "audio/webm" });
        chunks.current = [];
        const elapsed = recordingStartedAt.current ? Date.now() - recordingStartedAt.current : 0;
        recordingStartedAt.current = null;
        // Ignore accidental taps and incomplete containers locally. Sending them
        // to transcription only creates a confusing provider error.
        if (elapsed < MIN_RECORDING_MS || blob.size < MIN_AUDIO_BYTES) { setMicError(""); return; }
        transcribe.mutate({ businessId, data: blob }, {
          onSuccess: (result) => { setLastProvider(result.provider); setTranscript(result.normalizedTranscript || result.transcript); interpretText(result.normalizedTranscript || result.transcript); },
          onError: (error) => {
            const detail = error instanceof Error ? error.message.replace(/^HTTP \d+[^:]*:\s*/, "") : "The transcription service returned an unexpected error.";
            setMicError(`Audio could not be transcribed: ${detail}`);
          },
        });
      };
      recordingStartedAt.current = Date.now();
      next.start(250); setRecording(true); setSeconds(0);
      timer.current = setInterval(() => setSeconds((value) => value + 1), 1000);
      if (!pressActive.current) stopRecording();
    } catch {
      pressActive.current = false;
      recordingStartedAt.current = null;
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      setMicError("Microphone access was declined. Allow it in your browser settings, or type the update instead.");
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    void startRecording();
  };
  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    stopRecording();
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if ((event.key === " " || event.key === "Enter") && !event.repeat) { event.preventDefault(); void startRecording(); }
  };
  const handleKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === " " || event.key === "Enter") { event.preventDefault(); stopRecording(); }
  };
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); stream.current?.getTracks().forEach((track) => track.stop()); }, []);

  const update = (id: string, patch: Partial<Draft>) => setDraft((items) => items?.map((item) => {
    if (item.id !== id) return item;
    const identityChanged =
      ("productId" in patch && patch.productId !== item.productId) ||
      ("color" in patch && patch.color !== item.color);
    return { ...item, ...patch, imageUrl: identityChanged ? null : item.imageUrl, confidenceLevel: "review", warning: null };
  }) ?? null);
  const previews = useMemo(() => {
    const result = new Map<string, { current: number; next: number }>();
    const stock = new Map(products.map((product) => [product.id, product.stockQty]));
    const colors = new Map(products.flatMap((product) =>
      (product.colorStock ?? []).map((entry) => [`${product.id}:${entry.color.toLowerCase()}`, entry.quantity] as const)
    ));
    for (const item of draft ?? []) {
      const current = item.productId ? (stock.get(item.productId) ?? 0) : 0;
      const quantity = item.quantity ?? 0;
      let next = current;
      if (item.action && item.productId) {
        if (item.color) {
          const colorKey = `${item.productId}:${item.color.toLowerCase()}`;
          const colorCurrent = colors.get(colorKey) ?? 0;
          const colorNext = item.action === "adjustment" ? quantity
            : colorCurrent + (item.action === "receive" ? quantity : -quantity);
          next = current + colorNext - colorCurrent;
          colors.set(colorKey, colorNext);
        } else {
          next = item.action === "adjustment" ? quantity
            : current + (item.action === "receive" ? quantity : -quantity);
        }
        stock.set(item.productId, next);
      }
      result.set(item.id, { current, next });
    }
    return result;
  }, [draft, products]);
  const invalid = (draft ?? []).some((item) => item.confidenceLevel === "blocked" || !item.productId || !item.action || !item.quantity || item.quantity <= 0 || (previews.get(item.id)?.next ?? 0) < 0);
  const confirmAll = () => {
    if (!draft || invalid || confirming || !businessId) return;
    confirm.mutate({ businessId, data: { transcript, requestId: confirmationRequestId.current, items: draft.map((item) => ({ productId: item.productId!, action: item.action as VoiceStockConfirmInputItemsItemAction, quantity: item.quantity!, unit: item.unit, color: item.color || null, size: item.size || null, imageUrl: item.imageUrl || null })) } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(businessId) });
        queryClient.invalidateQueries({ queryKey: getGetVoiceStockHistoryQueryKey(businessId) });
        setDraft(null); setTranscript(""); toast({ title: "Stock updated", description: "Your reviewed changes are now in inventory." });
      },
      onError: () => toast({ title: "Update not applied", description: "Nothing changed. Check your connection and try again.", variant: "destructive" }),
    });
  };

  return <main className="mx-auto min-h-[100dvh] max-w-5xl space-y-5 px-3 py-4 sm:px-6 sm:py-7">
    <input ref={photoInput} type="file" accept="image/*" capture="environment" onChange={handlePhotoSelected} className="hidden" aria-label="Take product photo" />
    <header className="flex items-start justify-between gap-4">
      <div><div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-primary"><Sparkles className="h-3.5 w-3.5" /> Pesa AI · stock desk</div><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Voice to stock</h1><p className="mt-1 max-w-xl text-sm text-muted-foreground">Say what moved. We’ll prepare it, you decide what gets recorded.</p></div>
      <div className="hidden rounded-xl border border-border bg-card px-3 py-2 text-right sm:block"><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Daily safeguard</p><p className="text-sm font-semibold text-primary">Review before apply</p></div>
    </header>
    <section className="overflow-hidden rounded-2xl border border-primary/15 bg-card shadow-[0_12px_35px_-25px_hsl(var(--primary))]">
      <div className="border-b border-border bg-primary/[0.045] p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-semibold">Capture a stock change</p><p className="mt-1 text-xs text-muted-foreground">Audio is sent for transcription, then discarded. Nothing is applied automatically.</p></div>
          <Button data-testid="button-toggle-recording" onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} onPointerCancel={stopRecording} onPointerLeave={() => { if (recording) stopRecording(); }} onKeyDown={handleKeyDown} onKeyUp={handleKeyUp} onContextMenu={(event) => event.preventDefault()} disabled={transcribe.isPending || interpret.isPending} aria-label="Hold to record a stock movement" aria-pressed={recording} className={`h-12 min-w-[168px] touch-none select-none gap-2 rounded-xl ${recording ? "bg-rose-700 hover:bg-rose-800" : "bg-primary hover:bg-primary/90"}`}>{recording ? <><MicOff className="h-5 w-5" /> Listening · {seconds}s</> : <><Mic className="h-5 w-5" /> Hold to record</>}</Button>
        </div>
        {recording && <div data-testid="status-recording" className="mt-4 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800"><span className="h-2 w-2 animate-pulse rounded-full bg-rose-600" />Listening. Speak clearly, then release the button.</div>}
        {micError && <div data-testid="status-microphone-error" className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{micError}</div>}
        {(transcribe.isPending || interpret.isPending) && <div data-testid="status-processing" className="mt-3 flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-900"><Loader2 className="h-4 w-4 animate-spin" />{transcribe.isPending ? "Transcribing your recording…" : "Preparing stock changes for review…"}</div>}
        <div className="mt-4"><label htmlFor="voice-transcript" className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Transcript · editable fallback</label><Textarea id="voice-transcript" data-testid="input-voice-transcript" value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder="Example: received 12 packets of milk, sold 3 packets" className="min-h-20 resize-none bg-background/70 text-sm" disabled={recording || transcribe.isPending} /><div className="mt-3 flex flex-wrap justify-end gap-2"><Button data-testid="button-analyze-transcript" onClick={() => interpretText(transcript)} disabled={!transcript.trim() || recording || interpret.isPending} className="gap-2">{interpret.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Prepare review</Button><Button data-testid="button-reset-voice-stock" variant="ghost" onClick={() => { stopRecording(); setDraft(null); setTranscript(""); setMicError(""); }} disabled={!transcript && !draft} className="gap-2"><RotateCcw className="h-4 w-4" />Clear</Button></div></div>
        {lastProvider && <p className="mt-3 text-right font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Transcribed securely · {lastProvider}</p>}
      </div>
    </section>
    {draft && <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
       <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div><div className="flex items-center gap-2"><PackageCheck className="h-5 w-5 text-primary" /><h2 className="font-bold">Review before applying</h2></div><p className="mt-1 text-xs text-muted-foreground">Amber means one quick choice is needed. Red means stock cannot go below zero.</p></div><Button data-testid="button-confirm-all" onClick={confirmAll} disabled={invalid || confirming} className="h-11 gap-2 rounded-xl">{confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{confirming ? "Applying…" : `Confirm all · ${draft.length}`}</Button></div>
       <div className="divide-y divide-border">{draft.map((item, index) => { const preview = previews.get(item.id); const selectedProduct = products.find((product) => product.id === item.productId); const productInputValue = selectedProduct?.name || item.productName || ""; const suggestions = !item.productId ? rankedProductMatches(item.productName, products).slice(0, 3) : []; const blocked = item.confidenceLevel === "blocked" || !item.productId; const uncertain = !blocked && (item.confidenceLevel === "review" || !!item.warning); return <article data-testid={`card-review-item-${index}`} key={item.id} className={`p-4 transition-colors ${blocked ? "bg-amber-50/80" : uncertain ? "bg-amber-50/80" : "bg-card"}`}>
         <div className="mb-3 flex items-start justify-between gap-2"><div className="flex items-center gap-2">{blocked ? <AlertTriangle className="h-4 w-4 text-amber-700" /> : uncertain ? <AlertTriangle className="h-4 w-4 text-amber-700" /> : <Check className="h-4 w-4 text-emerald-700" />}<span className="text-xs font-bold uppercase tracking-wider">{blocked ? "Choose a product" : uncertain ? "Review this row" : "Ready to apply"}</span></div><Button data-testid={`button-remove-review-${index}`} variant="ghost" size="icon" onClick={() => setDraft((items) => items?.filter((entry) => entry.id !== item.id) ?? null)} className="h-8 w-8 text-muted-foreground"><Trash2 className="h-4 w-4" /></Button></div>
          <div className="grid gap-3 sm:grid-cols-[1.3fr_1fr_0.7fr_0.8fr]"><label className="text-xs font-medium text-muted-foreground">Product<input data-testid={`input-review-product-${index}`} list={`voice-product-options-${index}`} value={productInputValue} onChange={(e) => { const value = e.target.value; const match = findSafeProductMatch(value, products); update(item.id, { productId: match?.id || null, productName: match?.name || value }); }} placeholder="Type or choose a catalogue product" className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" /><datalist id={`voice-product-options-${index}`}>{products.map((product) => <option key={product.id} value={product.name}>{product.stockQty} in stock</option>)}</datalist>{item.evidence && <span className="mt-1 block text-[11px] text-muted-foreground">Heard: “{item.evidence}”</span>}{!item.productId && item.productName && <><span className="mt-1 block text-[11px] font-medium text-amber-800">Choose a product from your catalogue to continue.</span>{suggestions.length > 0 && <div className="mt-2 rounded-lg border border-amber-200 bg-white/70 p-2"><p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-900">Suggested matches</p><div className="flex flex-wrap gap-1.5">{suggestions.map(({ product, score }) => <button key={product.id} type="button" data-testid={`button-product-suggestion-${index}-${product.id}`} onClick={() => update(item.id, { productId: product.id, productName: product.name })} className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-left text-[11px] font-semibold text-amber-950 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"><span className="block">{product.name}</span><span className="font-normal text-amber-800">{product.stockQty} in stock · {Math.round(score * 100)}% match</span></button>)}</div></div>}</>}</label><label className="text-xs font-medium text-muted-foreground">Movement<select data-testid={`select-review-action-${index}`} value={item.action ?? ""} onChange={(e) => update(item.id, { action: e.target.value as VoiceStockItemAction })} className={`mt-1 h-10 w-full rounded-lg border px-2 text-sm font-semibold ${item.action ? actions[item.action].tone : "border-input bg-background"}`}><option value="">Choose action</option>{Object.entries(actions).map(([value, action]) => <option key={value} value={value}>{action.label}</option>)}</select></label><label className="text-xs font-medium text-muted-foreground">Quantity<input data-testid={`input-review-quantity-${index}`} type="number" min="1" value={item.quantity ?? ""} onChange={(e) => update(item.id, { quantity: Number(e.target.value) })} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-semibold" /></label><label className="text-xs font-medium text-muted-foreground">Unit<input data-testid={`input-review-unit-${index}`} value={item.unit} onChange={(e) => update(item.id, { unit: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" /></label></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium text-muted-foreground">Color variant<input data-testid={`input-review-color-${index}`} value={item.color ?? ""} onChange={(e) => update(item.id, { color: e.target.value })} placeholder="Optional" className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm" /></label><label className="text-xs font-medium text-muted-foreground">Size variant<input data-testid={`input-review-size-${index}`} value={item.size ?? ""} onChange={(e) => update(item.id, { size: e.target.value })} placeholder="Optional" className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm" /></label></div>
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 p-2"><Button type="button" variant="outline" size="sm" onClick={() => openPhotoPicker(item.id)} disabled={!item.productId || item.imageUploading} className="gap-2"><Camera className="h-4 w-4" />{item.imageUploading ? "Uploading…" : "📷 Product photo"}</Button>{item.imageUrl && <img src={item.imageUrl} alt={`${item.productName || "Product"} ${item.color || ""}`} className="h-10 w-10 rounded-md border border-border object-cover" />}{item.imageError && <span className="text-xs text-rose-700">{item.imageError}</span>}<span className="text-[11px] text-muted-foreground">One photo per variant · camera product shot</span></div>
         <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-black/5 pt-3 text-xs"><span className="text-muted-foreground">Stock after: <strong className={preview && preview.next < 0 ? "text-rose-700" : "text-foreground"}>{preview?.next ?? "—"}</strong></span><span className="text-right text-muted-foreground">{item.warning || `${Math.round(item.confidence * 100)}% confidence`}</span></div>
      </article>; })}</div>
       {invalid && <div data-testid="status-review-blocked" className="flex items-center gap-2 border-t border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-900"><AlertTriangle className="h-4 w-4" />Select a product, action, and quantity before confirming.</div>}
    </section>}
    <section className="rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3"><History className="h-4 w-4 text-primary" /><h2 className="text-sm font-bold">Recent voice updates</h2></div>
      {historyLoading || productsLoading ? <div className="space-y-2 p-4"><div className="h-10 animate-pulse rounded-lg bg-muted" /><div className="h-10 animate-pulse rounded-lg bg-muted" /></div> : history.length ? <div className="divide-y divide-border">{history.slice(0, 5).map((entry, index) => <div data-testid={`row-voice-history-${index}`} key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3 text-xs"><div><p className="font-semibold">{entry.productName}</p><p className="mt-0.5 text-muted-foreground">{entry.action} · {entry.quantity} {entry.unit}</p></div><span className={`font-mono font-bold ${entry.delta >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{entry.delta >= 0 ? "+" : ""}{entry.delta}</span></div>)}</div> : <p data-testid="text-empty-voice-history" className="px-4 py-6 text-center text-xs text-muted-foreground">No voice updates yet. Your confirmed changes will appear here.</p>}
    </section>
  </main>;
}
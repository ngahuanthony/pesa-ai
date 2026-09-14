import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, History, Loader2, Mic, MicOff, PackageCheck, RotateCcw, ShieldAlert, Sparkles, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  useConfirmVoiceStock, useGetMe, useGetVoiceStockHistory, useInterpretVoiceStock,
  useListProducts, useTranscribeVoiceStock, getListProductsQueryKey, getGetVoiceStockHistoryQueryKey,
  VoiceStockItem, VoiceStockItemAction, VoiceStockConfirmInputItemsItemAction,
} from "@workspace/api-client-react";

type Draft = VoiceStockItem & { id: string };
const actions: Record<string, { label: string; short: string; tone: string }> = {
  receive: { label: "Receive / Add", short: "ADD", tone: "text-emerald-800 bg-emerald-100 border-emerald-200" },
  sell: { label: "Sell / Deduct", short: "SELL", tone: "text-amber-900 bg-amber-100 border-amber-200" },
  damage: { label: "Damage / Deduct", short: "DAMAGE", tone: "text-rose-800 bg-rose-100 border-rose-200" },
  missing: { label: "Missing / Deduct", short: "MISSING", tone: "text-rose-800 bg-rose-100 border-rose-200" },
  adjustment: { label: "Adjust / Set", short: "SET", tone: "text-sky-800 bg-sky-100 border-sky-200" },
};

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
  const confirming = confirm.isPending;

  const interpretText = useCallback((text: string) => {
    if (!text.trim() || !businessId) return;
    interpret.mutate({ businessId, data: { transcript: text.trim() } }, {
      onSuccess: (result) => {
        setTranscript(result.normalizedTranscript || result.transcript);
        confirmationRequestId.current = crypto.randomUUID();
        setDraft(result.items.map((item) => ({ ...item, id: crypto.randomUUID() })));
        if (!result.items.length) toast({ title: "Nothing to review", description: "Try saying a product, quantity, and action." });
      },
      onError: () => toast({ title: "Could not understand that", description: "Check the transcript and try again.", variant: "destructive" }),
    });
  }, [businessId, interpret, toast]);

  const stopRecording = useCallback(() => {
    pressActive.current = false;
    const activeRecorder = recorder.current;
    if (!activeRecorder || activeRecorder.state === "inactive") return;
    setRecording(false);
    if (timer.current) clearInterval(timer.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
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
        const blob = new Blob(chunks.current, { type: next.mimeType || mimeType || "audio/webm" });
        chunks.current = [];
        if (!blob.size) { setMicError("No audio was captured. Hold the button while speaking, then release it."); return; }
        transcribe.mutate({ businessId, data: blob }, {
          onSuccess: (result) => { setLastProvider(result.provider); setTranscript(result.normalizedTranscript || result.transcript); interpretText(result.normalizedTranscript || result.transcript); },
          onError: (error) => {
            const detail = error instanceof Error ? error.message.replace(/^HTTP \d+[^:]*:\s*/, "") : "The transcription service returned an unexpected error.";
            setMicError(`Audio could not be transcribed: ${detail}`);
          },
        });
      };
      next.start(250); setRecording(true); setSeconds(0);
      timer.current = setInterval(() => setSeconds((value) => value + 1), 1000);
      if (!pressActive.current) stopRecording();
    } catch {
      pressActive.current = false;
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

  const update = (id: string, patch: Partial<Draft>) => setDraft((items) => items?.map((item) =>
    item.id === id ? { ...item, ...patch, confidenceLevel: "review", warning: null } : item
  ) ?? null);
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
    confirm.mutate({ businessId, data: { transcript, requestId: confirmationRequestId.current, items: draft.map((item) => ({ productId: item.productId!, action: item.action as VoiceStockConfirmInputItemsItemAction, quantity: item.quantity!, unit: item.unit, color: item.color || null, size: item.size || null })) } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(businessId) });
        queryClient.invalidateQueries({ queryKey: getGetVoiceStockHistoryQueryKey(businessId) });
        setDraft(null); setTranscript(""); toast({ title: "Stock updated", description: "Your reviewed changes are now in inventory." });
      },
      onError: () => toast({ title: "Update not applied", description: "Nothing changed. Check your connection and try again.", variant: "destructive" }),
    });
  };

  return <main className="mx-auto min-h-[100dvh] max-w-5xl space-y-5 px-3 py-4 sm:px-6 sm:py-7">
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
      <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div><div className="flex items-center gap-2"><PackageCheck className="h-5 w-5 text-primary" /><h2 className="font-bold">Review before applying</h2></div><p className="mt-1 text-xs text-muted-foreground">Yellow means check the match. Red means this row cannot be applied.</p></div><Button data-testid="button-confirm-all" onClick={confirmAll} disabled={invalid || confirming} className="h-11 gap-2 rounded-xl">{confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{confirming ? "Applying…" : `Confirm all · ${draft.length}`}</Button></div>
      <div className="divide-y divide-border">{draft.map((item, index) => { const preview = previews.get(item.id); const blocked = item.confidenceLevel === "blocked" || !item.productId; const uncertain = !blocked && (item.confidenceLevel === "review" || !!item.warning); return <article data-testid={`card-review-item-${index}`} key={item.id} className={`p-4 transition-colors ${blocked ? "bg-rose-50/80" : uncertain ? "bg-amber-50/80" : "bg-card"}`}>
        <div className="mb-3 flex items-start justify-between gap-2"><div className="flex items-center gap-2">{blocked ? <ShieldAlert className="h-4 w-4 text-rose-700" /> : uncertain ? <AlertTriangle className="h-4 w-4 text-amber-700" /> : <Check className="h-4 w-4 text-emerald-700" />}<span className="text-xs font-bold uppercase tracking-wider">{blocked ? "Blocked · fix match" : uncertain ? "Review this row" : "Ready to apply"}</span></div><Button data-testid={`button-remove-review-${index}`} variant="ghost" size="icon" onClick={() => setDraft((items) => items?.filter((entry) => entry.id !== item.id) ?? null)} className="h-8 w-8 text-muted-foreground"><Trash2 className="h-4 w-4" /></Button></div>
        <div className="grid gap-3 sm:grid-cols-[1.3fr_1fr_0.7fr_0.8fr]"><label className="text-xs font-medium text-muted-foreground">Product<select data-testid={`select-review-product-${index}`} value={item.productId ?? ""} onChange={(e) => update(item.id, { productId: e.target.value || null })} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-2 text-sm"><option value="">Choose product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.stockQty} in stock</option>)}</select></label><label className="text-xs font-medium text-muted-foreground">Movement<select data-testid={`select-review-action-${index}`} value={item.action ?? ""} onChange={(e) => update(item.id, { action: e.target.value as VoiceStockItemAction })} className={`mt-1 h-10 w-full rounded-lg border px-2 text-sm font-semibold ${item.action ? actions[item.action].tone : "border-input bg-background"}`}><option value="">Choose action</option>{Object.entries(actions).map(([value, action]) => <option key={value} value={value}>{action.label}</option>)}</select></label><label className="text-xs font-medium text-muted-foreground">Quantity<input data-testid={`input-review-quantity-${index}`} type="number" min="1" value={item.quantity ?? ""} onChange={(e) => update(item.id, { quantity: Number(e.target.value) })} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-semibold" /></label><label className="text-xs font-medium text-muted-foreground">Unit<input data-testid={`input-review-unit-${index}`} value={item.unit} onChange={(e) => update(item.id, { unit: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" /></label></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium text-muted-foreground">Color variant<input data-testid={`input-review-color-${index}`} value={item.color ?? ""} onChange={(e) => update(item.id, { color: e.target.value })} placeholder="Optional" className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm" /></label><label className="text-xs font-medium text-muted-foreground">Size variant<input data-testid={`input-review-size-${index}`} value={item.size ?? ""} onChange={(e) => update(item.id, { size: e.target.value })} placeholder="Optional" className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm" /></label></div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-black/5 pt-3 text-xs"><span className="text-muted-foreground">Stock after: <strong className={preview && preview.next < 0 ? "text-rose-700" : "text-foreground"}>{preview?.next ?? "—"}</strong></span><span className="font-mono uppercase tracking-wider text-muted-foreground">{item.evidence || item.warning || `${Math.round(item.confidence * 100)}% confidence`}</span></div>
      </article>; })}</div>
      {invalid && <div data-testid="status-review-blocked" className="flex items-center gap-2 border-t border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800"><ShieldAlert className="h-4 w-4" />Fix blocked or invalid rows before confirming.</div>}
    </section>}
    <section className="rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3"><History className="h-4 w-4 text-primary" /><h2 className="text-sm font-bold">Recent voice updates</h2></div>
      {historyLoading || productsLoading ? <div className="space-y-2 p-4"><div className="h-10 animate-pulse rounded-lg bg-muted" /><div className="h-10 animate-pulse rounded-lg bg-muted" /></div> : history.length ? <div className="divide-y divide-border">{history.slice(0, 5).map((entry, index) => <div data-testid={`row-voice-history-${index}`} key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3 text-xs"><div><p className="font-semibold">{entry.productName}</p><p className="mt-0.5 text-muted-foreground">{entry.action} · {entry.quantity} {entry.unit}</p></div><span className={`font-mono font-bold ${entry.delta >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{entry.delta >= 0 ? "+" : ""}{entry.delta}</span></div>)}</div> : <p data-testid="text-empty-voice-history" className="px-4 py-6 text-center text-xs text-muted-foreground">No voice updates yet. Your confirmed changes will appear here.</p>}
    </section>
  </main>;
}
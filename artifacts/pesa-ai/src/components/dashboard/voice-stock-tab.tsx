import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Mic, MicOff, Loader2, Check, AlertTriangle, Trash2, ArrowRight, Save, History, RefreshCcw, Package, ShieldCheck, Volume2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMe,
  useListProducts, getListProductsQueryKey,
  useInterpretVoiceStock,
  useConfirmVoiceStock,
  useGetVoiceStockHistory, getGetVoiceStockHistoryQueryKey,
  VoiceStockItem,
  VoiceStockItemAction,
  VoiceStockConfirmInputItemsItemAction,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

const ACTION_LABELS: Record<string, string> = {
  receive: "Receive (Add)",
  sell: "Sell (Deduct)",
  damage: "Damage (Deduct)",
  missing: "Missing (Deduct)",
  adjustment: "Adjust (Set)",
};

const ACTION_COLORS: Record<string, string> = {
  receive: "text-emerald-700 bg-emerald-50 border-emerald-200",
  sell: "text-amber-700 bg-amber-50 border-amber-200",
  damage: "text-rose-700 bg-rose-50 border-rose-200",
  missing: "text-rose-700 bg-rose-50 border-rose-200",
  adjustment: "text-blue-700 bg-blue-50 border-blue-200",
};

type MicrophonePermission = "unknown" | "prompt" | "granted" | "denied";

export function VoiceStockTab() {
  const { data: me } = useGetMe();
  const businessId = me?.business?.id || "";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: products = [] } = useListProducts(businessId, {
    query: { enabled: !!businessId, queryKey: getListProductsQueryKey(businessId) }
  });

  const { data: history = [], isLoading: isLoadingHistory } = useGetVoiceStockHistory(businessId, undefined, {
    query: { enabled: !!businessId, queryKey: getGetVoiceStockHistoryQueryKey(businessId) }
  });

  const interpretMutation = useInterpretVoiceStock();
  const confirmMutation = useConfirmVoiceStock();

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [draftItems, setDraftItems] = useState<(VoiceStockItem & { _id: string })[] | null>(null);
  const [confirmedTranscript, setConfirmedTranscript] = useState("");
  const [isSupported, setIsSupported] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const [micPermission, setMicPermission] = useState<MicrophonePermission>("unknown");
  const [isRequestingMic, setIsRequestingMic] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [playbackUnavailable, setPlaybackUnavailable] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const keepListeningRef = useRef(false);
  const transcriptRef = useRef("");
  const recognitionBaseRef = useRef("");
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingSecondsRef = useRef(0);

  const stopAudioRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  const stopVoiceCapture = useCallback(() => {
    keepListeningRef.current = false;
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    restartTimerRef.current = null;
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
    try {
      recognitionRef.current?.stop();
    } catch {
      // The browser may already be between recognition segments.
    }
    setIsListening(false);
    stopAudioRecording();
  }, [stopAudioRecording]);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRec) {
        const recognition = new SpeechRec();
        const isMobile = /Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent);
        recognition.continuous = !isMobile;
        recognition.interimResults = true;
        recognition.lang = "en-KE"; // Best effort for English/Kiswahili mix
        recognition.maxAlternatives = 1;

        recognition.onresult = (event: any) => {
          let currentTranscript = "";
          for (let i = 0; i < event.results.length; i++) {
            currentTranscript += event.results[i][0].transcript;
          }
          const combined = `${recognitionBaseRef.current} ${currentTranscript}`.trim();
          transcriptRef.current = combined;
          setTranscript(combined);
        };

        recognition.onerror = (event: any) => {
          const messages: Record<string, string> = {
            "not-allowed": "Microphone access was blocked. Allow microphone permission for pesaai.africa, then try again.",
            "service-not-allowed": "Speech recognition is blocked in this browser. Allow microphone access or type the update instead.",
            "audio-capture": "No microphone was found. Check your phone microphone and try again.",
            "network": "The phone's speech service could not connect. Check your connection or type the update instead.",
            "no-speech": "No speech was detected. Tap Speak and try again.",
          };
          if (event.error === "no-speech" && keepListeningRef.current) return;
          if (event.error === "not-allowed" || event.error === "service-not-allowed") {
            setMicPermission("denied");
            window.localStorage.removeItem("pesa-voice-microphone-ready");
          }
          setSpeechError(messages[event.error] || "Voice capture could not start. Please try again or type the update.");
          stopVoiceCapture();
        };

        recognition.onend = () => {
          if (!keepListeningRef.current) {
            setIsListening(false);
            return;
          }
          recognitionBaseRef.current = transcriptRef.current;
          restartTimerRef.current = setTimeout(() => {
            if (!keepListeningRef.current) return;
            try {
              recognition.start();
            } catch {
              stopVoiceCapture();
              setSpeechError("Voice recognition stopped unexpectedly. Your captured words are still available to review.");
            }
          }, 150);
        };

        recognitionRef.current = recognition;
      } else {
        setIsSupported(false);
      }

      let permissionStatus: PermissionStatus | undefined;
      if (navigator.permissions?.query) {
        navigator.permissions.query({ name: "microphone" as PermissionName })
          .then((status) => {
            permissionStatus = status;
            setMicPermission(status.state as MicrophonePermission);
            if (status.state === "granted") {
              window.localStorage.setItem("pesa-voice-microphone-ready", "true");
            }
            status.onchange = () => {
              setMicPermission(status.state as MicrophonePermission);
              if (status.state === "granted") {
                window.localStorage.setItem("pesa-voice-microphone-ready", "true");
              }
            };
          })
          .catch(() => setMicPermission(
            window.localStorage.getItem("pesa-voice-microphone-ready") === "true" ? "granted" : "prompt"
          ));
      } else {
        setMicPermission(
          window.localStorage.getItem("pesa-voice-microphone-ready") === "true" ? "granted" : "prompt"
        );
      }

      return () => {
        stopVoiceCapture();
        if (permissionStatus) permissionStatus.onchange = null;
      };
    }
    return undefined;
  }, [stopVoiceCapture]);

  const startRecognition = useCallback(() => {
    try {
      setSpeechError("");
      recognitionBaseRef.current = transcriptRef.current;
      recognitionRef.current?.start();
      setIsListening(true);
    } catch {
      stopVoiceCapture();
      setSpeechError("Voice capture could not start. Check microphone permission, then try again.");
    }
  }, [stopVoiceCapture]);

  const startVoiceCapture = useCallback((stream: MediaStream) => {
    mediaStreamRef.current = stream;
    audioChunksRef.current = [];
    setAudioUrl("");
    setPlaybackUnavailable(false);

    if (typeof MediaRecorder !== "undefined") {
      try {
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };
        recorder.onstop = () => {
          if (audioChunksRef.current.length > 0) {
            const blob = new Blob(audioChunksRef.current, {
              type: recorder.mimeType || "audio/webm",
            });
            setAudioUrl(URL.createObjectURL(blob));
          }
          audioChunksRef.current = [];
          mediaRecorderRef.current = null;
        };
        recorder.start();
      } catch {
        setPlaybackUnavailable(true);
      }
    } else {
      setPlaybackUnavailable(true);
    }

    startRecognition();
  }, [startRecognition]);

  const requestMicrophone = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setSpeechError("This browser cannot request microphone access. Type the stock update instead.");
      return;
    }

    setIsRequestingMic(true);
    setSpeechError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermission("granted");
      window.localStorage.setItem("pesa-voice-microphone-ready", "true");
      keepListeningRef.current = true;
      recordingSecondsRef.current = 0;
      setRecordingSeconds(0);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = setInterval(() => {
        recordingSecondsRef.current += 1;
        setRecordingSeconds(recordingSecondsRef.current);
        if (recordingSecondsRef.current >= 59) stopVoiceCapture();
      }, 1000);
      startVoiceCapture(stream);
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      setMicPermission(name === "NotAllowedError" ? "denied" : "prompt");
      setSpeechError(
        name === "NotAllowedError"
          ? "Microphone access is blocked in your phone settings. Follow the steps below, then tap Try again."
          : "The microphone could not start. Check that another app is not using it, then try again."
      );
    } finally {
      setIsRequestingMic(false);
    }
  }, [startVoiceCapture, stopVoiceCapture]);

  const toggleListen = useCallback(() => {
    if (isListening) {
      stopVoiceCapture();
    } else {
      void requestMicrophone();
    }
  }, [isListening, requestMicrophone, stopVoiceCapture]);

  const isAppleMobile = typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isAndroid = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);

  const handleAnalyze = () => {
    if (!transcript.trim()) return;
    interpretMutation.mutate({
      businessId,
      data: { transcript }
    }, {
      onSuccess: (data) => {
        if (data.items.length === 0) {
          toast({ title: "No actions detected", description: "Could not understand any stock changes from the text." });
        } else {
          setConfirmedTranscript(data.transcript);
          setDraftItems(data.items.map(it => ({ ...it, _id: crypto.randomUUID() })));
        }
      },
      onError: (err: any) => {
        toast({ title: "Error analyzing", description: err?.message || "Please try again.", variant: "destructive" });
      }
    });
  };

  const handleUpdateItem = (id: string, updates: Partial<VoiceStockItem>) => {
    setDraftItems(prev => prev ? prev.map(item => item._id === id ? { ...item, ...updates, warning: undefined } : item) : null);
  };

  const handleRemoveItem = (id: string) => {
    setDraftItems(prev => prev ? prev.filter(item => item._id !== id) : null);
  };

  const draftPreviews = useMemo(() => {
    const previews = new Map<string, { current: number; proposed: number }>();
    const stagedStock = new Map<string, number>();

    for (const item of draftItems || []) {
      const current = item.productId
        ? (stagedStock.get(item.productId) ?? item.currentStock ?? 0)
        : (item.currentStock ?? 0);
      const quantity = item.quantity ?? 0;
      const proposed = item.action === "receive"
        ? current + quantity
        : item.action === "adjustment"
          ? quantity
          : item.action
            ? current - quantity
            : current;

      previews.set(item._id, { current, proposed });
      if (item.productId && item.action && quantity > 0) {
        stagedStock.set(item.productId, proposed);
      }
    }

    return previews;
  }, [draftItems]);

  const isValid = useMemo(() => {
    if (!draftItems || draftItems.length === 0) return false;
    return draftItems.every(it => {
      if (!it.productId || !it.action || it.quantity === null || it.quantity <= 0) return false;
      if (it.warning) return false;
      return (draftPreviews.get(it._id)?.proposed ?? -1) >= 0;
    });
  }, [draftItems, draftPreviews]);

  const handleConfirm = () => {
    if (!draftItems || !isValid) return;
    
    confirmMutation.mutate({
      businessId,
      data: {
        transcript: confirmedTranscript,
        items: draftItems.map(it => ({
          productId: it.productId!,
          action: it.action as VoiceStockConfirmInputItemsItemAction,
          quantity: it.quantity!,
          unit: it.unit
        }))
      }
    }, {
      onSuccess: () => {
        toast({ title: "Success", description: "Stock updated successfully.", variant: "default" });
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 5000);
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(businessId) });
        queryClient.invalidateQueries({ queryKey: getGetVoiceStockHistoryQueryKey(businessId) });
        setDraftItems(null);
        transcriptRef.current = "";
        setTranscript("");
      },
      onError: (err: any) => {
        toast({ title: "Failed to apply updates", description: err?.message || "Please try again.", variant: "destructive" });
      }
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      
      {/* ── Input Section ── */}
      <div className="bg-white border border-border rounded-xl p-5 shadow-sm">
        <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
          <Mic className="h-5 w-5 text-primary" />
          Log Stock Changes
        </h2>
        
        {showSuccess && (
          <div data-testid="status-success" className="mb-3 text-sm font-medium text-emerald-700 bg-emerald-50 p-3 rounded-lg border border-emerald-200 flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
            <Check className="h-4 w-4" /> Stock updated successfully.
          </div>
        )}

        {isSupported && micPermission !== "granted" && (
          <div data-testid="card-microphone-setup" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-emerald-700 shadow-sm">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-emerald-950">
                  {micPermission === "denied" ? "Allow microphone in phone settings" : "Set up voice updates"}
                </p>
                {micPermission === "denied" ? (
                  <div className="mt-1 space-y-1 text-xs leading-relaxed text-emerald-900">
                    {isAppleMobile ? (
                      <p>Open iPhone Settings → Apps → your browser → turn on Microphone. Return here and tap Try again.</p>
                    ) : isAndroid ? (
                      <p>Open Settings → Apps → your browser → Permissions → Microphone → Allow. Return here and tap Try again.</p>
                    ) : (
                      <p>Open your browser's site settings for pesaai.africa, allow Microphone, then tap Try again.</p>
                    )}
                  </div>
                ) : (
                  <p className="mt-1 text-xs leading-relaxed text-emerald-900">
                    Tap once and approve the phone prompt. Pesa AI will start listening immediately and remember your setup.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Button
                    data-testid="button-enable-microphone"
                    type="button"
                    size="sm"
                    onClick={() => void requestMicrophone()}
                    disabled={isRequestingMic}
                    className="touch-manipulation"
                  >
                    {isRequestingMic ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mic className="mr-2 h-4 w-4" />}
                    {isRequestingMic ? "Requesting access..." : micPermission === "denied" ? "Try again" : "Enable microphone"}
                  </Button>
                  <span className="text-xs text-emerald-800">You can always type instead.</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {!isSupported && (
          <div data-testid="status-unsupported" className="mb-3 text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
            Voice recognition is not supported in this browser. Please type your stock changes instead.
          </div>
        )}
        {isListening && (
          <div data-testid="status-listening" className="mb-3 text-xs text-blue-600 bg-blue-50 p-2 rounded border border-blue-200">
            Listening... Speak your stock changes now. {recordingSeconds}s / 59s
          </div>
        )}
        {speechError && (
          <div data-testid="status-speech-error" className="mb-3 text-xs text-rose-700 bg-rose-50 p-2 rounded border border-rose-200">
            {speechError}
          </div>
        )}

        <div className="relative">
          <Textarea 
            data-testid="input-voice-transcript"
            placeholder={isSupported ? "e.g. 'I received 10 bags of unga and sold 2 packets of milk'" : "Type your stock changes here..."}
            className="min-h-[120px] text-base resize-none pb-3 sm:pb-14 bg-muted/30"
            value={transcript}
            onChange={(e) => {
              transcriptRef.current = e.target.value;
              setTranscript(e.target.value);
            }}
            disabled={isListening || interpretMutation.isPending}
          />
          
          <div className="mt-3 flex items-center justify-end gap-2 sm:absolute sm:bottom-3 sm:right-3 sm:mt-0 z-10">
            {isSupported && (
              <Button
                data-testid="button-toggle-listen"
                type="button"
                variant={isListening ? "destructive" : "secondary"}
                onClick={toggleListen}
                className={`gap-2 touch-manipulation ${isListening ? "animate-pulse shadow-lg" : ""}`}
                disabled={interpretMutation.isPending || isRequestingMic}
              >
                {isRequestingMic ? <Loader2 className="h-4 w-4 animate-spin" /> : isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {isRequestingMic ? "Starting..." : isListening ? "Stop Listening" : "Speak"}
              </Button>
            )}
            <Button 
              data-testid="button-analyze-transcript"
              type="button" 
              onClick={handleAnalyze} 
              disabled={!transcript.trim() || isListening || interpretMutation.isPending}
            >
              {interpretMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Analyze
            </Button>
          </div>
        </div>

        {audioUrl && (
          <div data-testid="card-voice-playback" className="mt-4 rounded-lg border border-border bg-muted/20 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <Volume2 className="h-4 w-4" />
                Listen to your recording
              </div>
              <Button
                data-testid="button-discard-recording"
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="Discard recording"
                onClick={() => setAudioUrl("")}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <audio data-testid="audio-voice-playback" controls preload="metadata" src={audioUrl} className="h-10 w-full" />
            <p className="mt-2 text-xs text-muted-foreground">
              This recording stays on this device and is discarded when you close or refresh the page.
            </p>
          </div>
        )}

        {playbackUnavailable && (
          <div data-testid="status-playback-unavailable" className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
            Voice transcription works, but audio playback is not supported by this browser.
          </div>
        )}
      </div>

      {/* ── Review Draft Items ── */}
      {draftItems && (
        <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-primary/5 border-b border-border px-5 py-4 flex items-center justify-between">
            <h3 className="font-semibold text-primary flex items-center gap-2">
              <Check className="h-5 w-5" />
              Review Interpreted Actions
            </h3>
            <Button data-testid="button-discard-drafts" variant="ghost" size="sm" onClick={() => setDraftItems(null)} className="h-8">
              Discard
            </Button>
          </div>
          
          <div className="divide-y divide-border">
            {draftItems.map((item, idx) => {
              const { current, proposed } = draftPreviews.get(item._id) ?? {
                current: item.currentStock ?? 0,
                proposed: item.currentStock ?? 0,
              };
              const hasError = !item.productId || !item.action || !item.quantity || item.quantity <= 0 || proposed < 0;
              const hasWarning = !!item.warning;
              
              return (
                <div key={item._id} data-testid={`card-draft-item-${idx}`} className={`p-4 ${hasError ? 'bg-rose-50/50' : hasWarning ? 'bg-amber-50/50' : 'hover:bg-muted/20'}`}>
                  
                  {(hasError || hasWarning) && (
                    <div data-testid={`status-draft-error-${idx}`} className={`text-xs font-medium mb-3 flex items-center gap-1.5 ${hasError ? 'text-rose-600' : 'text-amber-600'}`}>
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {hasError ? (proposed < 0 ? "Proposed stock cannot be negative." : "Missing information or invalid quantity.") : item.warning}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                    
                    {/* Action Select */}
                    <div className="sm:col-span-3">
                      <Select 
                        value={item.action || ""} 
                        onValueChange={(val) => handleUpdateItem(item._id, { action: val as VoiceStockItemAction })}
                      >
                        <SelectTrigger data-testid={`select-draft-action-${idx}`} className={`h-9 font-medium border ${item.action ? ACTION_COLORS[item.action as string] : ''}`}>
                          <SelectValue placeholder="Select action" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(ACTION_LABELS).map(([val, label]) => (
                            <SelectItem key={val} value={val}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Product Select */}
                    <div className="sm:col-span-5">
                      <Select 
                        value={item.productId || "unmatched"} 
                        onValueChange={(val) => {
                          const prod = products.find(p => p.id === val);
                          if (prod) {
                            handleUpdateItem(item._id, { productId: prod.id, productName: prod.name, currentStock: prod.stockQty });
                          }
                        }}
                      >
                        <SelectTrigger data-testid={`select-draft-product-${idx}`} className={`h-9 ${!item.productId ? 'border-rose-300 ring-rose-200' : ''}`}>
                          <SelectValue placeholder="Select product" />
                        </SelectTrigger>
                        <SelectContent>
                          {!item.productId && <SelectItem value="unmatched" disabled>Select a product...</SelectItem>}
                          {products.map(p => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} ({p.stockQty} in stock)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Quantity Input */}
                    <div className="sm:col-span-2">
                      <Input 
                        data-testid={`input-draft-quantity-${idx}`}
                        type="number" 
                        min="1"
                        placeholder="Qty"
                        className={`h-9 w-full ${(!item.quantity || item.quantity <= 0) ? 'border-rose-300 ring-rose-200' : ''}`}
                        value={item.quantity || ""}
                        onChange={(e) => handleUpdateItem(item._id, { quantity: Number(e.target.value) || 0 })}
                      />
                    </div>
                    
                    {/* Unit Input */}
                    <div className="sm:col-span-1">
                      <Input
                        data-testid={`input-draft-unit-${idx}`}
                        type="text"
                        placeholder="Unit"
                        className="h-9 w-full"
                        value={item.unit || ""}
                        onChange={(e) => handleUpdateItem(item._id, { unit: e.target.value })}
                      />
                    </div>

                    {/* Delete Action */}
                    <div className="sm:col-span-1 flex justify-end">
                      <Button data-testid={`button-delete-draft-${idx}`} variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-rose-600" onClick={() => handleRemoveItem(item._id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  {/* Stock Preview */}
                  {item.productId && item.quantity! > 0 && item.action && (
                    <div data-testid={`text-draft-preview-${idx}`} className="mt-3 flex items-center gap-2 text-xs font-medium bg-white px-3 py-1.5 rounded border border-border w-max">
                      <span className="text-muted-foreground">Stock preview:</span>
                      <span>{current}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className={
                        item.action === 'receive' || item.action === 'adjustment' ? 'text-emerald-600' : 
                        (proposed < 0 ? 'text-rose-600' : 'text-amber-600')
                      }>
                        {proposed}
                      </span>
                    </div>
                  )}

                </div>
              );
            })}
            
            {draftItems.length === 0 && (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No items to review.
              </div>
            )}
          </div>
          
          <div className="p-4 bg-muted/20 border-t border-border flex justify-end gap-3">
            <Button 
              data-testid="button-confirm-stock"
              size="lg" 
              onClick={handleConfirm} 
              disabled={!isValid || confirmMutation.isPending || draftItems.length === 0}
              className="w-full sm:w-auto"
            >
              {confirmMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              <Save className="h-4 w-4 mr-2" />
              Confirm {draftItems.length} {draftItems.length === 1 ? 'Action' : 'Actions'}
            </Button>
          </div>
        </div>
      )}

      {/* ── Recent History ── */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <History className="h-4 w-4" />
          Recent Voice Entries
        </h3>
        
        {isLoadingHistory ? (
          <div className="text-center p-8 text-muted-foreground text-sm flex flex-col items-center gap-2">
            <RefreshCcw className="h-5 w-5 animate-spin" />
            Loading history...
          </div>
        ) : history.length === 0 ? (
          <div className="bg-white border border-border rounded-xl p-8 text-center shadow-sm">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <Package className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">No recent stock changes</p>
            <p className="text-xs text-muted-foreground">Changes recorded via voice will appear here.</p>
          </div>
        ) : (
          <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden divide-y divide-border">
            {history.map((mov, idx) => (
              <div key={mov.id} data-testid={`row-history-${idx}`} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/20 transition-colors">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-sm truncate">{mov.productName}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${ACTION_COLORS[mov.action] || 'bg-gray-100 text-gray-700'}`}>
                      {mov.action}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    {format(new Date(mov.createdAt), "MMM d, h:mm a")}
                    {mov.transcript && (
                      <>
                        <span>•</span>
                        <span className="truncate italic">"{mov.transcript}"</span>
                      </>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-3 text-sm font-medium shrink-0 bg-muted/30 px-3 py-1.5 rounded-lg">
                  <span data-testid={`text-history-prev-${idx}`} className="text-muted-foreground">{mov.previousStock}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span data-testid={`text-history-delta-${idx}`} className={mov.delta > 0 ? "text-emerald-600" : mov.delta < 0 ? "text-rose-600" : "text-foreground"}>
                    {mov.delta > 0 ? "+" : ""}{mov.delta}
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span data-testid={`text-history-result-${idx}`} className="font-bold text-foreground">{mov.resultingStock}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

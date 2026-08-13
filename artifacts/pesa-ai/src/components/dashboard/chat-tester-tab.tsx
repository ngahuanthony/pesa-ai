import {
  useGetMe, useGetChatHistory, getGetChatHistoryQueryKey, useSendChatMessage,
} from "@workspace/api-client-react";
import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Send, Phone, Bot, RefreshCw } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";

export function ChatTesterTab() {
  const { data: me } = useGetMe();
  const businessId = me?.business?.id || "";

  const [testPhone, setTestPhone] = useState("254700000000");
  const [message, setMessage]     = useState("");

  const { data: history, isLoading } = useGetChatHistory(businessId, testPhone, {
    query: { enabled: !!businessId && !!testPhone, queryKey: getGetChatHistoryQueryKey(businessId, testPhone) },
  });

  const sendMessage = useSendChatMessage();
  const queryClient = useQueryClient();
  const scrollRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history, sendMessage.isPending]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !testPhone) return;
    const currentMsg = message;
    setMessage("");
    sendMessage.mutate({ businessId, data: { customerPhone: testPhone, message: currentMsg } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetChatHistoryQueryKey(businessId, testPhone) }),
    });
  };

  const clearThread = () => {
    setTestPhone("254" + Math.floor(700000000 + Math.random() * 99999999));
  };

  const personaName = me?.business?.personaName || me?.business?.name || "Assistant";

  return (
    <div className="grid md:grid-cols-[280px_1fr] gap-4" style={{ height: "580px" }}>
      {/* Left panel */}
      <div className="flex flex-col gap-5 border border-border rounded-xl p-5 bg-muted/20 overflow-auto">
        {/* Persona card */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/15">
          <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{personaName}</p>
            <p className="text-xs text-primary font-medium">Active &amp; ready</p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          The assistant knows your products and can take orders, answer questions, and handle customer chats — just like it would on real WhatsApp.
        </p>

        {/* Phone input */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Test customer number</label>
          <div className="relative">
            <Phone className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-9 text-sm"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="2547XXXXXXXX"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">Each phone number is a separate conversation thread.</p>
        </div>

        {/* New thread button */}
        <button
          onClick={clearThread}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Start fresh thread
        </button>

        {/* Tips */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-foreground">Try asking:</p>
          {["What do you sell?", "How much is [product name]?", "I want to order 2 of those"].map((tip) => (
            <button
              key={tip}
              onClick={() => setMessage(tip)}
              className="w-full text-left text-xs text-muted-foreground hover:text-foreground hover:bg-muted px-2 py-1.5 rounded-lg transition-colors"
            >
              "{tip}"
            </button>
          ))}
        </div>
      </div>

      {/* WhatsApp chat panel */}
      <div className="flex flex-col rounded-xl overflow-hidden border border-border shadow-sm" style={{ background: "#efeae2" }}>
        {/* Chat header */}
        <div className="flex items-center gap-3 px-4 py-3" style={{ background: "#075e54" }}>
          <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            <SiWhatsapp className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-tight">{personaName}</p>
            <p className="text-[11px] text-white/70">Test mode — messages aren't sent to real WhatsApp</p>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 space-y-3"
          style={{
            backgroundImage: "url('https://web.whatsapp.com/img/bg-chat-tile-dark_04fcacde539c58cca6745483d4858c52.png')",
            backgroundRepeat: "repeat",
            backgroundSize: "412px 749px",
          }}
        >
          {!history?.length && !isLoading && (
            <div className="flex justify-center pt-6">
              <span className="bg-[#fff9c4] text-xs text-gray-600 px-4 py-2 rounded-lg shadow-sm">
                Send a message to start the conversation
              </span>
            </div>
          )}

          {history?.map((msg) => {
            const isAI = msg.role === "ai";
            return (
              <div key={msg.id} className={`flex ${isAI ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[75%] rounded-xl px-3 pt-2 pb-5 shadow-sm relative text-sm leading-relaxed whitespace-pre-wrap ${
                  isAI ? "bg-white text-gray-900 rounded-tl-none" : "bg-[#d9fdd3] text-gray-900 rounded-tr-none"
                }`}>
                  {msg.content}
                  <span className="text-[10px] text-gray-400 absolute bottom-1.5 right-2.5">
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            );
          })}

          {sendMessage.isPending && (
            <div className="flex justify-start">
              <div className="bg-white rounded-xl rounded-tl-none px-4 py-3 shadow-sm text-sm text-gray-400 flex items-center gap-1">
                <span className="animate-bounce">•</span>
                <span className="animate-bounce" style={{ animationDelay: "150ms" }}>•</span>
                <span className="animate-bounce" style={{ animationDelay: "300ms" }}>•</span>
              </div>
            </div>
          )}
        </div>

        {/* Input bar */}
        <form onSubmit={handleSend} className="flex items-center gap-2 px-3 py-2.5" style={{ background: "#f0f2f5" }}>
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="flex-1 rounded-full border-none bg-white focus-visible:ring-0 shadow-sm text-sm placeholder:text-gray-400"
            placeholder="Type a message…"
            disabled={sendMessage.isPending}
          />
          <button
            type="submit"
            disabled={!message.trim() || sendMessage.isPending}
            className="h-10 w-10 rounded-full flex items-center justify-center text-white transition-colors disabled:opacity-50"
            style={{ background: "#00a884" }}
          >
            <Send className="h-4 w-4 ml-0.5" />
          </button>
        </form>
      </div>
    </div>
  );
}

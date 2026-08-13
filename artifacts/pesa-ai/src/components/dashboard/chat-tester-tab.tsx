import { useGetMe, useGetChatHistory, getGetChatHistoryQueryKey, useSendChatMessage } from "@workspace/api-client-react";
import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Phone, Bot, User } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { ScrollArea } from "@/components/ui/scroll-area";

export function ChatTesterTab() {
  const { data: me } = useGetMe();
  const businessId = me?.business?.id || "";
  
  const [testPhone, setTestPhone] = useState("254700000000");
  const [message, setMessage] = useState("");
  
  const { data: history, isLoading } = useGetChatHistory(
    businessId, 
    testPhone, 
    { query: { enabled: !!businessId && !!testPhone, queryKey: getGetChatHistoryQueryKey(businessId, testPhone) } }
  );

  const sendMessage = useSendChatMessage();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !testPhone) return;

    const currentMsg = message;
    setMessage("");

    sendMessage.mutate({
      businessId,
      data: {
        customerPhone: testPhone,
        message: currentMsg
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetChatHistoryQueryKey(businessId, testPhone) });
      }
    });
  };

  return (
    <div className="grid md:grid-cols-[300px_1fr] gap-6 h-[600px]">
      <div className="flex flex-col gap-4 border-r border-border pr-6">
        <div>
          <h2 className="text-xl font-bold mb-2">AI Chat Tester</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Test how your AI persona talks to customers before going live.
          </p>
        </div>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Test Customer Phone</label>
            <div className="flex relative">
              <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                className="pl-9" 
                value={testPhone} 
                onChange={(e) => setTestPhone(e.target.value)} 
                placeholder="2547XXXXXXXX"
              />
            </div>
            <p className="text-xs text-muted-foreground">Change number to start a fresh thread.</p>
          </div>
          
          <div className="p-4 bg-muted/50 rounded-xl space-y-2">
            <h3 className="text-sm font-bold flex items-center"><Bot className="w-4 h-4 mr-2 text-primary" /> Persona Active</h3>
            <p className="text-xs text-muted-foreground">Your assistant knows your products and current stock. Try asking about a product.</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col bg-[#efeae2] dark:bg-[#111b21] rounded-xl overflow-hidden border shadow-inner relative">
        {/* Chat header */}
        <div className="bg-[#075e54] dark:bg-[#202c33] text-white p-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            <SiWhatsapp className="w-6 h-6" />
          </div>
          <div>
            <div className="font-bold text-sm">{me?.business?.personaName || "Assistant"}</div>
            <div className="text-xs text-white/70">Test mode</div>
          </div>
        </div>

        {/* Chat history */}
        <div 
          className="flex-1 overflow-y-auto p-4 space-y-4"
          ref={scrollRef}
          style={{ backgroundImage: "url('https://static.whatsapp.net/rsrc.php/v3/yl/r/rxb-xT5mKzB.png')", backgroundSize: 'cover', opacity: 0.95 }}
        >
          {!history?.length && !isLoading && (
            <div className="text-center py-10">
              <span className="bg-[#fff9c4] dark:bg-[#182229] dark:text-[#8696a0] text-xs px-4 py-2 rounded-lg shadow-sm border border-transparent dark:border-[#2a3942]">
                Messages are end-to-end encrypted. Send a test message below.
              </span>
            </div>
          )}

          {history?.map((msg) => {
            const isAI = msg.role === 'ai';
            return (
              <div key={msg.id} className={`flex ${isAI ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[80%] rounded-lg p-2 shadow-sm relative text-sm ${
                  isAI 
                    ? 'bg-white dark:bg-[#202c33] text-foreground rounded-tl-none' 
                    : 'bg-[#d9fdd3] dark:bg-[#005c4b] text-foreground rounded-tr-none'
                }`}>
                  <div className="pb-4 whitespace-pre-wrap">{msg.content}</div>
                  <span className="text-[10px] text-muted-foreground absolute bottom-1 right-2">
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })}
          {sendMessage.isPending && (
            <div className="flex justify-start">
              <div className="bg-white dark:bg-[#202c33] rounded-lg p-3 shadow-sm rounded-tl-none text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  typing<span className="animate-bounce">.</span><span className="animate-bounce" style={{animationDelay: "100ms"}}>.</span><span className="animate-bounce" style={{animationDelay: "200ms"}}>.</span>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Chat input */}
        <form onSubmit={handleSend} className="bg-[#f0f2f5] dark:bg-[#202c33] p-3 flex gap-2">
          <Input 
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="flex-1 rounded-full border-none focus-visible:ring-0 shadow-sm"
            placeholder="Type a message..."
            disabled={sendMessage.isPending}
          />
          <Button 
            type="submit" 
            size="icon" 
            className="rounded-full w-10 h-10 bg-[#00a884] hover:bg-[#008f6f] text-white shrink-0"
            disabled={!message.trim() || sendMessage.isPending}
          >
            <Send className="w-4 h-4 ml-1" />
          </Button>
        </form>
      </div>
    </div>
  );
}

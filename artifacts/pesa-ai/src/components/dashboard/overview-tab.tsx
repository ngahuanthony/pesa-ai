import { useGetMe, useListOrders, useListProducts, useGetSalesSummary, getListOrdersQueryKey, getListProductsQueryKey, getGetSalesSummaryQueryKey } from "@workspace/api-client-react";
import { ShoppingCart, DollarSign, Package, Bot, AlertTriangle, CheckCircle2, Circle, ExternalLink, Copy, Check, Wifi, QrCode } from "lucide-react";
import { Link } from "wouter";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { ShopQRCard } from "@/components/dashboard/shop-qr-card";

interface HandoverConvo {
  conversationId: string;
  customerId: string;
  customerPhone: string | null;
  customerName: string | null;
  handoverAt: string | null;
  lastMessage: string | null;
}

interface ActivityEvent {
  type: "ai_reply" | "order" | "handover";
  customerPhone: string | null;
  customerName: string | null;
  preview?: string;
  total?: number;
  itemCount?: number;
  createdAt: string;
}

export function OverviewTab() {
  const { data: me } = useGetMe();
  const businessId   = (me as any)?.business?.id || "";
  const businessName = (me as any)?.business?.name || "your shop";
  const { toast }    = useToast();

  const { data: ordersData }   = useListOrders(businessId,   { query: { enabled: !!businessId, queryKey: getListOrdersQueryKey(businessId) } });
  const { data: productsData } = useListProducts(businessId, { query: { enabled: !!businessId, queryKey: getListProductsQueryKey(businessId) } });
  const { data: salesData }    = useGetSalesSummary(businessId, { query: { enabled: !!businessId, queryKey: getGetSalesSummaryQueryKey(businessId) } });

  const [handoverConvos, setHandoverConvos] = useState<HandoverConvo[]>([]);
  const [resumingId, setResumingId]         = useState<string | null>(null);
  const [waStatus, setWaStatus]             = useState<any>(null);
  const [activity, setActivity]             = useState<ActivityEvent[]>([]);
  const [linkCopied, setLinkCopied]         = useState(false);

  const fetchHandover = async () => {
    if (!businessId) return;
    try {
      const res = await fetch(`/api/businesses/${businessId}/conversations`, { credentials: "include" });
      if (res.ok) setHandoverConvos((await res.json()).conversations || []);
    } catch { /* ignore */ }
  };

  const fetchWaStatus = async () => {
    if (!businessId) return;
    try {
      const res = await fetch(`/api/businesses/${businessId}/whatsapp/status`, { credentials: "include" });
      if (res.ok) setWaStatus(await res.json());
    } catch { /* ignore */ }
  };

  const fetchActivity = async () => {
    if (!businessId) return;
    try {
      const res = await fetch(`/api/businesses/${businessId}/activity`, { credentials: "include" });
      if (res.ok) setActivity((await res.json()).events || []);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchHandover();
    fetchWaStatus();
    fetchActivity();
  }, [businessId]);

  const handleResumeAI = async (customerPhone: string) => {
    setResumingId(customerPhone);
    try {
      await fetch(`/api/businesses/${businessId}/conversations/${encodeURIComponent(customerPhone)}/resume-ai`, {
        method: "POST", credentials: "include",
      });
      toast({ title: "AI resumed for this customer" });
      await fetchHandover();
    } catch {
      toast({ title: "Failed to resume AI", variant: "destructive" });
    } finally {
      setResumingId(null);
    }
  };

  const orders       = (ordersData   as any)?.orders   || [];
  const products     = (productsData as any)?.products || [];
  const totalRevenue = (salesData    as any)?.totalRevenue || 0;
  const recentOrders = orders.slice(0, 5);

  const waConnected = waStatus?.connected === true;

  // Build shop link from WhatsApp status
  const shopUrl = (() => {
    if (!waStatus?.requestedPhone) return null;
    const digits = waStatus.requestedPhone
      .replace(/[\s\-\(\)]/g, "")
      .replace(/^\+/, "")
      .replace(/^0/, "254");
    return `https://wa.me/${digits}?text=Hi%2C%20I%27d%20like%20to%20shop`;
  })();

  // Setup checklist
  const setupSteps = [
    { label: "Add your first product", done: products.length > 0, href: "/dashboard/products" },
    { label: "Connect WhatsApp", done: waConnected, href: "/dashboard/whatsapp" },
    { label: "Get your first customer", done: orders.length > 0, href: shopUrl || "/dashboard/whatsapp" },
  ];
  const stepsDone = setupSteps.filter((s) => s.done).length;
  const shopIsNew = stepsDone < 3;

  // Human-readable activity label
  function eventLabel(e: ActivityEvent): string {
    const who = e.customerName || e.customerPhone || "A customer";
    if (e.type === "order")    return `${who} placed an order — KSh ${(e.total || 0).toLocaleString()}`;
    if (e.type === "handover") return `${who} asked to speak with you`;
    return "AI answered a customer's question";
  }

  function timeAgo(iso: string): string {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1)   return "just now";
    if (mins < 60)  return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)   return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return (
    <div className="p-6 space-y-6">

      {/* ── Hero banner ── */}
      <div className="rounded-2xl bg-[#0d3d26] text-white p-7">
        <h2 className="text-xl font-bold mb-1">Welcome to {businessName} 👋</h2>
        <p className="text-white/70 text-sm mb-5">
          {waConnected
            ? "Your WhatsApp shop is live. Share your link and the AI handles the rest."
            : "You're almost set up. Connect WhatsApp to start selling — the AI does the rest."}
        </p>

        {waConnected && shopUrl ? (
          /* Connected: show shop link in hero */
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2 min-w-0">
              <span className="text-xs text-white/80 font-mono truncate max-w-[220px]">{shopUrl}</span>
            </div>
            <button
              onClick={() => { navigator.clipboard.writeText(shopUrl); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/20 hover:bg-white/30 px-3 py-2 text-xs font-semibold text-white transition-colors"
            >
              {linkCopied ? <><Check className="h-3.5 w-3.5" /> Copied!</> : <><Copy className="h-3.5 w-3.5" /> Copy shop link</>}
            </button>
            <a
              href={shopUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] px-3 py-2 text-xs font-semibold text-white transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open in WhatsApp
            </a>
          </div>
        ) : (
          /* Not connected: big Connect CTA */
          <Link
            href="/dashboard/whatsapp"
            className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] px-5 py-3 text-sm font-bold text-white transition-colors shadow-lg"
          >
            <Wifi className="h-4 w-4" />
            Connect WhatsApp to start selling →
          </Link>
        )}
      </div>

      {/* ── Setup checklist (hidden once all steps done) ── */}
      {shopIsNew && (
        <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-foreground text-sm">Getting started</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{stepsDone} of {setupSteps.length} steps complete</p>
            </div>
            {/* Progress pills */}
            <div className="flex items-center gap-1">
              {setupSteps.map((s, i) => (
                <div key={i} className={`h-2 w-8 rounded-full transition-colors ${s.done ? "bg-primary" : "bg-muted"}`} />
              ))}
            </div>
          </div>
          <div className="space-y-1">
            {setupSteps.map((step, i) => (
              <Link
                key={i}
                href={step.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${step.done ? "opacity-50" : "hover:bg-muted/50 cursor-pointer"}`}
              >
                {step.done
                  ? <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                  : <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                <span className={`text-sm flex-1 ${step.done ? "line-through text-muted-foreground" : "font-medium text-foreground"}`}>
                  {step.label}
                </span>
                {!step.done && <span className="text-xs text-primary font-semibold">Do this →</span>}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── WhatsApp Shop QR Code ── */}
      {waStatus?.requestedPhone && (
        <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border bg-muted/20">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <QrCode className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-sm">Your WhatsApp Shop QR Code</h3>
              <p className="text-xs text-muted-foreground">Auto-generated · Print and stick at your shop</p>
            </div>
          </div>

          <div className="p-5 flex flex-col sm:flex-row gap-6 items-start">
            {/* QR card preview + download */}
            <div className="flex-shrink-0 w-full sm:w-auto flex justify-center">
              <ShopQRCard businessName={businessName} phone={waStatus.requestedPhone} />
            </div>

            {/* Instructions */}
            <div className="flex-1 min-w-0">
              <div className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 text-[11px] font-semibold px-2.5 py-0.5 mb-3">
                📲 Print &amp; Stick
              </div>
              <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
                Customers scan this code at your shop to open WhatsApp and start browsing.
                Download the print-ready card and put it wherever your customers will see it.
              </p>
              <div className="space-y-3">
                {[
                  { n: 1, text: "Download the PNG — high-resolution, ready for A5 print" },
                  { n: 2, text: "Print at any print shop or on your own printer" },
                  { n: 3, text: "Stick on your counter, packaging, or share on social media" },
                  { n: 4, text: "Customers scan → AI answers → orders come in automatically" },
                ].map(({ n, text }) => (
                  <div key={n} className="flex items-start gap-2.5">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-bold flex-shrink-0 mt-0.5">
                      {n}
                    </span>
                    <span className="text-sm text-foreground leading-snug">{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Section title ── */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Here's how {businessName} is doing.</p>
      </div>

      {/* ── Stat cards (3 across) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Products */}
        <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 mb-3">
            <Package className="h-5 w-5 text-purple-600" />
          </div>
          <p className="text-xs text-muted-foreground font-medium">Total Products</p>
          <p className="text-2xl font-bold text-foreground mt-1">{products.length}</p>
          <Link href="/dashboard/products" className="text-xs font-medium text-primary hover:underline mt-1 inline-block">
            Add products
          </Link>
        </div>

        {/* Orders */}
        <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 mb-3">
            <ShoppingCart className="h-5 w-5 text-orange-500" />
          </div>
          <p className="text-xs text-muted-foreground font-medium">Total Orders</p>
          <p className="text-2xl font-bold text-foreground mt-1">{orders.length}</p>
          <Link href="/dashboard/orders" className="text-xs font-medium text-primary hover:underline mt-1 inline-block">
            View orders
          </Link>
        </div>

        {/* Revenue */}
        <div className="bg-white rounded-xl border border-border p-5 shadow-sm col-span-2 lg:col-span-1">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-green-100 mb-3">
            <DollarSign className="h-5 w-5 text-green-600" />
          </div>
          <p className="text-xs text-muted-foreground font-medium">Total Revenue</p>
          <p className="text-2xl font-bold text-foreground mt-1">KSh {totalRevenue.toLocaleString()}</p>
          <Link href="/dashboard/sales" className="text-xs font-medium text-primary hover:underline mt-1 inline-block">
            View reports
          </Link>
        </div>
      </div>

      {/* ── Human handover alert (only shown when customers need attention) ── */}
      {handoverConvos.length > 0 && (
        <div id="handover" className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-amber-200 bg-amber-100/60">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <h2 className="font-semibold text-amber-800 text-sm">
              {handoverConvos.length} customer{handoverConvos.length !== 1 ? "s" : ""} waiting for you
            </h2>
            <span className="ml-auto text-xs text-amber-600">AI is paused for these chats</span>
          </div>
          <div className="divide-y divide-amber-100">
            {handoverConvos.map((c) => (
              <div key={c.conversationId} className="flex items-center justify-between px-5 py-3 gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{c.customerName || c.customerPhone || "Customer"}</p>
                  {c.customerName && <p className="text-xs text-muted-foreground">{c.customerPhone}</p>}
                  {c.lastMessage && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">"{c.lastMessage}"</p>
                  )}
                  {c.handoverAt && (
                    <p className="text-[11px] text-amber-600 mt-0.5">
                      Requested {new Date(c.handoverAt).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleResumeAI(c.customerPhone || c.customerId)}
                  disabled={resumingId === (c.customerPhone || c.customerId)}
                  className="flex-shrink-0 rounded-lg bg-white border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50 transition-colors"
                >
                  {resumingId === (c.customerPhone || c.customerId) ? "Resuming…" : "Resume AI →"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Bottom row: Recent Orders + AI Activity Feed ── */}
      <div className="grid lg:grid-cols-[1fr_340px] gap-4">

        {/* Recent Orders */}
        <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">Recent Orders</h2>
            <Link href="/dashboard/orders" className="text-xs font-medium text-primary hover:underline">
              View all →
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                <ShoppingCart className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="font-medium text-sm text-foreground">No orders yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
                Share your shop link — customers message you, and the AI takes their order automatically.
              </p>
              {shopUrl ? (
                <a
                  href={shopUrl} target="_blank" rel="noopener noreferrer"
                  className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-full bg-[#25D366] px-4 text-xs font-semibold text-white hover:bg-[#1ebe5d]"
                >
                  <ExternalLink className="h-3 w-3" /> Open your shop link
                </a>
              ) : (
                <Link
                  href="/dashboard/whatsapp"
                  className="mt-4 inline-flex h-8 items-center justify-center rounded-full bg-primary px-4 text-xs font-semibold text-white hover:bg-primary/90"
                >
                  Connect WhatsApp first →
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {recentOrders.map((order: any) => (
                <div key={order.id} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">{order.customerPhone}</p>
                    <p className="text-xs text-muted-foreground capitalize">{order.status}</p>
                  </div>
                  <p className="text-sm font-semibold text-foreground">KSh {(order.total || 0).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI Activity Feed */}
        <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Bot className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-foreground">AI Activity</h2>
          </div>

          {activity.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                <Bot className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">No activity yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
                {waConnected
                  ? "Share your shop link to get your first customer."
                  : "Connect WhatsApp — then the AI gets to work."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {activity.slice(0, 8).map((e, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-sm leading-none">
                    {e.type === "order" ? "🛒" : e.type === "handover" ? "👋" : "🤖"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground leading-snug">{eventLabel(e)}</p>
                    {e.type === "ai_reply" && e.preview && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">"{e.preview}"</p>
                    )}
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">{timeAgo(e.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

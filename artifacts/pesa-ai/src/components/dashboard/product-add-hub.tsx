import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Zap, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useGetMe, useCreateProduct, getListProductsQueryKey } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const schema = z.object({
  name:        z.string().min(1, "Name is required"),
  price:       z.coerce.number().min(1, "Price must be at least 1"),
  stockQty:    z.coerce.number().min(0).default(0),
  description: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

const METHODS = [
  {
    emoji: "📸",
    label: "Photo Scan",
    badge: "Fastest",
    badgeColor: "bg-emerald-100 text-emerald-700",
    description: "Point at a shelf or product — AI reads names, suggests prices, you confirm.",
    href: "/dashboard/products/add/photo",
    highlight: true,
    tip: "Recommended for most shops",
  },
  {
    emoji: "🎥",
    label: "Video Scanner",
    badge: "Batch",
    badgeColor: "bg-blue-100 text-blue-700",
    description: "Sweep your whole rack in one pass — AI processes frames and builds drafts.",
    href: "/dashboard/video-scan",
    highlight: false,
  },
  {
    emoji: "✍️",
    label: "Manual Entry",
    badge: "Full control",
    badgeColor: "bg-gray-100 text-gray-600",
    description: "Type name, price, stock, and description yourself. Great for one-off items.",
    action: "manual" as const,
    highlight: false,
  },
  {
    emoji: "📊",
    label: "Bulk Import (CSV / Excel)",
    badge: "Migration",
    badgeColor: "bg-purple-100 text-purple-700",
    description: "Already have products in a spreadsheet? Import them all in seconds.",
    href: "/dashboard/products/add/csv",
    highlight: false,
  },
  {
    emoji: "💬",
    label: "WhatsApp Add",
    badge: "On the go",
    badgeColor: "bg-orange-100 text-orange-700",
    description: "Text or voice a product to your own business number — AI adds it for you.",
    comingSoon: true,
    highlight: false,
  },
];

export function ProductAddHub() {
  const { data: me } = useGetMe();
  const businessId = (me as any)?.business?.id || "";
  const [manualOpen, setManualOpen] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();
  const createProduct = useCreateProduct();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", price: 0, stockQty: 0, description: "" },
  });

  const onSubmit = async (values: FormValues) => {
    await createProduct.mutateAsync(
      { businessId, data: { name: values.name, price: values.price, stockQty: values.stockQty, description: values.description } },
      {
        onSuccess: () => {
          toast({ title: "Product added!" });
          qc.invalidateQueries({ queryKey: getListProductsQueryKey(businessId) });
          form.reset();
          setManualOpen(false);
        },
        onError: (e: any) => toast({ title: "Failed to add product", description: e.message, variant: "destructive" }),
      }
    );
  };

  return (
    <div className="space-y-5">
      <Link
        href="/dashboard/products"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Products
      </Link>

      <div>
        <h2 className="text-lg font-bold text-foreground">How would you like to add products?</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Pick the method that fits your situation — you can mix and match any time.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {METHODS.map((m) => {
          if (m.comingSoon) {
            return (
              <div key={m.label} className="flex flex-col gap-2.5 rounded-xl border border-border bg-muted/20 p-5 opacity-55 cursor-not-allowed select-none">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-3xl leading-none">{m.emoji}</span>
                  <span className="text-[10px] font-semibold rounded-full bg-gray-100 text-gray-500 px-2 py-0.5 mt-0.5">Coming soon</span>
                </div>
                <p className="font-semibold text-foreground text-sm">{m.label}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{m.description}</p>
              </div>
            );
          }

          if ("action" in m && m.action === "manual") {
            return (
              <button
                key={m.label}
                onClick={() => setManualOpen(true)}
                className="flex flex-col gap-2.5 rounded-xl border border-border bg-white p-5 text-left hover:shadow-md hover:border-border/80 transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-3xl leading-none">{m.emoji}</span>
                  <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 mt-0.5 ${m.badgeColor}`}>{m.badge}</span>
                </div>
                <p className="font-semibold text-foreground text-sm">{m.label}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{m.description}</p>
              </button>
            );
          }

          return (
            <Link
              key={m.label}
              href={"href" in m ? m.href! : "#"}
              className={`flex flex-col gap-2.5 rounded-xl border p-5 transition-all hover:shadow-md cursor-pointer ${
                m.highlight
                  ? "border-primary/40 bg-primary/5 hover:bg-primary/10"
                  : "border-border bg-white hover:border-border/80"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-3xl leading-none">{m.emoji}</span>
                <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 mt-0.5 ${m.badgeColor}`}>{m.badge}</span>
              </div>
              <p className={`font-semibold text-sm ${m.highlight ? "text-primary" : "text-foreground"}`}>{m.label}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{m.description}</p>
              {m.tip && (
                <div className="flex items-center gap-1 text-[11px] font-semibold text-primary mt-0.5">
                  <Zap className="h-3 w-3" /> {m.tip}
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {/* Manual entry dialog */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Product Manually</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-1">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Product Name</FormLabel>
                  <FormControl><Input placeholder="e.g. iPhone 13 Case – Black" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="price" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price (KSh)</FormLabel>
                    <FormControl><Input type="number" min={1} placeholder="0" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="stockQty" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stock Quantity</FormLabel>
                    <FormControl><Input type="number" min={0} placeholder="0" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl><Textarea placeholder="What makes this product stand out?" rows={3} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <button
                type="submit"
                disabled={createProduct.isPending}
                className="w-full h-10 rounded-lg bg-primary text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {createProduct.isPending ? "Saving…" : "Save Product"}
              </button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

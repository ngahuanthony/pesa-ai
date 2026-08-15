import { useState, useRef } from "react";
import { ArrowLeft, Upload, PlusCircle, CheckCircle2, AlertCircle, Loader2, Video, ChevronDown, Package } from "lucide-react";
import { Link } from "wouter";
import {
  useGetMe,
  useListProducts,
  useUpdateProduct,
  useImportProducts,
  useCreateProduct,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

// ── CSV / Excel parser ────────────────────────────────────────────────────────

function parseCsv(text: string) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, ""));
  const nameIdx  = header.findIndex((h) => ["name","productname","product","item"].includes(h));
  const priceIdx = header.findIndex((h) => ["price","amount","cost","unitprice"].includes(h));
  const qtyIdx   = header.findIndex((h) => ["qty","quantity","stock","stockqty","units"].includes(h));
  const descIdx  = header.findIndex((h) => ["description","desc","details"].includes(h));
  if (nameIdx === -1 || priceIdx === -1) return [];
  return lines.slice(1).flatMap((line) => {
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const name  = cols[nameIdx];
    const price = parseFloat(cols[priceIdx]);
    const qty   = qtyIdx !== -1 ? parseInt(cols[qtyIdx], 10) || 0 : 0;
    const desc  = descIdx !== -1 ? cols[descIdx] || "" : "";
    if (!name || isNaN(price) || price < 0) return [];
    return [{ name, price, stockQty: qty, description: desc }];
  });
}

const TEMPLATE = `name,price,qty,description\nBlue Dress,1500,10,Available in sizes S-XL\nMen's Polo Shirt,850,25,Cotton blend\nKids Sneakers,1200,8,Sizes 28-35`;

// ── 1. Manual stock addition to existing products ─────────────────────────────

function ManualStockIn({ businessId }: { businessId: string }) {
  const { data: products = [], refetch } = useListProducts(businessId);
  const updateProduct = useUpdateProduct();
  const { toast } = useToast();
  const [additions, setAdditions] = useState<Record<string, string>>({});
  const [saving,    setSaving]    = useState<Record<string, boolean>>({});
  const [saved,     setSaved]     = useState<Record<string, boolean>>({});

  const active = products.filter((p) => p.active !== false);
  if (!active.length) return (
    <div className="py-8 text-center text-sm text-muted-foreground">
      No active products yet.{" "}
      <Link href="/dashboard/products" className="text-primary underline">Add products first →</Link>
    </div>
  );

  const handleSave = (product: typeof products[number]) => {
    const qty = parseInt(additions[product.id] || "0", 10);
    if (!qty || qty <= 0) return;
    setSaving((s) => ({ ...s, [product.id]: true }));
    updateProduct.mutate(
      { businessId, productId: product.id, data: { stockQty: (product.stockQty || 0) + qty } as any },
      {
        onSuccess: () => {
          refetch();
          setAdditions((a) => ({ ...a, [product.id]: "" }));
          setSaved((s) => ({ ...s, [product.id]: true }));
          setTimeout(() => setSaved((s) => ({ ...s, [product.id]: false })), 2000);
          toast({ title: `+${qty} added to ${product.name}` });
        },
        onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
        onSettled: () => setSaving((s) => ({ ...s, [product.id]: false })),
      }
    );
  };

  return (
    <div className="space-y-2">
      {active.map((product) => (
        <div key={product.id} className="flex items-center gap-3 rounded-xl border border-border bg-white px-4 py-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{product.name}</p>
            <p className="text-xs text-muted-foreground">Stock: <span className="font-medium text-foreground">{product.stockQty ?? 0}</span></p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number" min={1} placeholder="+qty"
              value={additions[product.id] || ""}
              onChange={(e) => setAdditions((a) => ({ ...a, [product.id]: e.target.value }))}
              className="w-20 text-sm text-center"
            />
            <Button
              size="sm"
              disabled={!additions[product.id] || parseInt(additions[product.id]) <= 0 || saving[product.id]}
              onClick={() => handleSave(product)}
              className="px-3"
            >
              {saving[product.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved[product.id] ? <CheckCircle2 className="h-3.5 w-3.5" /> : "Add"}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 2. Bulk CSV / Excel import ────────────────────────────────────────────────

function BulkImport({ businessId }: { businessId: string }) {
  const importProducts = useImportProducts();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv]           = useState("");
  const [preview, setPreview]   = useState<{ name: string; price: number; stockQty: number; description: string }[]>([]);
  const [parseError, setParseError] = useState("");

  const handleParse = (text: string) => {
    setCsv(text);
    if (!text.trim()) { setPreview([]); setParseError(""); return; }
    const rows = parseCsv(text);
    if (!rows.length) {
      setParseError("Could not parse. Make sure there are at least Name and Price columns.");
      setPreview([]);
    } else {
      setParseError(""); setPreview(rows);
    }
  };

  const handleFile = (file: File) => {
    if (file.name.match(/\.xlsx?$/i)) {
      setParseError("Excel detected — please save as CSV (File → Save As → CSV) then upload.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => handleParse(e.target?.result as string ?? "");
    reader.readAsText(file);
  };

  const handleImport = () => {
    if (!preview.length) return;
    importProducts.mutate(
      { businessId, data: { rows: preview } as any },
      {
        onSuccess: (res: any) => {
          const count = res?.created ?? preview.length;
          toast({ title: `${count} product${count !== 1 ? "s" : ""} imported!` });
          setCsv(""); setPreview([]);
        },
        onError: (e: any) => toast({ title: "Import failed", description: e.message, variant: "destructive" }),
      }
    );
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE], { type: "text/csv" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "products-template.csv" });
    a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 py-7 cursor-pointer hover:bg-muted/50 transition-colors"
      >
        <Upload className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Drop CSV here or click to browse</p>
        <p className="text-xs text-muted-foreground">Columns: Name, Price, Qty, Description (optional)</p>
        <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Using Excel?</span>
        <span className="font-medium text-foreground">File → Save As → CSV</span>
        <span>then upload above, or</span>
        <button onClick={downloadTemplate} className="text-primary underline">download template</button>
      </div>

      {/* Paste textarea */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">Or paste CSV directly</label>
        <textarea
          value={csv}
          onChange={(e) => handleParse(e.target.value)}
          placeholder={TEMPLATE}
          rows={5}
          className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
        />
      </div>

      {parseError && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />{parseError}
        </div>
      )}

      {preview.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">{preview.length} product{preview.length !== 1 ? "s" : ""} ready to import</p>
          <div className="max-h-48 overflow-y-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Price</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {preview.map((r, i) => (
                  <tr key={i} className="bg-white">
                    <td className="px-3 py-2 text-foreground">{r.name}</td>
                    <td className="px-3 py-2 text-right text-foreground">KES {r.price.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-foreground">{r.stockQty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button onClick={handleImport} disabled={importProducts.isPending} className="w-full">
            {importProducts.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Importing…</>
              : `Import ${preview.length} product${preview.length !== 1 ? "s" : ""}`}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── 3. Add single new product ─────────────────────────────────────────────────

function AddSingleProduct({ businessId }: { businessId: string }) {
  const createProduct = useCreateProduct();
  const { toast } = useToast();
  const empty = { name: "", price: "", stockQty: "", description: "" };
  const [form, setForm] = useState(empty);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.price) return;
    createProduct.mutate(
      {
        businessId,
        data: {
          name: form.name.trim(),
          price: parseFloat(form.price),
          stockQty: parseInt(form.stockQty || "0", 10),
          description: form.description.trim() || undefined,
        } as any,
      },
      {
        onSuccess: () => { toast({ title: `${form.name} added!` }); setForm(empty); },
        onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
      }
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">Product Name *</label>
        <Input value={form.name} onChange={set("name")} placeholder="e.g. Blue Dress" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Price (KES) *</label>
          <Input type="number" min={0} step="0.01" value={form.price} onChange={set("price")} placeholder="1500" required />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Opening Stock</label>
          <Input type="number" min={0} value={form.stockQty} onChange={set("stockQty")} placeholder="0" />
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">Description (optional)</label>
        <textarea
          value={form.description}
          onChange={set("description")}
          placeholder="Short product description…"
          rows={2}
          className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
        />
      </div>
      <Button type="submit" disabled={createProduct.isPending} className="w-full">
        {createProduct.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Adding…</> : "Add Product"}
      </Button>
    </form>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function StockInTab() {
  const { data: me } = useGetMe();
  const businessId = (me as any)?.business?.id ?? "";

  return (
    <div className="space-y-5 max-w-2xl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/stock" className="flex h-8 w-8 items-center justify-center rounded-full border border-border hover:bg-muted transition-colors">
          <ArrowLeft className="h-4 w-4 text-muted-foreground" />
        </Link>
        <div>
          <h2 className="text-lg font-bold text-foreground">Stock In</h2>
          <p className="text-xs text-muted-foreground">Add inventory — choose your preferred method below</p>
        </div>
      </div>

      {/* ── Video Scan — primary hero ── */}
      <Link href="/dashboard/video-scan">
        <div className="rounded-2xl bg-gradient-to-br from-primary to-primary/80 p-5 text-white cursor-pointer hover:opacity-95 transition-opacity shadow-md">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 flex-shrink-0">
              <Video className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-base font-bold">Video Scan</p>
                <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs font-semibold">Recommended</span>
              </div>
              <p className="text-sm text-white/85">Record a short video of your shop — AI reads your products and builds your catalogue automatically. No typing required.</p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-end">
            <span className="text-sm font-semibold">Start Video Scan →</span>
          </div>
        </div>
      </Link>

      {/* ── Collapsed secondary options ── */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">Other options</p>
        <Accordion type="multiple" className="space-y-2">

          {/* Manual entry */}
          <AccordionItem value="manual" className="rounded-xl border border-border bg-white overflow-hidden">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30 [&[data-state=open]]:bg-muted/30">
              <div className="flex items-center gap-3 text-left">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-50 flex-shrink-0">
                  <PlusCircle className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Add Stock to Existing Products</p>
                  <p className="text-xs text-muted-foreground">Increase quantity for products already in your catalogue</p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 pt-1">
              <ManualStockIn businessId={businessId} />
            </AccordionContent>
          </AccordionItem>

          {/* Bulk CSV / Excel */}
          <AccordionItem value="bulk" className="rounded-xl border border-border bg-white overflow-hidden">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30 [&[data-state=open]]:bg-muted/30">
              <div className="flex items-center gap-3 text-left">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 flex-shrink-0">
                  <Upload className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Bulk Import (CSV / Excel)</p>
                  <p className="text-xs text-muted-foreground">Upload a spreadsheet to import many products at once</p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 pt-1">
              <BulkImport businessId={businessId} />
            </AccordionContent>
          </AccordionItem>

          {/* Add one product */}
          <AccordionItem value="single" className="rounded-xl border border-border bg-white overflow-hidden">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30 [&[data-state=open]]:bg-muted/30">
              <div className="flex items-center gap-3 text-left">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-50 flex-shrink-0">
                  <Package className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Add New Product Manually</p>
                  <p className="text-xs text-muted-foreground">Type in one product at a time with name, price and stock</p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 pt-1">
              <AddSingleProduct businessId={businessId} />
            </AccordionContent>
          </AccordionItem>

        </Accordion>
      </div>
    </div>
  );
}

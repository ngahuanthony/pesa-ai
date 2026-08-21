import {
  useGetMe, useListProducts, getListProductsQueryKey,
  useCreateProduct, useDeleteProduct, useUpdateProduct,
} from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Edit2, Tag, Package, Search, X } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Product } from "@workspace/api-client-react";
import { Link } from "wouter";

const SOURCE_CHIP: Record<string, { icon: string; label: string; color: string }> = {
  photo_scan: { icon: "📸", label: "Photo",    color: "bg-blue-50 text-blue-700" },
  video_scan: { icon: "🎥", label: "Video",    color: "bg-purple-50 text-purple-700" },
  manual:     { icon: "✍️", label: "Manual",   color: "bg-gray-100 text-gray-600" },
  csv:        { icon: "📊", label: "CSV",      color: "bg-green-50 text-green-700" },
  whatsapp:   { icon: "💬", label: "WhatsApp", color: "bg-emerald-50 text-emerald-700" },
};

const productSchema = z.object({
  name:        z.string().min(1, "Name is required"),
  price:       z.coerce.number().min(1, "Price must be at least 1"),
  stockQty:    z.coerce.number().min(0, "Stock can't be negative"),
  description: z.string().optional(),
});
type ProductForm = z.infer<typeof productSchema>;

function ProductFormFields({ form }: { form: any }) {
  return (
    <>
      <FormField control={form.control} name="name" render={({ field }) => (
        <FormItem>
          <FormLabel>Product Name</FormLabel>
          <FormControl><Input placeholder="e.g. Women's Maxi Dress" {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />
      <div className="grid grid-cols-2 gap-4">
        <FormField control={form.control} name="price" render={({ field }) => (
          <FormItem>
            <FormLabel>Price (KES)</FormLabel>
            <FormControl><Input type="number" min={0} {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="stockQty" render={({ field }) => (
          <FormItem>
            <FormLabel>Stock Available</FormLabel>
            <FormControl><Input type="number" min={0} {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </div>
      <FormField control={form.control} name="description" render={({ field }) => (
        <FormItem>
          <FormLabel>Description <span className="text-muted-foreground font-normal">(helps the assistant sell it)</span></FormLabel>
          <FormControl><Textarea rows={3} placeholder="Describe the product — material, size options, what makes it special…" {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />
    </>
  );
}

function SourceBadge({ source }: { source?: string }) {
  const chip = SOURCE_CHIP[source || ""];
  if (!chip) return null;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold rounded-full px-1.5 py-0.5 whitespace-nowrap ${chip.color}`}>
      {chip.icon} {chip.label}
    </span>
  );
}

function StockBadge({ qty }: { qty: number }) {
  return qty > 0
    ? <span className="inline-flex items-center rounded-full bg-primary/10 text-primary text-xs font-semibold px-2.5 py-0.5">In Stock</span>
    : <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 text-xs font-semibold px-2.5 py-0.5">Out of Stock</span>;
}

export function ProductsTab() {
  const { data: me } = useGetMe();
  const businessId = me?.business?.id || "";
  const { data: products, isLoading } = useListProducts(businessId, {
    query: { enabled: !!businessId, queryKey: getListProductsQueryKey(businessId) },
  });

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ── Filters (Task #52) ────────────────────────────────────────────
  const [search,      setSearch]      = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [stockFilter,  setStockFilter]  = useState("all");

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    return products.filter((p) => {
      const q = search.toLowerCase();
      if (q && !p.name.toLowerCase().includes(q) && !(p.description || "").toLowerCase().includes(q)) return false;
      if (sourceFilter !== "all" && (p as any).source !== sourceFilter) return false;
      if (stockFilter === "in_stock"    && p.stockQty <= 0) return false;
      if (stockFilter === "out_of_stock" && p.stockQty > 0) return false;
      return true;
    });
  }, [products, search, sourceFilter, stockFilter]);

  const filtersActive = search || sourceFilter !== "all" || stockFilter !== "all";

  const clearFilters = () => { setSearch(""); setSourceFilter("all"); setStockFilter("all"); };
  // ─────────────────────────────────────────────────────────────────

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const createForm = useForm<ProductForm>({ resolver: zodResolver(productSchema), defaultValues: { name: "", price: 0, stockQty: 0, description: "" } });
  const editForm   = useForm<ProductForm>({ resolver: zodResolver(productSchema), defaultValues: { name: "", price: 0, stockQty: 0, description: "" } });

  useEffect(() => {
    if (editingProduct) editForm.reset({ name: editingProduct.name, price: editingProduct.price, stockQty: editingProduct.stockQty, description: editingProduct.description || "" });
  }, [editingProduct, editForm]);

  const onSubmitCreate = (data: ProductForm) => {
    createProduct.mutate({ businessId, data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(businessId) });
        createForm.reset();
        toast({ title: "Product added!" });
      },
    });
  };

  const onSubmitEdit = (data: ProductForm) => {
    if (!editingProduct) return;
    updateProduct.mutate({ businessId, productId: editingProduct.id, data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(businessId) });
        setEditingProduct(null);
        toast({ title: "Product updated" });
      },
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Remove this product? Your assistant will no longer be able to sell it.")) return;
    deleteProduct.mutate({ businessId, productId: id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(businessId) });
        toast({ title: "Product removed" });
      },
    });
  };

  if (isLoading) return <div className="py-16 text-center text-muted-foreground text-sm">Loading products…</div>;

  return (
    <div className="space-y-4">

      {/* ── Actions row ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-2">
        <Link
          href="/dashboard/products/add"
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" /> Add Products
        </Link>
      </div>

      {/* ── Empty state (no products at all) ── */}
      {!products?.length ? (
        <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-2xl py-20 text-center px-4">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Package className="h-7 w-7 text-primary" />
          </div>
          <h3 className="text-lg font-bold mb-2">No products yet</h3>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            Add products so your WhatsApp assistant knows what to sell and how to describe them to customers.
          </p>
          <Link
            href="/dashboard/products/add"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" /> Add your first product
          </Link>
        </div>
      ) : (
        <>
          {/* ── Filter bar ── */}
          <div className="flex flex-col sm:flex-row gap-2">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search products…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>

            {/* Source filter */}
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="h-9 w-full sm:w-[148px] text-sm">
                <SelectValue placeholder="All sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="photo_scan">📸 Photo</SelectItem>
                <SelectItem value="video_scan">🎥 Video</SelectItem>
                <SelectItem value="csv">📊 CSV</SelectItem>
                <SelectItem value="manual">✍️ Manual</SelectItem>
                <SelectItem value="whatsapp">💬 WhatsApp</SelectItem>
              </SelectContent>
            </Select>

            {/* Stock filter */}
            <Select value={stockFilter} onValueChange={setStockFilter}>
              <SelectTrigger className="h-9 w-full sm:w-[140px] text-sm">
                <SelectValue placeholder="All stock" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stock</SelectItem>
                <SelectItem value="in_stock">In Stock</SelectItem>
                <SelectItem value="out_of_stock">Out of Stock</SelectItem>
              </SelectContent>
            </Select>

            {/* Clear */}
            {filtersActive && (
              <button
                onClick={clearFilters}
                className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors flex-shrink-0"
              >
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            )}
          </div>

          {/* Results count */}
          {filtersActive && (
            <p className="text-xs text-muted-foreground">
              Showing {filteredProducts.length} of {products.length} products
            </p>
          )}

          {/* ── No-results state ── */}
          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-2xl py-16 text-center px-4">
              <Search className="h-8 w-8 text-muted-foreground mb-3" />
              <h3 className="text-base font-semibold mb-1">No products match your filters</h3>
              <p className="text-sm text-muted-foreground mb-4">Try adjusting or clearing the filters above.</p>
              <button onClick={clearFilters} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted-foreground hover:bg-muted transition-colors">
                <X className="h-3.5 w-3.5" /> Clear filters
              </button>
            </div>
          ) : (
            <div className="border border-border rounded-xl overflow-hidden bg-white">

              {/* ── Desktop table (hidden on mobile) ── */}
              <div className="hidden sm:block">
                <div className="grid grid-cols-[2fr_1fr_0.7fr_0.7fr_80px] bg-muted/50 px-4 py-2.5 border-b border-border">
                  {["PRODUCT", "PRICE", "STOCK", "STATUS", ""].map((h) => (
                    <span key={h} className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{h}</span>
                  ))}
                </div>
                {filteredProducts.map((p, i) => (
                  <div key={p.id} className={`grid grid-cols-[2fr_1fr_0.7fr_0.7fr_80px] items-center px-4 py-3.5 ${i < filteredProducts.length - 1 ? "border-b border-border" : ""} hover:bg-muted/30 transition-colors`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <Tag className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-sm text-foreground truncate">{p.name}</span>
                          <SourceBadge source={(p as any).source} />
                        </div>
                        {p.description && <div className="text-xs text-muted-foreground truncate max-w-xs">{p.description}</div>}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-foreground">KES {p.price.toLocaleString()}</div>
                    <div className="text-sm text-foreground">{p.stockQty}</div>
                    <div><StockBadge qty={p.stockQty} /></div>
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setEditingProduct(p)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleDelete(p.id)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-rose-50 text-muted-foreground hover:text-rose-600 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Mobile card list (hidden on desktop) ── */}
              <div className="sm:hidden divide-y divide-border">
                {filteredProducts.map((p) => (
                  <div key={p.id} className="flex items-start gap-3 px-4 py-3.5">
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-sm text-foreground">{p.name}</span>
                            <SourceBadge source={(p as any).source} />
                          </div>
                          {p.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{p.description}</p>
                          )}
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <span className="text-sm font-bold text-foreground">KES {p.price.toLocaleString()}</span>
                            <span className="text-xs text-muted-foreground">· {p.stockQty} in stock</span>
                            <StockBadge qty={p.stockQty} />
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 flex-shrink-0 -mr-1">
                          <button onClick={() => setEditingProduct(p)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleDelete(p.id)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-rose-50 text-muted-foreground hover:text-rose-600 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

            </div>
          )}
        </>
      )}

      {/* ── Edit dialog ── */}
      <Dialog open={!!editingProduct} onOpenChange={(open) => !open && setEditingProduct(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Product</DialogTitle></DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onSubmitEdit)} className="space-y-4 mt-2">
              <ProductFormFields form={editForm} />
              <button type="submit" disabled={updateProduct.isPending} className="w-full h-10 rounded-lg bg-primary text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60 transition-colors">
                {updateProduct.isPending ? "Saving…" : "Update Product"}
              </button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import {
  useGetMe, useListProducts, getListProductsQueryKey,
  useCreateProduct, useDeleteProduct, useUpdateProduct, useImportProducts,
} from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Edit2, Package, FileSpreadsheet, Tag, Archive } from "lucide-react";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Product } from "@workspace/api-client-react";

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

export function ProductsTab() {
  const { data: me } = useGetMe();
  const businessId = me?.business?.id || "";
  const { data: products, isLoading } = useListProducts(businessId, {
    query: { enabled: !!businessId, queryKey: getListProductsQueryKey(businessId) },
  });

  const [isCreateOpen, setIsCreateOpen]       = useState(false);
  const [editingProduct, setEditingProduct]   = useState<Product | null>(null);
  const queryClient = useQueryClient();
  const { toast }   = useToast();

  const createProduct  = useCreateProduct();
  const updateProduct  = useUpdateProduct();
  const deleteProduct  = useDeleteProduct();
  const importProducts = useImportProducts();

  const createForm = useForm<ProductForm>({ resolver: zodResolver(productSchema), defaultValues: { name: "", price: 0, stockQty: 0, description: "" } });
  const editForm   = useForm<ProductForm>({ resolver: zodResolver(productSchema), defaultValues: { name: "", price: 0, stockQty: 0, description: "" } });

  useEffect(() => {
    if (editingProduct) editForm.reset({ name: editingProduct.name, price: editingProduct.price, stockQty: editingProduct.stockQty, description: editingProduct.description || "" });
  }, [editingProduct, editForm]);

  const onSubmitCreate = (data: ProductForm) => {
    createProduct.mutate({ businessId, data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(businessId) });
        setIsCreateOpen(false);
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

  const handleImport = () => {
    importProducts.mutate({
      businessId,
      data: { rows: [
        { name: "Sample Item A", price: 1500, stockQty: 10, description: "Imported from spreadsheet" },
        { name: "Sample Item B", price: 3000, stockQty: 5,  description: "Imported from spreadsheet" },
      ]},
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(businessId) });
        toast({ title: "Products imported successfully" });
      },
    });
  };

  if (isLoading) return <div className="py-16 text-center text-muted-foreground text-sm">Loading products…</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">Your Products</h2>
          <p className="text-sm text-muted-foreground">Everything your WhatsApp assistant can sell.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleImport}
            disabled={importProducts.isPending}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {importProducts.isPending ? "Importing…" : "Import CSV"}
          </button>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <button className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90 transition-colors">
                <Plus className="h-4 w-4" /> Add Product
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add New Product</DialogTitle></DialogHeader>
              <Form {...createForm}>
                <form onSubmit={createForm.handleSubmit(onSubmitCreate)} className="space-y-4 mt-2">
                  <ProductFormFields form={createForm} />
                  <button type="submit" disabled={createProduct.isPending} className="w-full h-10 rounded-lg bg-primary text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60 transition-colors">
                    {createProduct.isPending ? "Saving…" : "Save Product"}
                  </button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Empty state */}
      {!products?.length ? (
        <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-2xl py-20 text-center px-4">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Package className="h-7 w-7 text-primary" />
          </div>
          <h3 className="text-lg font-bold mb-2">No products yet</h3>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            Add products so your WhatsApp assistant knows what to sell and how to describe them to customers.
          </p>
          <button onClick={() => setIsCreateOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-white hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> Add your first product
          </button>
        </div>
      ) : (
        /* Product list */
        <div className="border border-border rounded-xl overflow-hidden">
          {/* Table head */}
          <div className="grid grid-cols-[2fr_1fr_0.7fr_0.7fr_80px] bg-muted/50 px-4 py-2.5 border-b border-border">
            {["PRODUCT", "PRICE", "STOCK", "STATUS", ""].map((h) => (
              <span key={h} className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{h}</span>
            ))}
          </div>

          {products.map((p, i) => (
            <div key={p.id} className={`grid grid-cols-[2fr_1fr_0.7fr_0.7fr_80px] items-center px-4 py-3.5 ${i < products.length - 1 ? "border-b border-border" : ""} hover:bg-muted/30 transition-colors`}>
              {/* Product */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-sm text-foreground truncate">{p.name}</div>
                  {p.description && <div className="text-xs text-muted-foreground truncate max-w-xs">{p.description}</div>}
                </div>
              </div>

              {/* Price */}
              <div className="text-sm font-semibold text-foreground">KES {p.price.toLocaleString()}</div>

              {/* Stock */}
              <div className="text-sm text-foreground">{p.stockQty}</div>

              {/* Status */}
              <div>
                {p.stockQty > 0 ? (
                  <span className="inline-flex items-center rounded-full bg-primary/10 text-primary text-xs font-semibold px-2.5 py-0.5">In Stock</span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 text-xs font-semibold px-2.5 py-0.5">Out of Stock</span>
                )}
              </div>

              {/* Actions */}
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
      )}

      {/* Edit Dialog */}
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

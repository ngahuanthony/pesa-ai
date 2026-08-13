import { useGetMe, useListProducts, getListProductsQueryKey, useCreateProduct, useDeleteProduct, useUpdateProduct, useImportProducts } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Edit, FileSpreadsheet } from "lucide-react";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Product } from "@workspace/api-client-react";

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  price: z.coerce.number().min(1, "Price must be positive"),
  stockQty: z.coerce.number().min(0, "Stock cannot be negative"),
  description: z.string().optional(),
});

export function ProductsTab() {
  const { data: me } = useGetMe();
  const businessId = me?.business?.id || "";
  const { data: products, isLoading } = useListProducts(businessId, { query: { enabled: !!businessId, queryKey: getListProductsQueryKey(businessId) } });
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const importProducts = useImportProducts();

  const form = useForm<z.infer<typeof productSchema>>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "",
      price: 0,
      stockQty: 0,
      description: "",
    },
  });

  const editForm = useForm<z.infer<typeof productSchema>>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "",
      price: 0,
      stockQty: 0,
      description: "",
    },
  });

  useEffect(() => {
    if (editingProduct) {
      editForm.reset({
        name: editingProduct.name,
        price: editingProduct.price,
        stockQty: editingProduct.stockQty,
        description: editingProduct.description || "",
      });
    }
  }, [editingProduct, editForm]);

  const onSubmitCreate = (data: z.infer<typeof productSchema>) => {
    createProduct.mutate({ businessId, data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(businessId) });
        setIsCreateOpen(false);
        form.reset();
        toast({ title: "Product added successfully" });
      }
    });
  };

  const onSubmitEdit = (data: z.infer<typeof productSchema>) => {
    if (!editingProduct) return;
    updateProduct.mutate({ businessId, productId: editingProduct.id, data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(businessId) });
        setEditingProduct(null);
        toast({ title: "Product updated" });
      }
    });
  };

  const handleDelete = (id: string) => {
    if (confirm("Delete this product?")) {
      deleteProduct.mutate({ businessId, productId: id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(businessId) });
          toast({ title: "Product deleted" });
        }
      });
    }
  };

  const handleMockImport = () => {
    importProducts.mutate({
      businessId, 
      data: {
        rows: [
          { name: "Imported Item 1", price: 1000, stockQty: 10, description: "From CSV" },
          { name: "Imported Item 2", price: 2000, stockQty: 5, description: "From CSV" }
        ]
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(businessId) });
        toast({ title: "Import successful" });
      }
    });
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading products...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold">Your Inventory</h2>
          <p className="text-sm text-muted-foreground">Add products for the AI to sell.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleMockImport} disabled={importProducts.isPending}>
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Import CSV
          </Button>
          
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" /> Add Product
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Product</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmitCreate)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Product Name</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="price"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Price (KES)</FormLabel>
                          <FormControl><Input type="number" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="stockQty"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Stock Quantity</FormLabel>
                          <FormControl><Input type="number" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description (helps AI sell it)</FormLabel>
                        <FormControl><Textarea rows={3} {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={createProduct.isPending}>
                    {createProduct.isPending ? "Saving..." : "Save Product"}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {!products?.length ? (
        <div className="border-2 border-dashed border-border rounded-xl p-12 text-center flex flex-col items-center">
          <h3 className="text-lg font-semibold mb-2">No products yet</h3>
          <p className="text-muted-foreground text-sm max-w-md mb-6">
            Your AI assistant needs products to sell. Add your first product or import a list.
          </p>
          <Button onClick={() => setIsCreateOpen(true)}>Add your first product</Button>
        </div>
      ) : (
        <div className="border rounded-md overflow-hidden bg-card">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[120px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {p.name}
                    {p.description && <p className="text-xs text-muted-foreground truncate max-w-xs">{p.description}</p>}
                  </TableCell>
                  <TableCell>KES {p.price.toLocaleString()}</TableCell>
                  <TableCell>{p.stockQty}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${p.active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {p.active ? 'Active' : 'Inactive'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setEditingProduct(p)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDelete(p.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingProduct} onOpenChange={(open) => !open && setEditingProduct(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onSubmitEdit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product Name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price (KES)</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="stockQty"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Stock Quantity</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (helps AI sell it)</FormLabel>
                    <FormControl><Textarea rows={3} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={updateProduct.isPending}>
                {updateProduct.isPending ? "Saving..." : "Update Product"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

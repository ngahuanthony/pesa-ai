import { PublicLayout } from "@/components/layout";
import { MERCHANT_TYPES, displayMerchantType } from "@/constants/merchant-types";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  stockQty: number;
};

type SetupDraft = {
  businessName: string;
  merchantType: string;
  personalPhone: string;
  pesaAiNumber: string;
  location: string;
  products: Product[];
};

type ProfileForm = Omit<SetupDraft, "products">;
type ProductForm = Omit<Product, "id" | "price" | "stockQty"> & { price: number | ""; stockQty: number | "" };

const emptyProfile: ProfileForm = {
  businessName: "",
  merchantType: "retail",
  personalPhone: "",
  pesaAiNumber: "",
  location: "",
};

const emptyProduct: ProductForm = { name: "", description: "", price: "", stockQty: "" };

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const local = digits.startsWith("254")
    ? `0${digits.slice(3)}`
    : digits.startsWith("0")
      ? digits
      : digits
        ? `0${digits}`
        : "";
  const limited = local.slice(0, 10);
  return [limited.slice(0, 4), limited.slice(4, 7), limited.slice(7, 10)].filter(Boolean).join(" ");
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  return digits.startsWith("0") ? `254${digits.slice(1)}` : digits;
}

function isValidKenyanPhone(value: string) {
  return /^0[17]\d{8}$/.test(value.replace(/\D/g, ""));
}

export default function SetupPage() {
  const [, setLocation] = useLocation();
  const [draftExists, setDraftExists] = useState(false);
  const [profile, setProfile] = useState<ProfileForm>(emptyProfile);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [productForm, setProductForm] = useState<ProductForm>(emptyProduct);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadDraft = async () => {
      try {
        const response = await fetch("/api/setup", { credentials: "include" });
        if (response.status === 401) return;
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Could not load your setup draft.");
        if (!body.draft) return;
        if (active) {
          const draft = body.draft as SetupDraft;
          setProfile({
            businessName: draft.businessName || "",
            merchantType: displayMerchantType(draft.merchantType),
            personalPhone: formatPhone(draft.personalPhone || ""),
            pesaAiNumber: formatPhone(draft.pesaAiNumber || ""),
            location: draft.location || "",
          });
          setProducts(Array.isArray(draft.products) ? draft.products : []);
          setDraftExists(true);
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load your setup draft.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadDraft();
    return () => { active = false; };
  }, []);

  const request = async (url: string, method: string, payload?: unknown) => {
    const response = await fetch(url, {
      method,
      headers: payload ? { "content-type": "application/json" } : undefined,
      credentials: "include",
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Could not save your setup draft.");
    return body;
  };

  const validatePhones = () => {
    if (!isValidKenyanPhone(profile.pesaAiNumber) || !isValidKenyanPhone(profile.personalPhone)) {
      return "Enter two valid Kenyan phone numbers (for example, 0712 345 678).";
    }
    if (normalizePhone(profile.pesaAiNumber) === normalizePhone(profile.personalPhone)) {
      return "Use two different numbers for the public shop line and your personal number.";
    }
    return "";
  };

  const saveProfile = async () => {
    setError("");
    setNotice("");
    if (!profile.businessName.trim()) {
      setError("Enter a business name before saving.");
      return false;
    }
    const phoneError = validatePhones();
    if (phoneError) {
      setError(phoneError);
      return false;
    }
    setSavingProfile(true);
    try {
      const body = await request("/api/setup", draftExists ? "PATCH" : "POST", {
        ...profile,
        businessName: profile.businessName.trim(),
        personalPhone: normalizePhone(profile.personalPhone),
        pesaAiNumber: normalizePhone(profile.pesaAiNumber),
      });
      const draft = body.draft as SetupDraft;
      setProfile({
        businessName: draft.businessName || profile.businessName.trim(),
        merchantType: displayMerchantType(draft.merchantType || profile.merchantType),
        personalPhone: formatPhone(draft.personalPhone || profile.personalPhone),
        pesaAiNumber: formatPhone(draft.pesaAiNumber || profile.pesaAiNumber),
        location: draft.location ?? profile.location,
      });
      setProducts(Array.isArray(draft.products) ? draft.products : products);
      setDraftExists(true);
      setNotice("Draft profile saved. It is still private and unverified.");
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save your setup draft.");
      return false;
    } finally {
      setSavingProfile(false);
    }
  };

  const continueToVerification = async () => {
    if (!await saveProfile()) return;
    sessionStorage.setItem("pesa_setup_prefill", JSON.stringify({
      ...profile,
      businessName: profile.businessName.trim(),
      personalPhone: formatPhone(profile.personalPhone),
      pesaAiNumber: formatPhone(profile.pesaAiNumber),
    }));
    setLocation("/signup");
  };

  const saveProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!draftExists) {
      setError("Save your business profile before adding products.");
      return;
    }
    if (productForm.price === "" || productForm.stockQty === "") {
      setError("Enter a price and stock quantity before saving.");
      return;
    }
    setSavingProduct(true);
    try {
      const body = await request(
        editingProductId ? `/api/setup/products/${encodeURIComponent(editingProductId)}` : "/api/setup/products",
        editingProductId ? "PATCH" : "POST",
        { ...productForm, name: productForm.name.trim(), price: Number(productForm.price), stockQty: Number(productForm.stockQty) },
      );
      setProducts(Array.isArray(body.draft?.products) ? body.draft.products : products);
      setProductForm(emptyProduct);
      setEditingProductId(null);
      setNotice(editingProductId ? "Product draft updated." : "Product added to your draft.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save this product.");
    } finally {
      setSavingProduct(false);
    }
  };

  const editProduct = (product: Product) => {
    setEditingProductId(product.id);
    setProductForm({ name: product.name, description: product.description || "", price: product.price, stockQty: product.stockQty });
    setError("");
    setNotice("");
  };

  const deleteProduct = async (id: string) => {
    setError("");
    setNotice("");
    try {
      const body = await request(`/api/setup/products/${encodeURIComponent(id)}`, "DELETE");
      setProducts(Array.isArray(body.draft?.products) ? body.draft.products : products.filter((product) => product.id !== id));
      if (editingProductId === id) {
        setProductForm(emptyProduct);
        setEditingProductId(null);
      }
      setNotice("Product removed from your draft.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete this product.");
    }
  };

  const cancelProductEdit = () => {
    setProductForm(emptyProduct);
    setEditingProductId(null);
  };

  const inputClass = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-[#168447] focus:ring-2 focus:ring-[#168447]/20";

  return (
    <PublicLayout>
      <main className="flex-1 bg-[#f7faf8] px-4 py-8 sm:py-12">
        <div className="mx-auto max-w-4xl">
          <header className="mb-6">
            <p className="text-sm font-bold uppercase tracking-wider text-[#168447]">Private setup workspace</p>
            <h1 className="mt-2 text-3xl font-extrabold text-[#0a4a3a] sm:text-4xl">Prepare your shop draft</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">Save your business details and product list before phone verification. Return using this browser within 30 days to edit your draft. Products become public only after both phones are verified.</p>
          </header>

          <aside role="status" className="mb-6 rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-sm font-extrabold leading-relaxed text-amber-950">
            Draft only: not verified, not public, no orders/payments/messaging
          </aside>

          {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          {notice && <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}

          <section aria-labelledby="profile-heading" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
            <h2 id="profile-heading" className="text-xl font-extrabold text-slate-900">Business profile</h2>
            <p className="mt-1 text-sm text-slate-600">Your numbers must be valid and different: one shop line and one personal line.</p>
            {loading ? <p role="status" className="py-8 text-sm text-slate-500">Loading your saved draft…</p> : (
              <form className="mt-5 grid gap-5 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void saveProfile(); }}>
                <div className="sm:col-span-2">
                  <label htmlFor="business-name" className="text-sm font-semibold">Business name</label>
                  <input id="business-name" className={inputClass} value={profile.businessName} onChange={(event) => setProfile({ ...profile, businessName: event.target.value })} autoComplete="organization" required />
                </div>
                <div>
                  <label htmlFor="merchant-type" className="text-sm font-semibold">Business type</label>
                  <select id="merchant-type" className={inputClass} value={profile.merchantType} onChange={(event) => setProfile({ ...profile, merchantType: event.target.value })}>
                    {MERCHANT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="location" className="text-sm font-semibold">Location <span className="font-normal text-slate-500">(optional)</span></label>
                  <input id="location" className={inputClass} value={profile.location} onChange={(event) => setProfile({ ...profile, location: event.target.value })} autoComplete="address-level2" placeholder="Town or neighbourhood" />
                </div>
                <div>
                  <label htmlFor="shop-phone" className="text-sm font-semibold">Shop phone (public)</label>
                  <input id="shop-phone" type="tel" inputMode="tel" autoComplete="tel" className={inputClass} value={profile.pesaAiNumber} onChange={(event) => setProfile({ ...profile, pesaAiNumber: formatPhone(event.target.value) })} placeholder="0712 345 678" required aria-describedby="shop-phone-help" />
                  <p id="shop-phone-help" className="mt-1 text-xs text-slate-500">Displayed in a readable Kenyan format.</p>
                </div>
                <div>
                  <label htmlFor="personal-phone" className="text-sm font-semibold">Your phone (private)</label>
                  <input id="personal-phone" type="tel" inputMode="tel" autoComplete="tel" className={inputClass} value={profile.personalPhone} onChange={(event) => setProfile({ ...profile, personalPhone: formatPhone(event.target.value) })} placeholder="0722 345 678" required aria-describedby="personal-phone-help" />
                  <p id="personal-phone-help" className="mt-1 text-xs text-slate-500">Must be different from the shop phone.</p>
                </div>
                <div className="flex flex-col gap-3 pt-1 sm:col-span-2 sm:flex-row">
                  <button type="submit" disabled={savingProfile} className="rounded-xl border border-[#0a4a3a] px-5 py-3 text-sm font-bold text-[#0a4a3a] hover:bg-[#f4fff7] disabled:opacity-60">
                    {savingProfile ? "Saving…" : draftExists ? "Save profile draft" : "Create profile draft"}
                  </button>
                  <button type="button" onClick={() => void continueToVerification()} disabled={savingProfile} className="rounded-xl bg-[#0a4a3a] px-5 py-3 text-sm font-bold text-white hover:bg-[#126348] disabled:opacity-60">
                    Verify phones to open shop
                  </button>
                </div>
              </form>
            )}
          </section>

          <section aria-labelledby="products-heading" className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 id="products-heading" className="text-xl font-extrabold text-slate-900">Products in this draft</h2>
                <p className="mt-1 text-sm text-slate-600">These are private draft details, not a public catalog.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{products.length} {products.length === 1 ? "product" : "products"}</span>
            </div>
            {!draftExists && !loading && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Create your profile draft before you add products.</p>}
            {draftExists && (
              <form onSubmit={(event) => void saveProduct(event)} className="mt-5 grid gap-4 rounded-2xl bg-[#f7faf8] p-4 sm:grid-cols-2 sm:p-5">
                <h3 className="sm:col-span-2 text-sm font-bold text-slate-800">{editingProductId ? "Edit product draft" : "Add a product to your draft"}</h3>
                <div>
                  <label htmlFor="product-name" className="text-sm font-semibold">Product name</label>
                  <input id="product-name" className={inputClass} value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} required />
                </div>
                <div>
                  <label htmlFor="product-description" className="text-sm font-semibold">Description</label>
                  <input id="product-description" className={inputClass} value={productForm.description} onChange={(event) => setProductForm({ ...productForm, description: event.target.value })} />
                </div>
                <div>
                  <label htmlFor="product-price" className="text-sm font-semibold">Price (KES)</label>
                  <input id="product-price" type="number" min="0" step="0.01" className={inputClass} value={productForm.price} onChange={(event) => setProductForm({ ...productForm, price: Number(event.target.value) })} required />
                </div>
                <div>
                  <label htmlFor="product-stock" className="text-sm font-semibold">Stock quantity</label>
                  <input id="product-stock" type="number" min="0" step="1" className={inputClass} value={productForm.stockQty} onChange={(event) => setProductForm({ ...productForm, stockQty: Number(event.target.value) })} required />
                </div>
                <div className="flex flex-wrap gap-3 sm:col-span-2">
                  <button type="submit" disabled={savingProduct} className="rounded-xl bg-[#0a4a3a] px-5 py-3 text-sm font-bold text-white disabled:opacity-60">{savingProduct ? "Saving…" : editingProductId ? "Save product changes" : "Add product"}</button>
                  {editingProductId && <button type="button" onClick={cancelProductEdit} className="rounded-xl border px-5 py-3 text-sm font-semibold text-slate-700">Cancel edit</button>}
                </div>
              </form>
            )}
            {products.length > 0 && (
              <ul className="mt-5 divide-y divide-slate-200">
                {products.map((product) => (
                  <li key={product.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-900">{product.name}</h3>
                      {product.description && <p className="mt-1 text-sm text-slate-600">{product.description}</p>}
                      <p className="mt-1 text-sm text-slate-700">KES {Number(product.price).toLocaleString()} · Stock: {product.stockQty}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button type="button" onClick={() => editProduct(product)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Edit</button>
                      <button type="button" onClick={() => void deleteProduct(product.id)} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">Delete</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <p className="mt-5 text-center text-xs text-slate-500">Your draft stays private. Phone verification is required before opening a shop.</p>
        </div>
      </main>
    </PublicLayout>
  );
}
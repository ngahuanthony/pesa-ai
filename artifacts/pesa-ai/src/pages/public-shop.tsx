import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, LoaderCircle, MapPin, Package, Search } from "lucide-react";
import { Link, useRoute } from "wouter";
import { PublicLayout } from "@/components/layout";
import { BRAND_NAME } from "@/constants/brand";

type Shop = {
  name: string;
  category: string | null;
  location: string | null;
  deliveryAreas: string | null;
  buildingName: string | null;
  shopNumber: string | null;
  imageUrl: string | null;
  logoUrl: string | null;
  whatsappUrl: string | null;
  businessId: string;
  popularProducts: Array<{ id: string; name: string; price: number; stockQty: number }>;
};

type ProductVariant = {
  id: string;
  productName: string;
  variant: string | null;
  price: number;
  stockQty: number;
  imageUrl: string;
};

export default function PublicShopPage() {
  const [, params] = useRoute("/shop/:slug");
  const [shop, setShop] = useState<Shop | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductVariant[]>([]);
  const [searchState, setSearchState] = useState<"idle" | "loading" | "empty" | "error">("idle");

  useEffect(() => {
    if (!params?.slug) return;
    let cancelled = false;
    fetch(`/api/public/shops/${encodeURIComponent(params.slug)}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Shop not found");
        if (!cancelled) {
          setShop(body);
          setState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => { cancelled = true; };
  }, [params?.slug]);

  async function searchProducts(event: React.FormEvent) {
    event.preventDefault();
    if (!shop || !query.trim()) return;
    setSearchState("loading");
    setResults([]);
    try {
      const response = await fetch(`/api/products/search?business_id=${encodeURIComponent(shop.businessId)}&q=${encodeURIComponent(query.trim())}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Search failed");
      const variants = Array.isArray(body.variants) ? body.variants : [];
      setResults(variants);
      setSearchState(variants.length ? "idle" : "empty");
    } catch {
      setSearchState("error");
    }
  }

  return (
    <PublicLayout>
      <main className="min-h-screen bg-[#f7faf8] px-5 py-8 text-[#0a4a3a]">
        <div className="mx-auto max-w-5xl">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-[#0a4a3a]"><ArrowLeft className="h-4 w-4" /> Back to {BRAND_NAME}</Link>
          {state === "loading" && <div className="flex min-h-[50vh] items-center justify-center"><LoaderCircle className="h-7 w-7 animate-spin text-[#25a85a]" /></div>}
          {state === "error" && <div className="mx-auto mt-12 max-w-md rounded-2xl border bg-white p-8 text-center"><h1 className="text-2xl font-extrabold">Shop not found</h1><p className="mt-2 text-sm text-slate-600">This shop is private or the link is no longer available.</p><Link href="/#find-shop" className="mt-5 inline-flex rounded-xl bg-[#0a4a3a] px-5 py-3 text-sm font-bold text-white">Find another shop</Link></div>}
          {state === "ready" && shop && (
            <>
              <header className="mt-6 overflow-hidden rounded-3xl bg-[#0a4a3a] text-white shadow-lg">
                {shop.imageUrl && <img src={shop.imageUrl} alt="" className="h-48 w-full object-cover opacity-80" />}
                <div className="p-7">
                  <div className="flex items-start gap-4">
                    {shop.logoUrl && <img src={shop.logoUrl} alt="" className="h-16 w-16 rounded-2xl object-cover ring-2 ring-white/30" />}
                    <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#8ee2a9]">Public shop</p><h1 className="mt-1 text-3xl font-extrabold">{shop.name}</h1><p className="mt-2 text-sm text-white/70">{shop.category || "Kenyan business"}</p></div>
                  </div>
                  <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/75">{shop.location && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {shop.location}</span>}{shop.buildingName && <span>{shop.buildingName}{shop.shopNumber ? ` · ${shop.shopNumber}` : ""}</span>}</div>
                </div>
              </header>
              <section className="mt-8 pb-28">
                <div className="rounded-3xl border border-[#d9e8df] bg-white p-5 shadow-sm md:p-7">
                  <div className="flex items-center gap-2"><Search className="h-5 w-5 text-[#25a85a]" /><h2 className="text-2xl font-extrabold">Find a product</h2></div>
                  <p className="mt-2 text-sm text-slate-600">Search first. We only load the photo for the product variant you request.</p>
                  <form onSubmit={searchProducts} className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <label className="sr-only" htmlFor="product-search">Product search</label>
                    <input id="product-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Unatafuta bidhaa gani? e.g. iPhone 16 orange covers" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#25a85a]" />
                    <button type="submit" disabled={searchState === "loading" || !query.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0a4a3a] px-5 py-3 text-sm font-bold text-white disabled:opacity-60"><Search className="h-4 w-4" /> Search</button>
                  </form>
                  {searchState === "loading" && <div className="mt-6 flex justify-center"><LoaderCircle className="h-6 w-6 animate-spin text-[#25a85a]" /></div>}
                  {searchState === "error" && <p role="alert" className="mt-4 text-sm text-red-700">We could not search this shop. Try again.</p>}
                  {searchState === "empty" && <p className="mt-4 rounded-2xl bg-[#f7faf8] p-4 text-sm text-slate-600">No photographed variant matched that search. Ask the shop on WhatsApp.</p>}
                  {results.length > 0 && <div className="mt-6 grid gap-4 sm:grid-cols-2">{results.map((result) => <article key={result.id} className="overflow-hidden rounded-2xl border bg-[#f7faf8]"><img src={result.imageUrl} alt={`${result.productName}${result.variant ? ` ${result.variant}` : ""}`} className="h-56 w-full object-cover" loading="lazy" /><div className="p-5"><h3 className="font-bold">{result.productName}{result.variant ? ` · ${result.variant}` : ""}</h3><div className="mt-4 flex items-center justify-between gap-3"><span className="font-extrabold">KSh {Number(result.price || 0).toLocaleString()}</span><span className={result.stockQty > 0 ? "text-xs font-semibold text-[#168447]" : "text-xs font-semibold text-slate-400"}>{result.stockQty > 0 ? `Stock: ${result.stockQty}` : "Out of stock"}</span></div></div></article>)}</div>}
                  {results.length === 0 && searchState === "idle" && <div className="mt-7"><div className="flex items-center gap-2"><Package className="h-5 w-5 text-[#25a85a]" /><h3 className="text-lg font-extrabold">Popular products</h3></div>{shop.popularProducts.length === 0 ? <p className="mt-3 text-sm text-slate-600">Ask the merchant what is available today.</p> : <div className="mt-3 grid gap-3 sm:grid-cols-3">{shop.popularProducts.slice(0, 3).map((product) => <div key={product.id} className="rounded-2xl border bg-[#f7faf8] p-4"><p className="font-semibold">{product.name}</p><p className="mt-2 text-sm font-bold">KSh {Number(product.price || 0).toLocaleString()}</p><p className="mt-1 text-xs text-[#168447]">Stock: {product.stockQty}</p></div>)}</div>}</div>}
                </div>
              </section>
              {shop.whatsappUrl && <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[#d9e8df] bg-white/95 px-5 py-3 shadow-[0_-8px_30px_rgba(10,74,58,0.12)] backdrop-blur"><div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><a href={shop.whatsappUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-5 py-3 text-sm font-bold text-white"><ExternalLink className="h-4 w-4" /> Chat on WhatsApp Shop</a><a href={shop.whatsappUrl} target="_blank" rel="noreferrer" className="text-center text-xs font-semibold text-slate-600 underline underline-offset-4">Open directly in WhatsApp</a></div></div>}
            </>
          )}
        </div>
      </main>
    </PublicLayout>
  );
}

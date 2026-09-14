import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, LoaderCircle, MapPin, Package } from "lucide-react";
import { Link, useRoute } from "wouter";
import { PublicLayout } from "@/components/layout";

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
  products: Array<{ id: string; name: string; description: string | null; price: number; stockQty: number; imageUrl: string | null }>;
};

export default function PublicShopPage() {
  const [, params] = useRoute("/shop/:slug");
  const [shop, setShop] = useState<Shop | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

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

  return (
    <PublicLayout>
      <main className="min-h-screen bg-[#f7faf8] px-5 py-8 text-[#0a4a3a]">
        <div className="mx-auto max-w-5xl">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-[#0a4a3a]"><ArrowLeft className="h-4 w-4" /> Back to Pesa AI</Link>
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
                  {shop.whatsappUrl && <a href={shop.whatsappUrl} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-5 py-3 text-sm font-bold text-white"><ExternalLink className="h-4 w-4" /> Ask on WhatsApp</a>}
                </div>
              </header>
              <section className="mt-8">
                <div className="flex items-center gap-2"><Package className="h-5 w-5 text-[#25a85a]" /><h2 className="text-2xl font-extrabold">Products</h2></div>
                {shop.products.length === 0 ? <p className="mt-4 rounded-2xl border bg-white p-6 text-sm text-slate-600">This shop has not added products yet. Ask the merchant on WhatsApp.</p> : <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{shop.products.map((product) => <article key={product.id} className="overflow-hidden rounded-2xl border bg-white shadow-sm">{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-48 w-full object-cover" /> : <div className="flex h-48 items-center justify-center bg-[#e7f7ed] text-4xl">🛍️</div>}<div className="p-5"><h3 className="font-bold">{product.name}</h3>{product.description && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{product.description}</p>}<div className="mt-4 flex items-center justify-between gap-3"><span className="font-extrabold">KSh {Number(product.price || 0).toLocaleString()}</span><span className={product.stockQty > 0 ? "text-xs font-semibold text-[#168447]" : "text-xs font-semibold text-slate-400"}>{product.stockQty > 0 ? "In stock" : "Ask for availability"}</span></div></div></article>)}</div>}
              </section>
            </>
          )}
        </div>
      </main>
    </PublicLayout>
  );
}

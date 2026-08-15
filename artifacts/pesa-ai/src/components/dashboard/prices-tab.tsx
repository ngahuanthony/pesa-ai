import { Tag, ArrowRight } from "lucide-react";
import { Link } from "wouter";

export function PricesTab() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
        <Tag className="h-8 w-8 text-primary" />
      </div>
      <h2 className="text-xl font-bold text-foreground">Prices</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-[320px]">
        Set bulk pricing rules, discounts, and offers for your products. Coming soon.
      </p>
      <Link href="/dashboard/products" className="mt-6 inline-flex items-center gap-2 h-9 rounded-full bg-primary px-5 text-sm font-semibold text-white hover:bg-primary/90">
        Edit individual prices <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

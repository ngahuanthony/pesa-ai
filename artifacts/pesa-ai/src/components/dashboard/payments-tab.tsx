import { CreditCard, ArrowRight } from "lucide-react";
import { Link } from "wouter";

export function PaymentsTab() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50 mb-4">
        <CreditCard className="h-8 w-8 text-green-600" />
      </div>
      <h2 className="text-xl font-bold text-foreground">Payments</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-[340px]">
        View M-Pesa payment records, reconcile transactions, and track revenue. Coming soon.
      </p>
      <Link href="/dashboard/sales" className="mt-6 inline-flex items-center gap-2 h-9 rounded-full bg-primary px-5 text-sm font-semibold text-white hover:bg-primary/90">
        View sales reports <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

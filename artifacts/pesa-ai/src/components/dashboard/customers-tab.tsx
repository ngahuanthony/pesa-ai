import { Users } from "lucide-react";

export function CustomersTab() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 mb-4">
        <Users className="h-8 w-8 text-blue-600" />
      </div>
      <h2 className="text-xl font-bold text-foreground">Customers</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-[320px]">
        View and manage your customer list, purchase history, and contact details. Coming soon.
      </p>
      <p className="text-xs text-muted-foreground mt-4">
        Customers who order through WhatsApp will automatically appear here.
      </p>
    </div>
  );
}

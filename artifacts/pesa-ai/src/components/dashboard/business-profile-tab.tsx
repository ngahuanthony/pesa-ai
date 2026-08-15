import { useGetMe } from "@workspace/api-client-react";
import { User, Store, Mail, Phone } from "lucide-react";

export function BusinessProfileTab() {
  const { data: me } = useGetMe();
  const business = (me as any)?.business;
  const account  = (me as any)?.account;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-border p-6 shadow-sm">
        <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <Store className="h-4 w-4 text-primary" /> Shop Information
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            { label: "Business Name",  value: business?.name,     icon: Store },
            { label: "Category",       value: business?.category, icon: Store },
            { label: "Email Address",  value: account?.email,     icon: Mail },
            { label: "Phone Number",   value: business?.phone || "—", icon: Phone },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
              <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 bg-[#f9f9f7]">
                <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <p className="text-sm text-foreground">{value || "—"}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-border p-6 shadow-sm">
        <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <User className="h-4 w-4 text-primary" /> Account Details
        </h2>
        <p className="text-sm text-muted-foreground">
          To update your business profile, contact support at{" "}
          <a href="mailto:hello@pesaai.africa" className="text-primary underline">hello@pesaai.africa</a>.
        </p>
      </div>
    </div>
  );
}

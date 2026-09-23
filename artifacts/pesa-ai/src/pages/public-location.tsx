import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { Loader2, AlertTriangle, MessageCircle } from "lucide-react";
import { BRAND_NAME } from "@/constants/brand";

export default function PublicLocationPage() {
  const params = useParams();
  const token = params.token;
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Invalid QR code");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const res = await fetch(`/api/public/service-locations/${token}`);
        if (!res.ok) {
          throw new Error("Could not find this location");
        }
        const data = await res.json();
        const info = data.data !== undefined ? data.data : data;
        
        if (!info?.business?.whatsappConnected) {
          throw new Error("This business does not have a WhatsApp number connected yet.");
        }
        
        const phoneRaw = info.business.whatsappPhone;
        if (!phoneRaw) {
          throw new Error("Business phone number is not available.");
        }
        
        // Normalize phone for wa.me
        const digits = phoneRaw.replace(/\D/g, "");
        let phone = digits;
        if (digits.startsWith("0")) phone = "254" + digits.slice(1);
        else if (digits.startsWith("7") || digits.startsWith("1")) phone = "254" + digits;
        
        const message = encodeURIComponent(`Hi, I'm at ${info.location?.label || "a service location"} (location=${token}) and I would like to order.`);
        
        window.location.replace(`https://wa.me/${phone}?text=${message}`);
      } catch (err: any) {
        setError(err.message || "Failed to load location.");
        setLoading(false);
      }
    }
    load();
  }, [token]);

  if (error) {
    return (
      <div className="min-h-[100dvh] bg-[#f7f7f5] flex items-center justify-center p-4">
        <div className="bg-white max-w-sm w-full rounded-2xl p-6 shadow-sm border border-border text-center space-y-4">
          <div className="h-12 w-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold">Oops!</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#f7f7f5] flex flex-col items-center justify-center p-4 text-center">
      <div className="mb-6 flex items-center justify-center h-16 w-16 bg-[#25D366] text-white rounded-2xl shadow-lg">
        <MessageCircle className="h-8 w-8" />
      </div>
      <h1 className="text-2xl font-bold text-foreground mb-2">Opening WhatsApp...</h1>
      <p className="text-muted-foreground text-sm max-w-xs mb-8">
        Taking you to the business's chat to start your order.
      </p>
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      
      <p className="mt-12 text-xs font-medium text-muted-foreground/60 uppercase tracking-widest">
        Powered by {BRAND_NAME}
      </p>
    </div>
  );
}
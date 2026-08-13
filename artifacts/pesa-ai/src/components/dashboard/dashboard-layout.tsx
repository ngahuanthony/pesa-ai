import { Link } from "wouter";
import { SiWhatsapp } from "react-icons/si";
import { LogOut, HelpCircle } from "lucide-react";
import { useLogout, useGetMe, useCreateReport } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: me } = useGetMe();
  const logout = useLogout();
  const createReport = useCreateReport();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        setLocation("/login");
      }
    });
  };

  const handleReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!me?.business?.id) return;
    
    createReport.mutate({
      data: {
        businessId: me.business.id,
        reason: reportReason,
        details: reportDetails,
        reporterContact: me.business.phone
      }
    }, {
      onSuccess: () => {
        setIsReportOpen(false);
        setReportReason("");
        setReportDetails("");
        toast({ title: "Report submitted successfully. Support will contact you." });
      }
    });
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-foreground">
      <header className="sticky top-0 z-50 w-full border-b border-border bg-card">
        <div className="container mx-auto px-4 md:px-6 flex h-16 items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <SiWhatsapp className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold tracking-tight">Pesa AI</span>
          </Link>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex flex-col items-end mr-2">
              <span className="text-sm font-semibold">{me?.business?.name}</span>
              <span className="text-xs text-muted-foreground">{me?.business?.phone}</span>
            </div>
            
            <Dialog open={isReportOpen} onOpenChange={setIsReportOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                  <HelpCircle className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Contact Support</DialogTitle>
                  <DialogDescription>Report an issue or request help from the Adplay Media team.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleReport} className="space-y-4 mt-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Reason</label>
                    <Input 
                      required 
                      value={reportReason} 
                      onChange={(e) => setReportReason(e.target.value)} 
                      placeholder="e.g., Billing Issue, Bug, etc." 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Details</label>
                    <Textarea 
                      required 
                      rows={4} 
                      value={reportDetails} 
                      onChange={(e) => setReportDetails(e.target.value)} 
                      placeholder="Please describe the issue..." 
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={createReport.isPending}>
                    {createReport.isPending ? "Submitting..." : "Submit Report"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>

            <button 
              onClick={handleLogout}
              className="inline-flex h-9 items-center justify-center rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <LogOut className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 flex flex-col p-4 md:p-6 lg:p-8">
        <div className="container mx-auto w-full max-w-6xl">
          {children}
        </div>
      </main>
    </div>
  );
}

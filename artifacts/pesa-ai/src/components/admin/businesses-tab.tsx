import { useAdminListBusinesses, getAdminListBusinessesQueryKey, useAdminChargeSubscription, useAdminSuspendBusiness, useAdminUnsuspendBusiness } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Ban, PlayCircle, CreditCard, Smartphone } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export function AdminBusinessesTab() {
  const { data: businesses, isLoading } = useAdminListBusinesses();
  const [search, setSearch] = useState("");
  
  const charge = useAdminChargeSubscription();
  const suspend = useAdminSuspendBusiness();
  const unsuspend = useAdminUnsuspendBusiness();
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleAction = (action: 'charge' | 'suspend' | 'unsuspend', businessId: string) => {
    if (action === 'suspend') {
      if(!confirm("Suspend this business? They will lose access.")) return;
      suspend.mutate({ businessId }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListBusinessesQueryKey() });
          toast({ title: "Business suspended" });
        }
      });
    } else if (action === 'unsuspend') {
      unsuspend.mutate({ businessId }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListBusinessesQueryKey() });
          toast({ title: "Business unsuspended" });
        }
      });
    } else if (action === 'charge') {
      charge.mutate({ businessId, data: {} }, {
        onSuccess: () => {
          toast({ title: "Charge prompt initiated" });
        }
      });
    }
  };

  const filtered = businesses?.filter(b => 
    b.name.toLowerCase().includes(search.toLowerCase()) || 
    b.phone.includes(search)
  ) || [];

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'active': return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs">Active</Badge>;
      case 'trialing': return <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-xs">Trialing</Badge>;
      case 'suspended': return <Badge variant="outline" className="bg-rose-500/10 text-rose-400 border-rose-500/20 text-xs">Suspended</Badge>;
      case 'past_due': return <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-xs">Past Due</Badge>;
      default: return <Badge variant="outline" className="bg-zinc-800 text-zinc-400 border-zinc-700 text-xs">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-4">
        <h2 className="text-lg font-semibold text-zinc-100">Client Roster</h2>
        <div className="relative w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
          <Input 
            placeholder="Search businesses..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-zinc-700 placeholder:text-zinc-600 h-9"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-zinc-500">Loading roster...</div>
      ) : (
        <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-950">
          <Table>
            <TableHeader className="bg-zinc-900 border-b border-zinc-800">
              <TableRow className="hover:bg-zinc-900 border-zinc-800">
                <TableHead className="text-zinc-400">Business</TableHead>
                <TableHead className="text-zinc-400">Plan</TableHead>
                <TableHead className="text-zinc-400">Status</TableHead>
                <TableHead className="text-zinc-400">WhatsApp</TableHead>
                <TableHead className="text-zinc-400 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(b => (
                <TableRow key={b.id} className="border-zinc-800 hover:bg-zinc-900/50">
                  <TableCell>
                    <div className="font-medium text-zinc-200">{b.name}</div>
                    <div className="text-xs text-zinc-500">{b.phone} • {b.category}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-zinc-300">{b.subscription.plan}</div>
                    <div className="text-[10px] text-zinc-500">
                      Ends {new Date(b.subscription.currentPeriodEnd).toLocaleDateString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(b.subscription.status)}
                  </TableCell>
                  <TableCell>
                    {b.whatsappPhoneNumberId ? (
                      <Smartphone className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <Smartphone className="w-4 h-4 text-zinc-700" />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-7 text-xs bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                        onClick={() => handleAction('charge', b.id)}
                        disabled={charge.isPending}
                      >
                        <CreditCard className="w-3 h-3 mr-1.5" /> Charge
                      </Button>
                      {b.subscription.status === 'suspended' ? (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-7 text-xs bg-emerald-950 border-emerald-900 text-emerald-400 hover:bg-emerald-900 hover:text-emerald-300"
                          onClick={() => handleAction('unsuspend', b.id)}
                          disabled={unsuspend.isPending}
                        >
                          <PlayCircle className="w-3 h-3 mr-1.5" /> Restore
                        </Button>
                      ) : (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-7 text-xs bg-rose-950 border-rose-900 text-rose-400 hover:bg-rose-900 hover:text-rose-300"
                          onClick={() => handleAction('suspend', b.id)}
                          disabled={suspend.isPending}
                        >
                          <Ban className="w-3 h-3 mr-1.5" /> Suspend
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-zinc-500">
                    No businesses found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

import { useAdminListReports, getAdminListReportsQueryKey, useAdminUpdateReport } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export function AdminReportsTab() {
  const { data: reportsGrouped, isLoading } = useAdminListReports();
  const updateReport = useAdminUpdateReport();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleUpdate = (id: string, status: string) => {
    updateReport.mutate({ id, data: { status } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListReportsQueryKey() });
        toast({ title: `Report marked as ${status}` });
      }
    });
  };

  if (isLoading) return <div className="text-center py-12 text-zinc-500">Loading reports...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-4">
        <h2 className="text-lg font-semibold text-zinc-100">Customer Reports</h2>
      </div>

      {!reportsGrouped?.length ? (
        <div className="border border-zinc-800 rounded-lg p-12 text-center bg-zinc-950">
          <p className="text-zinc-500">No open reports.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {reportsGrouped.map((group) => (
            <div key={group.business?.id} className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-950">
              <div className="bg-zinc-900 border-b border-zinc-800 p-3 px-4 flex justify-between items-center">
                <div>
                  <div className="font-semibold text-zinc-200">{group.business?.name}</div>
                  <div className="text-xs text-zinc-500">{group.business?.phone}</div>
                </div>
                <Badge variant="outline" className="bg-rose-500/10 text-rose-400 border-rose-500/20">
                  {group.openCount} Open Reports
                </Badge>
              </div>
              <Table>
                <TableBody>
                  {group.reports.map(r => (
                    <TableRow key={r.id} className="border-zinc-800 hover:bg-zinc-900/50">
                      <TableCell>
                        <div className="font-medium text-zinc-300 text-sm">{r.reason}</div>
                        {r.details && <div className="text-xs text-zinc-500 mt-1 max-w-lg">{r.details}</div>}
                        <div className="text-[10px] text-zinc-600 mt-2">{new Date(r.createdAt).toLocaleString()} • From: {r.reporterContact || 'Anonymous'}</div>
                      </TableCell>
                      <TableCell className="text-right align-top w-[200px]">
                        {r.status === 'open' ? (
                          <div className="flex justify-end gap-2">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-7 text-xs bg-emerald-950 border-emerald-900 text-emerald-400 hover:bg-emerald-900 hover:text-emerald-300"
                              onClick={() => handleUpdate(r.id, 'reviewed')}
                              disabled={updateReport.isPending}
                            >
                              <CheckCircle className="w-3 h-3 mr-1.5" /> Reviewed
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-7 text-xs bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                              onClick={() => handleUpdate(r.id, 'dismissed')}
                              disabled={updateReport.isPending}
                            >
                              <XCircle className="w-3 h-3 mr-1.5" /> Dismiss
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-zinc-500 capitalize">{r.status}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useAdminListReports, getAdminListReportsQueryKey, useAdminUpdateReport } from "@workspace/api-client-react";
import { CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export function AdminReportsTab() {
  const { data: reportsGrouped, isLoading } = useAdminListReports();
  const updateReport = useAdminUpdateReport();
  const queryClient  = useQueryClient();
  const { toast }    = useToast();

  const handleUpdate = (id: string, status: string) => {
    updateReport.mutate({ id, data: { status } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListReportsQueryKey() });
        toast({ title: `Report marked as ${status}` });
      },
    });
  };

  if (isLoading) return <div className="py-16 text-center text-gray-400 text-sm">Loading reports…</div>;

  if (!reportsGrouped?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 border border-dashed border-gray-200 rounded-xl text-center">
        <CheckCircle className="h-8 w-8 text-emerald-400 mb-3" />
        <p className="text-gray-500 text-sm font-medium">No open reports</p>
        <p className="text-gray-400 text-xs mt-1">All businesses are clear of abuse reports.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {reportsGrouped.map((group) => (
        <div key={group.business?.id} className="border border-gray-200 rounded-xl overflow-hidden">
          {/* Group header */}
          <div className="flex items-center justify-between bg-gray-50 border-b border-gray-200 px-4 py-3">
            <div>
              <div className="font-semibold text-gray-900 text-sm">{group.business?.name}</div>
              <div className="text-xs text-gray-500">{group.business?.phone}</div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 text-rose-700 text-xs font-semibold px-2.5 py-0.5">
              <AlertTriangle className="h-3 w-3" /> {group.openCount} Open
            </span>
          </div>

          {/* Reports */}
          <div className="divide-y divide-gray-100">
            {group.reports.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-4 px-4 py-4">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-800 text-sm">{r.reason}</div>
                  {r.details && <div className="text-xs text-gray-500 mt-1 leading-relaxed">{r.details}</div>}
                  <div className="text-[11px] text-gray-400 mt-2">
                    {new Date(r.createdAt).toLocaleString()} · From: {r.reporterContact || "Anonymous"}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  {r.status === "open" ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUpdate(r.id, "reviewed")}
                        disabled={updateReport.isPending}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-50"
                      >
                        <CheckCircle className="h-3.5 w-3.5" /> Reviewed
                      </button>
                      <button
                        onClick={() => handleUpdate(r.id, "dismissed")}
                        disabled={updateReport.isPending}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
                      >
                        <XCircle className="h-3.5 w-3.5" /> Dismiss
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400 capitalize">{r.status}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

import { useAdminGetStats, getAdminGetStatsQueryKey } from "@workspace/api-client-react";
import { Building, PlayCircle, Ban, Banknote, CalendarDays, AlertCircle, Smartphone } from "lucide-react";

export function AdminOverviewTab() {
  const { data: stats, isLoading } = useAdminGetStats();

  if (isLoading) return <div className="p-12 text-center text-zinc-500">Loading platform metrics...</div>;

  const MetricCard = ({ title, value, icon: Icon, subtext, colorClass }: any) => (
    <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 shadow-sm flex flex-col gap-2 relative overflow-hidden group">
      <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${colorClass} opacity-10 rounded-full blur-2xl -mr-6 -mt-6 transition-opacity group-hover:opacity-20`} />
      <div className="flex justify-between items-start">
        <h3 className="text-sm font-medium text-zinc-400">{title}</h3>
        <Icon className={`w-4 h-4 text-zinc-500`} />
      </div>
      <div className="text-3xl font-bold text-zinc-100 tracking-tight">{value}</div>
      {subtext && <div className="text-xs text-zinc-500 font-medium">{subtext}</div>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">Platform Overview</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard 
          title="Total Businesses" 
          value={stats?.totalBusinesses || 0} 
          icon={Building} 
          colorClass="from-blue-500 to-cyan-500"
        />
        <MetricCard 
          title="Active Subscriptions" 
          value={stats?.activeBusinesses || 0} 
          icon={PlayCircle} 
          colorClass="from-green-500 to-emerald-500"
        />
        <MetricCard 
          title="Trialing Accounts" 
          value={stats?.trialingBusinesses || 0} 
          icon={CalendarDays} 
          colorClass="from-yellow-500 to-orange-500"
        />
        <MetricCard 
          title="Suspended" 
          value={stats?.suspendedBusinesses || 0} 
          icon={Ban} 
          colorClass="from-red-500 to-rose-500"
        />
        
        <MetricCard 
          title="Total Revenue" 
          value={`KES ${(stats?.totalRevenue || 0).toLocaleString()}`} 
          icon={Banknote} 
          colorClass="from-green-600 to-emerald-600"
        />
        <MetricCard 
          title="Revenue This Month" 
          value={`KES ${(stats?.revenueThisMonth || 0).toLocaleString()}`} 
          icon={Banknote} 
          colorClass="from-green-400 to-emerald-400"
        />
        <MetricCard 
          title="WhatsApp Connected" 
          value={stats?.whatsappConnected || 0} 
          icon={Smartphone} 
          subtext={`${((stats?.whatsappConnected || 0) / (stats?.totalBusinesses || 1) * 100).toFixed(0)}% setup rate`}
          colorClass="from-green-500 to-teal-500"
        />
        <MetricCard 
          title="Open Reports" 
          value={stats?.openReports || 0} 
          icon={AlertCircle} 
          colorClass="from-red-500 to-orange-500"
        />
      </div>
    </div>
  );
}

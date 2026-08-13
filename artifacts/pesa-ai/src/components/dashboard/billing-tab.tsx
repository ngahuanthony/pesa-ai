import { useGetMe, useGetSubscription, getGetSubscriptionQueryKey, useChangeSubscriptionPlan, useChargeSubscription } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, CheckCircle2, Zap } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";

export function BillingTab() {
  const { data: me } = useGetMe();
  const businessId = me?.business?.id || "";
  
  const { data: sub, isLoading } = useGetSubscription(businessId, { query: { enabled: !!businessId, queryKey: getGetSubscriptionQueryKey(businessId) } });
  
  const changePlan = useChangeSubscriptionPlan();
  const charge = useChargeSubscription();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [phone, setPhone] = useState(me?.business?.phone || "");

  const handlePlanChange = (plan: string) => {
    changePlan.mutate({ businessId, data: { plan } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSubscriptionQueryKey(businessId) });
        toast({ title: `Switched to ${plan} plan` });
      }
    });
  };

  const handleCharge = () => {
    charge.mutate({ businessId, data: { phone } }, {
      onSuccess: () => {
        toast({ title: "M-Pesa payment prompt sent to your phone" });
      }
    });
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading billing...</div>;

  return (
    <div className="space-y-8">
      <div className="grid gap-6 md:grid-cols-[1fr_300px]">
        
        {/* Current Plan Overview */}
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold">Billing & Plan</h2>
            <p className="text-sm text-muted-foreground">Manage your subscription and payments.</p>
          </div>

          <Card className="border-primary/20 bg-primary/5 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-2xl flex items-center gap-2">
                    {sub?.plan} Plan
                    <Badge variant={sub?.status === 'active' ? 'default' : 'secondary'} className="ml-2 capitalize">
                      {sub?.status}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="mt-1">
                    KES {sub?.priceKES.toLocaleString()} / month
                  </CardDescription>
                </div>
                <div className="bg-primary/20 p-3 rounded-full text-primary">
                  <Zap className="w-6 h-6" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm">
                Next billing date: <strong>{new Date(sub?.currentPeriodEnd || "").toLocaleDateString()}</strong>
              </div>
              
              <div className="bg-background p-4 rounded-xl border border-border flex flex-col gap-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <CreditCard className="w-4 h-4" /> Pay via M-Pesa
                </h4>
                <div className="flex gap-2">
                  <Input 
                    placeholder="M-Pesa Phone (e.g. 2547...)" 
                    value={phone} 
                    onChange={(e) => setPhone(e.target.value)}
                    className="flex-1"
                  />
                  <Button onClick={handleCharge} disabled={charge.isPending}>
                    {charge.isPending ? "Sending..." : "Pay Now"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Upgrade Path */}
        <div className="space-y-4 pt-12 md:pt-0">
          <h3 className="text-lg font-bold">Available Plans</h3>
          <div className="space-y-4">
            
            <div className={`p-4 rounded-xl border ${sub?.plan === 'Starter' ? 'border-primary shadow-sm bg-background' : 'border-border bg-muted/20 opacity-75'} flex flex-col gap-3 transition-all`}>
              <div className="flex justify-between items-center">
                <div className="font-bold">Starter</div>
                <div className="text-sm font-medium">KES 2,999</div>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Basic AI responses</li>
                <li>• 50 products max</li>
              </ul>
              {sub?.plan !== 'Starter' && (
                <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => handlePlanChange('Starter')}>
                  Downgrade
                </Button>
              )}
            </div>

            <div className={`p-4 rounded-xl border ${sub?.plan === 'Business' ? 'border-primary shadow-sm bg-background' : 'border-border bg-muted/20'} flex flex-col gap-3 transition-all`}>
              <div className="flex justify-between items-center">
                <div className="font-bold text-primary">Business</div>
                <div className="text-sm font-medium">KES 4,999</div>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• M-Pesa automated prompts</li>
                <li>• 500 products max</li>
                <li>• Basic analytics</li>
              </ul>
              {sub?.plan !== 'Business' && (
                <Button size="sm" className="w-full mt-2" onClick={() => handlePlanChange('Business')}>
                  {sub?.plan === 'Starter' ? 'Upgrade' : 'Switch'}
                </Button>
              )}
            </div>

            <div className={`p-4 rounded-xl border ${sub?.plan === 'Pro' ? 'border-primary shadow-sm bg-background' : 'border-border bg-muted/20'} flex flex-col gap-3 transition-all`}>
              <div className="flex justify-between items-center">
                <div className="font-bold">Pro</div>
                <div className="text-sm font-medium">KES 9,999</div>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Unlimited products</li>
                <li>• Advanced Analytics</li>
              </ul>
              {sub?.plan !== 'Pro' && (
                <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => handlePlanChange('Pro')}>
                  Upgrade
                </Button>
              )}
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}

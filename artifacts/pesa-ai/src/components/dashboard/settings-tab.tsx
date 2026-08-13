import { useGetMe, useUpdateBusiness, getGetMeQueryKey, useConnectMpesa, useDisconnectMpesa, useGetMpesaStatus, getGetMpesaStatusQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ExternalLink, CheckCircle2, AlertCircle, Copy, Link as LinkIcon, Unlink } from "lucide-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const mpesaSchema = z.object({
  consumerKey: z.string().min(1, "Consumer Key required"),
  consumerSecret: z.string().min(1, "Consumer Secret required"),
  passkey: z.string().min(1, "Passkey required"),
  shortcode: z.string().min(1, "Shortcode required"),
});

export function SettingsTab() {
  const { data: me } = useGetMe();
  const business = me?.business;
  const businessId = business?.id || "";
  
  const [phoneId, setPhoneId] = useState("");
  const updateBiz = useUpdateBusiness();
  const connectMpesa = useConnectMpesa();
  const disconnectMpesa = useDisconnectMpesa();
  
  const { data: mpesaStatus, isLoading: isMpesaLoading } = useGetMpesaStatus(businessId, { query: { enabled: !!businessId, queryKey: getGetMpesaStatusQueryKey(businessId) } });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const initRef = useRef<string | null>(null);

  useEffect(() => {
    if (business && initRef.current !== business.id) {
      setPhoneId(business.whatsappPhoneNumberId || "");
      initRef.current = business.id;
    }
  }, [business]);

  const form = useForm<z.infer<typeof mpesaSchema>>({
    resolver: zodResolver(mpesaSchema),
    defaultValues: {
      consumerKey: "",
      consumerSecret: "",
      passkey: "",
      shortcode: "",
    }
  });

  const handleSaveWhatsApp = () => {
    updateBiz.mutate({ id: businessId, data: { whatsappPhoneNumberId: phoneId } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        toast({ title: "WhatsApp settings saved!" });
      }
    });
  };

  const onConnectMpesa = (data: z.infer<typeof mpesaSchema>) => {
    connectMpesa.mutate({ businessId, data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMpesaStatusQueryKey(businessId) });
        form.reset();
        toast({ title: "M-Pesa connected successfully" });
      }
    });
  };

  const handleDisconnectMpesa = () => {
    if(confirm("Disconnect M-Pesa? Automated payments will stop working.")) {
      disconnectMpesa.mutate({ businessId }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMpesaStatusQueryKey(businessId) });
          toast({ title: "M-Pesa disconnected" });
        }
      });
    }
  };

  const webhookUrl = `${window.location.origin}/webhook/whatsapp`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast({ title: "Webhook URL copied!" });
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h2 className="text-xl font-bold">Settings</h2>
        <p className="text-sm text-muted-foreground">Connect your AI to WhatsApp and configure M-Pesa.</p>
      </div>

      <div className="grid gap-6">
        
        {/* WhatsApp Connect */}
        <Card className="border-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">WhatsApp Cloud API Connection</CardTitle>
                <CardDescription>Connect Pesa AI to your WhatsApp Business number.</CardDescription>
              </div>
              {business?.whatsappPhoneNumberId ? (
                <div className="flex items-center text-sm font-medium text-primary bg-primary/10 px-3 py-1 rounded-full">
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Connected
                </div>
              ) : (
                <div className="flex items-center text-sm font-medium text-muted-foreground bg-muted px-3 py-1 rounded-full">
                  <AlertCircle className="w-4 h-4 mr-2" /> Not connected
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            
            <div className="grid md:grid-cols-3 gap-4">
              <div className="border rounded-xl p-4 bg-background shadow-sm text-sm space-y-2">
                <div className="font-bold text-primary flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 mb-2">1</div>
                <h4 className="font-semibold">Create Meta App</h4>
                <p className="text-muted-foreground text-xs">Go to Meta Developers, create a WhatsApp app.</p>
                <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="text-primary hover:underline text-xs flex items-center mt-2">
                  Meta Developers <ExternalLink className="w-3 h-3 ml-1" />
                </a>
              </div>
              
              <div className="border rounded-xl p-4 bg-background shadow-sm text-sm space-y-2">
                <div className="font-bold text-primary flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 mb-2">2</div>
                <h4 className="font-semibold">Get Phone Number ID</h4>
                <p className="text-muted-foreground text-xs">Find this in your Meta app's WhatsApp setup page.</p>
              </div>
              
              <div className="border rounded-xl p-4 bg-background shadow-sm text-sm space-y-2">
                <div className="font-bold text-primary flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 mb-2">3</div>
                <h4 className="font-semibold">Set Webhook URL</h4>
                <p className="text-muted-foreground text-xs">Paste the webhook URL below into Meta to route messages here.</p>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t">
              <div className="space-y-2">
                <label className="text-sm font-semibold">WhatsApp Phone Number ID</label>
                <Input 
                  placeholder="e.g. 1029384756..." 
                  value={phoneId} 
                  onChange={(e) => setPhoneId(e.target.value)} 
                />
              </div>
              
              <Button onClick={handleSaveWhatsApp} disabled={updateBiz.isPending} className="w-full sm:w-auto text-primary-foreground">
                {updateBiz.isPending ? "Saving..." : "Save WhatsApp Settings"}
              </Button>
            </div>

            {business?.whatsappPhoneNumberId && (
              <div className="mt-6 p-4 bg-muted/40 rounded-xl border space-y-2">
                <label className="text-sm font-semibold">Your Webhook URL (Paste this in Meta)</label>
                <div className="flex gap-2">
                  <Input readOnly value={webhookUrl} className="bg-background text-muted-foreground font-mono text-xs" />
                  <Button variant="outline" size="icon" onClick={copyToClipboard} title="Copy Webhook URL">
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Webhook Verify Token: <strong>pesa-ai-token</strong></p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* M-Pesa Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">M-Pesa Integration</CardTitle>
                <CardDescription>Configure Daraja API to push automated payment prompts.</CardDescription>
              </div>
              {!isMpesaLoading && mpesaStatus?.connected && (
                <div className="flex items-center text-sm font-medium text-primary bg-primary/10 px-3 py-1 rounded-full">
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Connected ({mpesaStatus.shortcodeMasked})
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {me?.subscription?.plan === 'Starter' ? (
              <div className="p-6 bg-muted/30 border border-dashed rounded-xl text-center">
                <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
                  <AlertCircle className="w-6 h-6 text-muted-foreground" />
                </div>
                <h4 className="font-semibold mb-1">M-Pesa Automation is Locked</h4>
                <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                  Upgrade to Business or Pro plan to automatically trigger STK pushes to customers in WhatsApp.
                </p>
              </div>
            ) : (
              <div className="p-6 bg-card border rounded-xl">
                {!isMpesaLoading && mpesaStatus?.connected ? (
                  <div className="flex flex-col items-start gap-4">
                    <p className="text-sm text-muted-foreground">
                      M-Pesa is currently connected. Your AI will automatically trigger STK pushes when closing a sale.
                    </p>
                    <Button variant="destructive" onClick={handleDisconnectMpesa} disabled={disconnectMpesa.isPending}>
                      <Unlink className="w-4 h-4 mr-2" /> Disconnect M-Pesa
                    </Button>
                  </div>
                ) : (
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onConnectMpesa)} className="space-y-4">
                      <div className="grid md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="consumerKey"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Consumer Key</FormLabel>
                              <FormControl><Input {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="consumerSecret"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Consumer Secret</FormLabel>
                              <FormControl><Input type="password" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="shortcode"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Paybill / Till Shortcode</FormLabel>
                              <FormControl><Input {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="passkey"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Passkey</FormLabel>
                              <FormControl><Input type="password" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <Button type="submit" disabled={connectMpesa.isPending}>
                        <LinkIcon className="w-4 h-4 mr-2" /> Connect M-Pesa Daraja
                      </Button>
                    </form>
                  </Form>
                )}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}

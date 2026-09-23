import { BrainCircuit, Map, Upload, FileText, Check, AlertTriangle, Plus, X, Pencil, Trash2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useGetMe, useListProducts, getListProductsQueryKey } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  useGetKnowledge,
  useCreateKnowledge,
  useUpdateKnowledge,
  useDeleteKnowledge,
  useExtractKnowledge,
  useGetServiceLocations,
  useCreateServiceLocation,
  useUpdateServiceLocation,
  useDeleteServiceLocation,
  KnowledgeItem,
  ServiceLocation
} from "@/hooks/use-intelligence";
import QRCode from "qrcode";
import { BRAND_NAME } from "@/constants/brand";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

function ReadinessAlert({ business }: { business: any }) {
  const missing = [];
  
  if (!business.whatsappPhoneNumberId) {
    missing.push("WhatsApp number not connected");
  }
  if (!business.paymentMethod) {
    missing.push("Payment method not set");
  }
  
  if (missing.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <Check className="h-5 w-5 text-emerald-600 flex-shrink-0" />
        <div>
          <h4 className="text-sm font-semibold text-emerald-800">Basic Configuration Complete</h4>
          <p className="text-xs text-emerald-600 mt-0.5">Your fundamental settings are configured.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
      <div>
        <h4 className="text-sm font-semibold text-amber-800">Configuration Checks</h4>
        <p className="text-xs text-amber-600 mt-0.5 mb-2">Complete these standard setup steps:</p>
        <ul className="list-disc pl-4 text-xs text-amber-700 space-y-1">
          {missing.map((m, i) => <li key={i}>{m}</li>)}
        </ul>
      </div>
    </div>
  );
}

function LocationQRCard({ location, businessName, whatsappConnected }: { location: ServiceLocation; businessName: string; whatsappConnected: boolean }) {
  const [ready, setReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Example WhatsApp text: location={token}
  const publicUrl = location.publicToken ? `${window.location.origin}/l/${location.publicToken}` : "";

  useEffect(() => {
    if (!canvasRef.current || !publicUrl) return;
    setReady(false);
    
    const buildQR = async () => {
      try {
        const qrDataUrl = await QRCode.toDataURL(publicUrl, {
          width: 600,
          margin: 2,
          color: { dark: "#111111", light: "#ffffff" },
        });

        const qrImg = new Image();
        qrImg.src = qrDataUrl;
        await new Promise<void>((res) => { qrImg.onload = () => res(); });

        const canvas = canvasRef.current!;
        canvas.width = 800;
        canvas.height = 1000;
        const ctx = canvas.getContext("2d")!;

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, 800, 1000);

        ctx.fillStyle = "#25D366";
        ctx.fillRect(0, 0, 800, 160);

        ctx.font = "bold 48px Arial";
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(businessName.toUpperCase(), 400, 80);

        ctx.drawImage(qrImg, 100, 220, 600, 600);

        ctx.font = "bold 40px Arial";
        ctx.fillStyle = "#111827";
        ctx.fillText(location.label, 400, 880);
        
        ctx.font = "28px Arial";
        ctx.fillStyle = "#6b7280";
        ctx.fillText(`Scan to order to ${location.label}`, 400, 940);

        ctx.strokeStyle = "#e5e7eb";
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, 796, 996);
        setReady(true);
      } catch (err) {
        console.error("QR gen error", err);
      }
    };
    buildQR();
  }, [publicUrl, businessName, location.label]);

  const downloadQR = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `${businessName.replace(/\s+/g, "-")}-${location.label.replace(/\s+/g, "-")}-QR.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

  return (
    <DialogContent className="sm:max-w-[460px]">
      <DialogHeader>
        <DialogTitle>QR Code for {location.label}</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col items-center gap-4 py-4">
        <canvas ref={canvasRef} className="max-w-[280px] rounded-xl shadow-sm border border-border" style={{ opacity: ready ? 1 : 0 }} />
        {whatsappConnected ? (
          <button
            onClick={downloadQR}
            disabled={!ready}
            className="inline-flex h-10 w-full max-w-[280px] items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            Download Print-Ready QR
          </button>
        ) : (
          <div className="text-center p-3 bg-amber-50 border border-amber-200 rounded-lg max-w-[280px]">
            <p className="text-xs text-amber-800 font-medium">Connect WhatsApp in Settings to print QR codes.</p>
          </div>
        )}
      </div>
    </DialogContent>
  );
}

export function BusinessIntelligenceTab() {
  const { data: me } = useGetMe();
  const business = (me as any)?.business;
  const businessId = business?.id || "";
  const businessName = business?.name || BRAND_NAME;

  const { toast } = useToast();
  
  // Knowledge
  const { data: knowledge, isLoading: knowledgeLoading } = useGetKnowledge(businessId);
  const { data: products } = useListProducts(businessId, { query: { enabled: !!businessId, queryKey: getListProductsQueryKey(businessId) } });
  const createKnowledge = useCreateKnowledge();
  const updateKnowledge = useUpdateKnowledge();
  const deleteKnowledge = useDeleteKnowledge();
  const extractKnowledge = useExtractKnowledge();

  const [activeTab, setActiveTab] = useState("knowledge");
  const [knowledgeDialogOpen, setKnowledgeDialogOpen] = useState(false);
  const [editingKnowledge, setEditingKnowledge] = useState<KnowledgeItem | null>(null);
  const [kTitle, setKTitle] = useState("");
  const [kCategory, setKCategory] = useState("general");
  const [kText, setKText] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [extractionPreview, setExtractionPreview] = useState<{ text: string, fileName: string } | null>(null);
  
  const resetKnowledgeForm = () => {
    setEditingKnowledge(null);
    setKTitle("");
    setKCategory("general");
    setKText("");
    setExtractionPreview(null);
  };

  const handleKnowledgeSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!kTitle.trim() || !kText.trim()) return;

    if (editingKnowledge) {
      updateKnowledge.mutate({
        businessId,
        entryId: editingKnowledge.id,
        data: { title: kTitle, category: kCategory, text: kText }
      }, {
        onSuccess: () => {
          toast({ title: "Knowledge updated" });
          setKnowledgeDialogOpen(false);
        }
      });
    } else {
      createKnowledge.mutate({
        businessId,
        data: { title: kTitle, category: kCategory, text: kText, source: extractionPreview?.fileName || "manual" }
      }, {
        onSuccess: () => {
          toast({ title: "Knowledge added" });
          setKnowledgeDialogOpen(false);
        }
      });
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = (event.target?.result as string).split(",")[1];
      try {
        const result = await extractKnowledge.mutateAsync({
          businessId,
          data: { fileName: file.name, mimeType: file.type, base64 }
        });
        
        setKText(result.text);
        setKTitle(result.fileName.split(".")[0] || "Extracted Document");
        setExtractionPreview({ text: result.text, fileName: result.fileName });
        if (result.warnings?.length) {
          toast({ title: "Extraction Warnings", description: result.warnings.join(", ") });
        } else {
          toast({ title: "Extraction successful", description: "Please review and save." });
        }
      } catch (err: any) {
        toast({ title: "Extraction failed", description: err.message, variant: "destructive" });
      }
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Service Locations
  const { data: locations, isLoading: locationsLoading } = useGetServiceLocations(businessId);
  const createLocation = useCreateServiceLocation();
  const updateLocation = useUpdateServiceLocation();
  const deleteLocation = useDeleteServiceLocation();
  
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<ServiceLocation | null>(null);
  const [locLabel, setLocLabel] = useState("");
  const [locKind, setLocKind] = useState("table");
  const [locActive, setLocActive] = useState(true);
  
  const [qrLocation, setQrLocation] = useState<ServiceLocation | null>(null);

  const resetLocationForm = () => {
    setEditingLocation(null);
    setLocLabel("");
    setLocKind("table");
    setLocActive(true);
  };

  const handleLocationSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!locLabel.trim()) return;

    if (editingLocation) {
      updateLocation.mutate({
        businessId,
        locationId: editingLocation.id,
        data: { label: locLabel, kind: locKind, active: locActive }
      }, {
        onSuccess: () => {
          toast({ title: "Location updated" });
          setLocationDialogOpen(false);
        }
      });
    } else {
      createLocation.mutate({
        businessId,
        data: { label: locLabel, kind: locKind, active: locActive }
      }, {
        onSuccess: () => {
          toast({ title: "Location added" });
          setLocationDialogOpen(false);
        }
      });
    }
  };

  return (
    <div className="space-y-6">
      
      {business && <ReadinessAlert business={business} />}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4 flex-wrap h-auto p-1 bg-muted/50 w-full justify-start overflow-x-auto overflow-y-hidden">
          <TabsTrigger value="knowledge" className="gap-2 shrink-0"><BrainCircuit className="h-4 w-4" /> Knowledge Base</TabsTrigger>
          <TabsTrigger value="locations" className="gap-2 shrink-0"><Map className="h-4 w-4" /> Service Locations</TabsTrigger>
        </TabsList>

        <TabsContent value="knowledge" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Add approved references to inform your assistant's responses.</p>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <input type="file" ref={fileInputRef} className="hidden" accept=".txt,.pdf,.docx" onChange={handleFileChange} />
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={extractKnowledge.isPending}
                className="inline-flex h-9 flex-1 sm:flex-none items-center justify-center gap-2 rounded-lg border border-input bg-background px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
              >
                <Upload className="h-4 w-4" /> {extractKnowledge.isPending ? "Extracting..." : "Upload File"}
              </button>
              <button 
                onClick={() => { resetKnowledgeForm(); setKnowledgeDialogOpen(true); }}
                className="inline-flex h-9 flex-1 sm:flex-none items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" /> Add Manual
              </button>
            </div>
          </div>

          <div className="border border-border rounded-xl overflow-hidden bg-white">
            {knowledgeLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Loading knowledge...</div>
            ) : knowledge?.length === 0 ? (
              <div className="p-12 flex flex-col items-center justify-center text-center">
                <FileText className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <h3 className="font-semibold text-foreground">No knowledge added</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">Upload brochures, menus, or FAQs as approved references for your assistant.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {knowledge?.map((item) => (
                  <div key={item.id} className="p-4 flex items-start justify-between gap-4 hover:bg-muted/30 transition-colors">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-foreground">{item.title}</span>
                        <span className="px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] uppercase font-bold tracking-wider">{item.category}</span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{item.text}</p>
                      {item.source && <p className="text-[10px] text-muted-foreground mt-2">Source: {item.source}</p>}
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button 
                        onClick={() => {
                          setEditingKnowledge(item);
                          setKTitle(item.title);
                          setKCategory(item.category);
                          setKText(item.text);
                          setKnowledgeDialogOpen(true);
                        }}
                        className="p-1.5 text-muted-foreground hover:bg-muted rounded-md"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => { if(confirm("Delete this entry?")) deleteKnowledge.mutate({ businessId, entryId: item.id }); }}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-md"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="locations" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Manage QR locations like tables or rooms for direct ordering.</p>
            <button 
              onClick={() => { resetLocationForm(); setLocationDialogOpen(true); }}
              className="inline-flex h-9 w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" /> Add Location
            </button>
          </div>

          <div className="border border-border rounded-xl overflow-hidden bg-white">
            {locationsLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Loading locations...</div>
            ) : locations?.length === 0 ? (
              <div className="p-12 flex flex-col items-center justify-center text-center">
                <Map className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <h3 className="font-semibold text-foreground">No service locations</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">Add tables, rooms, or service points to generate order QR codes.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {locations?.map((loc) => (
                  <div key={loc.id} className="p-4 flex items-center justify-between gap-4 hover:bg-muted/30 transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-foreground">{loc.label}</span>
                        {!loc.active && <span className="px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-700 text-[10px] uppercase font-bold">Inactive</span>}
                        <span className="px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground text-[10px] uppercase font-bold">{loc.kind}</span>
                      </div>
                      {loc.publicToken && <p className="text-[10px] font-mono text-muted-foreground mt-1">Ref: {loc.publicToken.substring(0, 8)}</p>}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button 
                        onClick={() => setQrLocation(loc)}
                        className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-muted transition-colors"
                      >
                        View QR
                      </button>
                      <button 
                        onClick={() => {
                          setEditingLocation(loc);
                          setLocLabel(loc.label);
                          setLocKind(loc.kind);
                          setLocActive(loc.active);
                          setLocationDialogOpen(true);
                        }}
                        className="p-1.5 text-muted-foreground hover:bg-muted rounded-md"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => { if(confirm("Delete this location?")) deleteLocation.mutate({ businessId, locationId: loc.id }); }}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-md"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Knowledge Dialog */}
      <Dialog open={knowledgeDialogOpen || !!extractionPreview} onOpenChange={(open) => {
        if (!open) { setKnowledgeDialogOpen(false); setExtractionPreview(null); }
      }}>
        <DialogContent className="sm:max-w-[600px] flex flex-col max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>{extractionPreview ? "Review Extracted Knowledge" : (editingKnowledge ? "Edit Knowledge" : "Add Knowledge")}</DialogTitle>
          </DialogHeader>
          <form id="knowledge-form" onSubmit={handleKnowledgeSave} className="space-y-4 py-2 flex-1 overflow-y-auto">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Title</label>
              <Input value={kTitle} onChange={(e) => setKTitle(e.target.value)} placeholder="e.g. Return Policy, Dinner Menu" required />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Category</label>
              <Select value={kCategory} onValueChange={setKCategory}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="menu">Menu / Food</SelectItem>
                  <SelectItem value="policy">Policies</SelectItem>
                  <SelectItem value="faq">FAQ</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 flex flex-col flex-1">
              <label className="text-sm font-medium">Content / Details</label>
              <textarea 
                required
                value={kText} 
                onChange={(e) => setKText(e.target.value)} 
                className="flex-1 min-h-[200px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" 
                placeholder="The text your AI assistant should know..."
              />
            </div>
            {extractionPreview && (
              <p className="text-xs text-muted-foreground">Source: {extractionPreview.fileName}</p>
            )}
          </form>
          <DialogFooter>
            <button 
              type="button" 
              onClick={() => { setKnowledgeDialogOpen(false); setExtractionPreview(null); }}
              className="px-4 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-muted"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              form="knowledge-form"
              disabled={createKnowledge.isPending || updateKnowledge.isPending}
              className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
            >
              {createKnowledge.isPending || updateKnowledge.isPending ? "Saving..." : "Save Knowledge"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Location Dialog */}
      <Dialog open={locationDialogOpen} onOpenChange={setLocationDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editingLocation ? "Edit Location" : "Add Service Location"}</DialogTitle>
          </DialogHeader>
          <form id="location-form" onSubmit={handleLocationSave} className="space-y-4 py-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Label</label>
              <Input value={locLabel} onChange={(e) => setLocLabel(e.target.value)} placeholder="e.g. Table 5, Room 204" required />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Location Type</label>
              <Select value={locKind} onValueChange={setLocKind}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="table">Table</SelectItem>
                  <SelectItem value="room">Room</SelectItem>
                  <SelectItem value="seat">Seat</SelectItem>
                  <SelectItem value="bar">Bar</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between pt-2">
              <label className="text-sm font-medium">Active Status</label>
              <button 
                type="button" 
                onClick={() => setLocActive(!locActive)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${locActive ? 'bg-primary' : 'bg-input'}`}
              >
                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-sm ring-0 transition-transform ${locActive ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
          </form>
          <DialogFooter>
            <button 
              type="submit" 
              form="location-form"
              disabled={createLocation.isPending || updateLocation.isPending}
              className="w-full px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
            >
              {createLocation.isPending || updateLocation.isPending ? "Saving..." : "Save Location"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={!!qrLocation} onOpenChange={(open) => !open && setQrLocation(null)}>
        {qrLocation && <LocationQRCard location={qrLocation} businessName={businessName} whatsappConnected={!!business?.whatsappPhoneNumberId} />}
      </Dialog>
    </div>
  );
}

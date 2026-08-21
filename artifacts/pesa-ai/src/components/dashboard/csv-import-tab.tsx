import { useState, useCallback } from "react";
import { useGetMe, getListProductsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  Upload, FileSpreadsheet, ArrowLeft,
  CheckCircle2, AlertCircle, X,
} from "lucide-react";

type ColMap = { name: string | null; price: string | null; stockQty: string | null; description: string | null };
type Phase  = "idle" | "preview" | "importing" | "done";

const NAME_HEADERS  = ["name","product","product name","item","item name","product_name","productname","sku name","title"];
const PRICE_HEADERS = ["price","cost","amount","ksh","price (ksh)","unit price","unitprice","selling price","rate"];
const STOCK_HEADERS = ["stock","qty","quantity","stock qty","stockqty","units","stock_qty","in stock","available","balance"];
const DESC_HEADERS  = ["description","desc","details","notes","note","about","summary"];

function detectCol(headers: string[], candidates: string[]): string | null {
  const normalized = headers.map(h => h.toLowerCase().trim());
  for (const c of candidates) {
    const idx = normalized.indexOf(c);
    if (idx !== -1) return headers[idx];
  }
  return null;
}

function parsePrice(val: string | number): number {
  return parseFloat(String(val).replace(/[^0-9.]/g, "")) || 0;
}
function parseQty(val: string | number): number {
  return parseInt(String(val).replace(/[^0-9]/g, ""), 10) || 0;
}

export function CsvImportTab() {
  const { data: me } = useGetMe();
  const businessId   = (me as any)?.business?.id || "";
  const qc           = useQueryClient();
  const { toast }    = useToast();

  const [phase,      setPhase]      = useState<Phase>("idle");
  const [headers,    setHeaders]    = useState<string[]>([]);
  const [rows,       setRows]       = useState<Record<string, string>[]>([]);
  const [colMap,     setColMap]     = useState<ColMap>({ name: null, price: null, stockQty: null, description: null });
  const [fileName,   setFileName]   = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [result,     setResult]     = useState<{ created: number; skipped: number } | null>(null);

  const processData = (data: Record<string, string>[], name: string) => {
    if (!data.length) {
      toast({ title: "Empty file", description: "The file has no data rows.", variant: "destructive" });
      return;
    }
    const hdrs = Object.keys(data[0]);
    setHeaders(hdrs);
    setRows(data as Record<string, string>[]);
    setColMap({
      name:        detectCol(hdrs, NAME_HEADERS),
      price:       detectCol(hdrs, PRICE_HEADERS),
      stockQty:    detectCol(hdrs, STOCK_HEADERS),
      description: detectCol(hdrs, DESC_HEADERS),
    });
    setFileName(name);
    setPhase("preview");
  };

  const parseFile = useCallback((file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "csv") {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => processData(res.data as Record<string, string>[], file.name),
        error: (err: { message: string }) => toast({ title: "Parse error", description: err.message, variant: "destructive" }),
      });
    } else if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const wb   = XLSX.read(e.target?.result, { type: "array" });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "", raw: false });
        processData(data, file.name);
      };
      reader.readAsArrayBuffer(file);
    } else {
      toast({ title: "Unsupported file", description: "Please upload a .csv, .xlsx, or .xls file.", variant: "destructive" });
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, [parseFile]);

  const reset = () => { setPhase("idle"); setRows([]); setHeaders([]); setResult(null); setFileName(""); };

  const validRows = rows.filter(r => {
    const n = colMap.name  ? (r[colMap.name]  || "").trim() : "";
    const p = colMap.price ? parsePrice(r[colMap.price]) : 0;
    return n && p > 0;
  });

  const handleImport = async () => {
    if (!colMap.name || !colMap.price) {
      toast({ title: "Map required columns", description: "Please select which column is the product name and which is the price.", variant: "destructive" });
      return;
    }
    setPhase("importing");
    const importRows = rows.map(r => ({
      name:        (r[colMap.name!] || "").trim(),
      price:       parsePrice(r[colMap.price!]),
      stockQty:    colMap.stockQty    ? parseQty(r[colMap.stockQty])      : 0,
      description: colMap.description ? (r[colMap.description] || "").trim() : "",
      source:      "csv",
    }));

    try {
      const res  = await fetch(`/api/businesses/${businessId}/products/import`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: importRows }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Import failed");
      const created = body.data?.created?.length ?? 0;
      const skipped = body.data?.skipped?.length ?? 0;
      setResult({ created, skipped });
      setPhase("done");
      qc.invalidateQueries({ queryKey: getListProductsQueryKey(businessId) });
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
      setPhase("preview");
    }
  };

  /* ── Done state ─────────────────────────────────────────────────────── */
  if (phase === "done" && result) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-4">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">
          {result.created} product{result.created !== 1 ? "s" : ""} imported!
        </h2>
        {result.skipped > 0 && (
          <p className="text-sm text-muted-foreground">
            {result.skipped} row{result.skipped !== 1 ? "s" : ""} skipped — missing name or price
          </p>
        )}
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link href="/dashboard/products"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90 transition-colors">
            View Products →
          </Link>
          <button onClick={reset}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted transition-colors">
            Import another file
          </button>
        </div>
      </div>
    );
  }

  /* ── Idle state ─────────────────────────────────────────────────────── */
  if (phase === "idle") {
    return (
      <div className="space-y-6">
        <Link href="/dashboard/products/add"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> All methods
        </Link>

        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={`border-2 border-dashed rounded-2xl p-14 text-center transition-colors ${
            isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
          }`}
        >
          <div className="mx-auto h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
            <FileSpreadsheet className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-foreground mb-1">Drop your spreadsheet here</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Supports CSV, Excel (.xlsx, .xls) · up to 2,000 products at once
          </p>
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90 transition-colors">
            <Upload className="h-4 w-4" /> Choose file
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f); e.target.value = ""; }}
            />
          </label>

          {/* Column guide */}
          <div className="mt-8 text-left max-w-xs mx-auto bg-muted/50 rounded-xl p-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
              Expected columns
            </p>
            {[
              ["Name", "required", "Product Name, Item, Title…"],
              ["Price", "required", "Price, Cost, KSh…"],
              ["Stock / Qty", "optional", "Stock, Qty, Units…"],
              ["Description", "optional", "Description, Notes…"],
            ].map(([col, note, hint]) => (
              <div key={col} className="flex items-start gap-3 mb-2 last:mb-0">
                <span className={`text-[10px] font-semibold mt-0.5 ${note === "required" ? "text-primary" : "text-muted-foreground"}`}>
                  {note.toUpperCase()}
                </span>
                <div>
                  <span className="text-xs font-medium text-foreground">{col}</span>
                  <span className="text-[10px] text-muted-foreground ml-1.5">{hint}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ── Preview / importing state ──────────────────────────────────────── */
  const previewCols = [colMap.name, colMap.price, colMap.stockQty, colMap.description].filter(Boolean) as string[];
  const previewRows = rows.slice(0, 8);

  return (
    <div className="space-y-5">
      <Link href="/dashboard/products/add"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" /> All methods
      </Link>

      {/* File header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{fileName}</span>
          <span className="text-xs text-muted-foreground">· {rows.length.toLocaleString()} rows</span>
        </div>
        <button
          onClick={reset}
          className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Column mapping */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
          Column Mapping
        </p>
        <div className="grid grid-cols-2 gap-3">
          {(["name", "price", "stockQty", "description"] as const).map((field) => (
            <div key={field} className="space-y-1">
              <label className="text-xs font-medium text-foreground">
                {field === "name" ? "Product Name *"
                  : field === "price" ? "Price *"
                  : field === "stockQty" ? "Stock / Qty"
                  : "Description"}
              </label>
              <select
                value={colMap[field] || ""}
                onChange={(e) => setColMap(prev => ({ ...prev, [field]: e.target.value || null }))}
                className="w-full h-8 rounded-lg border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">— skip —</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Preview table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-2.5 bg-muted/40 border-b border-border flex items-center justify-between">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Preview</span>
          <span className="text-xs text-muted-foreground">
            Showing {Math.min(8, rows.length)} of {rows.length.toLocaleString()} rows
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                {previewCols.map(col => (
                  <th key={col} className="px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, i) => (
                <tr key={i} className={i < previewRows.length - 1 ? "border-b border-border/50" : ""}>
                  {previewCols.map(col => (
                    <td key={col} className="px-3 py-2 text-foreground max-w-[180px] truncate">
                      {row[col]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        <div className="text-sm text-muted-foreground">
          {validRows.length < rows.length ? (
            <span className="flex items-center gap-1.5 text-amber-600 text-xs">
              <AlertCircle className="h-3.5 w-3.5" />
              {rows.length - validRows.length} row{rows.length - validRows.length !== 1 ? "s" : ""} will be skipped (missing name or price)
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              All {rows.length} rows look good
            </span>
          )}
        </div>
        <button
          onClick={handleImport}
          disabled={phase === "importing" || !colMap.name || !colMap.price || validRows.length === 0}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {phase === "importing"
            ? "Importing…"
            : `Import ${validRows.length.toLocaleString()} product${validRows.length !== 1 ? "s" : ""} →`}
        </button>
      </div>
    </div>
  );
}

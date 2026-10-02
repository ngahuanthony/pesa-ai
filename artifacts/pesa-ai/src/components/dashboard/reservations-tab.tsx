import {
  getListRoomReservationsQueryKey,
  useGetMe,
  useListRoomReservations,
  useUpdateRoomReservation,
} from "@workspace/api-client-react";
import { BedDouble, CalendarDays, Check, Clock3, CreditCard, RefreshCw, X } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

function statusStyle(status: string) {
  if (status === "CONFIRMED") return "bg-emerald-100 text-emerald-800";
  if (status === "DECLINED") return "bg-rose-100 text-rose-700";
  return "bg-amber-100 text-amber-800";
}

export function ReservationsTab() {
  const { data: me } = useGetMe();
  const businessId = (me as any)?.business?.id || "";
  const queryKey = getListRoomReservationsQueryKey(businessId);
  const { data, isLoading, isError, error, refetch, isFetching } = useListRoomReservations(businessId, {
    query: { enabled: !!businessId, queryKey, refetchInterval: 10000 },
  });
  const updateReservation = useUpdateRoomReservation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [rates, setRates] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [paymentRefs, setPaymentRefs] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const saveReservation = async (reservation: any, data: Record<string, unknown>, successTitle: string) => {
    setSavingId(reservation.id);
    try {
      await updateReservation.mutateAsync({
        businessId,
        reservationId: reservation.id,
        data: data as any,
      });
      await queryClient.invalidateQueries({ queryKey });
      toast({ title: successTitle });
    } catch (saveError: any) {
      toast({
        title: "Could not update reservation",
        description: saveError?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingId(null);
    }
  };

  const reservations = Array.isArray(data) ? data : [];
  const pendingCount = reservations.filter((item: any) => item.status === "PENDING").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Review each request against your room availability and rate before confirming it.
          </p>
          {!isLoading && !isError && (
            <p className="mt-1 text-xs font-medium text-amber-700">
              {pendingCount} pending {pendingCount === 1 ? "request" : "requests"}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="inline-flex h-9 items-center justify-center gap-2 self-start rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50 sm:self-auto"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-border p-10 text-center text-sm text-muted-foreground">
          Loading room requests…
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
          Could not load room requests. {(error as any)?.message || "Please refresh and try again."}
        </div>
      ) : reservations.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <BedDouble className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <h2 className="font-semibold">No room requests yet</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            New WhatsApp booking requests will appear here for reception to review.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reservations.map((reservation: any) => (
            <article key={reservation.id} className="rounded-xl border border-border bg-white p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{reservation.roomType}</h2>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusStyle(reservation.status)}`}>
                      {reservation.status}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">{reservation.reference}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium">{reservation.customerName || "Guest"}</p>
                  <p className="text-xs text-muted-foreground">{reservation.customerPhone}</p>
                </div>
                <div className="grid shrink-0 gap-1 text-sm sm:text-right">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground sm:justify-end">
                    <CalendarDays className="h-4 w-4" />
                    {formatDate(reservation.checkInDate)} – {formatDate(reservation.checkOutDate)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground sm:justify-end">
                    <BedDouble className="h-4 w-4" />
                    {reservation.guestCount} {reservation.guestCount === 1 ? "guest" : "guests"}
                  </span>
                </div>
              </div>

              {reservation.specialRequests && (
                <p className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                  <span className="font-medium">Guest request: </span>{reservation.specialRequests}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> Requested {new Date(reservation.createdAt).toLocaleString("en-KE")}</span>
                {reservation.quotedAmount !== null && reservation.quotedAmount !== undefined && (
                  <span className="font-semibold text-foreground">Rate: KSh {Number(reservation.quotedAmount).toLocaleString("en-KE")}</span>
                )}
                {reservation.paymentStatus && <span>Payment: {reservation.paymentStatus}</span>}
              </div>

              {reservation.staffNotes && (
                <p className="mt-2 text-xs text-muted-foreground">Reception note: {reservation.staffNotes}</p>
              )}

              {reservation.status === "PENDING" && (
                <div className="mt-4 grid gap-2 border-t border-border pt-4 sm:grid-cols-[minmax(150px,220px)_1fr_auto_auto] sm:items-end">
                  <p className="text-xs text-muted-foreground sm:col-span-4">
                    If WhatsApp messaging is active, confirming or declining sends the guest a message. Confirmation includes the quoted rate and saved public payment details; it does not collect payment.
                  </p>
                  <label className="text-xs font-medium text-muted-foreground">
                    Quoted rate (KSh)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={rates[reservation.id] ?? ""}
                      onChange={(event) => setRates((current) => ({ ...current, [reservation.id]: event.target.value }))}
                      placeholder="Enter verified rate"
                      className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </label>
                  <label className="text-xs font-medium text-muted-foreground">
                    Optional staff note
                    <input
                      value={notes[reservation.id] ?? ""}
                      onChange={(event) => setNotes((current) => ({ ...current, [reservation.id]: event.target.value }))}
                      maxLength={1000}
                      placeholder="Internal note"
                      className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={savingId === reservation.id || rates[reservation.id] === undefined || rates[reservation.id].trim() === "" || !Number.isFinite(Number(rates[reservation.id])) || Number(rates[reservation.id]) < 0}
                    onClick={() => void saveReservation(reservation, {
                      status: "CONFIRMED",
                      quotedAmount: Number(rates[reservation.id]),
                      ...(notes[reservation.id]?.trim() ? { staffNotes: notes[reservation.id].trim() } : {}),
                    }, "Reservation confirmed")}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" /> Confirm
                  </button>
                  <button
                    type="button"
                    disabled={savingId === reservation.id}
                    onClick={() => {
                      if (!window.confirm(`Decline room request ${reservation.reference}?`)) return;
                      void saveReservation(reservation, {
                        status: "DECLINED",
                        ...(notes[reservation.id]?.trim() ? { staffNotes: notes[reservation.id].trim() } : {}),
                      }, "Reservation declined");
                    }}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-rose-200 px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  >
                    <X className="h-4 w-4" /> Decline
                  </button>
                </div>
              )}

              {reservation.status === "CONFIRMED" && reservation.paymentStatus !== "PAID" && (
                <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-end">
                  <label className="max-w-sm flex-1 text-xs font-medium text-muted-foreground">
                    Payment reference (optional)
                    <input
                      value={paymentRefs[reservation.id] ?? ""}
                      onChange={(event) => setPaymentRefs((current) => ({ ...current, [reservation.id]: event.target.value }))}
                      maxLength={120}
                      placeholder="M-Pesa code or receipt reference"
                      className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={savingId === reservation.id}
                    onClick={() => void saveReservation(reservation, {
                      paymentStatus: "PAID",
                      ...(paymentRefs[reservation.id]?.trim() ? { paymentReference: paymentRefs[reservation.id].trim() } : {}),
                    }, "Payment marked received")}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50"
                  >
                    <CreditCard className="h-4 w-4" /> Mark payment received
                  </button>
                </div>
              )}

              {reservation.status === "DECLINED" && (
                <div className="mt-4 flex items-center gap-2 border-t border-border pt-4 text-xs font-medium text-rose-700">
                  <X className="h-4 w-4" /> This request was declined.
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
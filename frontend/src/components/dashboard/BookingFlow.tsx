import { useEffect, useState } from "react";
import { CalendarDays, Clock, CreditCard, Star } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { currency, type Booking, type Worker } from "@/lib/dashboard-data";
import { createBooking, getWorkerAvailability, type ApiAvailabilitySlot } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

type Props = {
  worker: Worker | null;
  serviceName: string;
  location: string;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
};

const formatDate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const today = formatDate(new Date());

export function BookingFlow({ worker, serviceName, location, onClose, onConfirm }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState<"schedule" | "payment">("schedule");
  const [date, setDate] = useState(today);
  const [slot, setSlot] = useState("");
  const [method, setMethod] = useState("card");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<ApiAvailabilitySlot[]>([]);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);

  useEffect(() => {
    if (!worker) return;
    let isCurrent = true;
    setAvailableSlots([]);
    setSlot("");
    setIsLoadingSlots(true);
    setAvailabilityError(null);
    getWorkerAvailability(worker.id, date)
      .then((slots) => {
        if (!isCurrent) return;
        setAvailableSlots(slots);
        setSlot((current) => slots.some((item) => item.slot === current && item.available)
          ? current
          : slots.find((item) => item.available)?.slot ?? "");
      })
      .catch((error) => {
        if (isCurrent) {
          setAvailableSlots([]);
          setAvailabilityError(error instanceof Error ? error.message : "Failed to load availability");
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoadingSlots(false);
      });
    return () => { isCurrent = false; };
  }, [worker?.id, date]);

  if (!worker) return null;

  const selectedAvailability = availableSlots.find((item) => item.slot === slot);
  const slotTimes = slot.match(/(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/);
  const slotStart = slotTimes?.[1] ?? "";
  const slotEnd = slotTimes?.[2] ?? "";
  const qty = slotStart && slotEnd
    ? (Number(slotEnd.slice(0, 2)) * 60 + Number(slotEnd.slice(3)) - Number(slotStart.slice(0, 2)) * 60 - Number(slotStart.slice(3))) / 60
    : 0;
  const subtotal = worker.pricePerHour * qty;
  const fee = Math.round(subtotal * 0.08 * 100) / 100;
  const total = subtotal + fee;

  const reset = () => {
    setStep("schedule");
    setMethod("card");
  };

  const pay = async () => {
    if (!user) {
      toast.error("You must be logged in to book a service");
      return;
    }

    setIsLoading(true);
    try {
      if (!selectedAvailability?.available) {
        throw new Error("This time slot is no longer available. Please select another time.");
      }
      await createBooking({
        worker_id: worker.id,
        service_id: worker.serviceId,
        amount: total,
        slot,
        booking_date: `${date}T${slot.slice(0, 5)}:00`,
        payment_method: method,
      });
      await onConfirm();

      toast.success("Booking request sent", {
        description: `${worker.name} is booked for ${date}, ${slot}.`,
      });
      reset();
      onClose();
    } catch (error: any) {
      toast.error(error.message || "Booking failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog
      open={!!worker}
      onOpenChange={(open) => {
        if (!open) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === "schedule" ? `Book ${worker.name}` : "Payment"}
          </DialogTitle>
          <DialogDescription>
            {serviceName} · {currency(worker.pricePerHour)}/hr ·{" "}
            {location || "location not set"}
          </DialogDescription>
        </DialogHeader>

        {step === "schedule" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="date" className="flex items-center gap-2">
                <CalendarDays className="size-4 text-primary" /> Date
              </Label>
              <Input
                id="date"
                type="date"
                min={today}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Clock className="size-4 text-primary" /> Time slot
              </Label>
              {availabilityError && <p role="alert" className="text-sm text-destructive">{availabilityError}</p>}
              <div className="grid grid-cols-2 gap-2">
                {availableSlots.map(({ slot: s, available }) => (
                  <Button
                    key={s}
                    type="button"
                    variant={slot === s ? "default" : "outline"}
                    className="justify-center"
                    disabled={!available || isLoadingSlots}
                    onClick={() => setSlot(s)}
                  >
                    {s}{available ? "" : " · Unavailable"}
                  </Button>
                ))}
                {isLoadingSlots && <p className="col-span-2 text-sm text-muted-foreground">Checking availability...</p>}
                {!isLoadingSlots && !availabilityError && availableSlots.length === 0 && (
                  <p className="col-span-2 text-sm text-muted-foreground">No time slots are available for this date.</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/60 p-4 text-sm">
              <Row label="Worker" value={worker.name} />
              <Row label="Schedule" value={`${date} · ${slot}`} />
              <Row label={`${qty} hr × ${currency(worker.pricePerHour)}`} value={currency(subtotal)} />
              <Row label="Platform fee" value={currency(fee)} />
              <Separator className="my-3" />
              <Row label="Total payable" value={currency(total)} strong />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <CreditCard className="size-4 text-primary" /> Payment preference
              </Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="card">Card ending 4421</SelectItem>
                  <SelectItem value="upi">UPI / Wallet</SelectItem>
                  <SelectItem value="cash">Cash after service</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">Local development does not charge payments; payment remains pending.</p>
          </div>
        )}

        <DialogFooter>
          {step === "schedule" ? (
            <Button onClick={() => setStep("payment")} disabled={!selectedAvailability?.available || isLoadingSlots}>
              Continue · {currency(subtotal)}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep("schedule")}>
                Back
              </Button>
              <Button onClick={pay} disabled={isLoading}>
                {isLoading ? "Submitting..." : "Confirm booking"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className={strong ? "font-semibold" : "text-muted-foreground"}>{label}</span>
      <span className={strong ? "font-display text-base font-bold" : "font-medium"}>{value}</span>
    </div>
  );
}

export function ReviewDialog({
  booking,
  onClose,
  onSubmit,
}: {
  booking: Booking | null;
  onClose: () => void;
  onSubmit: (id: string, rating: number, review: string) => void;
}) {
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!booking) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rate {booking.workerName}</DialogTitle>
          <DialogDescription>
            {booking.serviceName} · {booking.date}
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} stars`}>
              <Star
                className={
                  n <= rating
                    ? "size-8 fill-primary text-primary"
                    : "size-8 text-muted-foreground/40"
                }
              />
            </button>
          ))}
        </div>
        <Input
          placeholder="Share a short review (optional)"
          value={review}
          onChange={(e) => setReview(e.target.value)}
        />
        <DialogFooter>
          <Button
            disabled={isSubmitting}
            onClick={async () => {
              setIsSubmitting(true);
              try {
                await onSubmit(booking.id, rating, review);
                toast.success("Thanks for the review!");
                onClose();
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to submit review");
              } finally {
                setIsSubmitting(false);
              }
            }}
          >
            {isSubmitting ? "Submitting..." : "Submit review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { CalendarDays, Clock, CreditCard, ShieldCheck, Star } from "lucide-react";
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
import { currency, timeSlots, type Booking, type Worker } from "@/lib/dashboard-data";
import { createBooking } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

type Props = {
  worker: Worker | null;
  serviceName: string;
  location: string;
  onClose: () => void;
  onConfirm: (booking: Booking) => void;
};

const today = new Date().toISOString().slice(0, 10);

export function BookingFlow({ worker, serviceName, location, onClose, onConfirm }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState<"schedule" | "payment">("schedule");
  const [date, setDate] = useState(today);
  const [slot, setSlot] = useState(timeSlots[1]!);
  const [hours, setHours] = useState("2");
  const [method, setMethod] = useState("card");
  const [isLoading, setIsLoading] = useState(false);

  if (!worker) return null;

  const qty = Number(hours);
  const subtotal = worker.pricePerHour * qty;
  const fee = Math.round(subtotal * 0.08 * 100) / 100;
  const total = subtotal + fee;

  const reset = () => {
    setStep("schedule");
    setHours("2");
    setMethod("card");
  };

  const pay = async () => {
    if (!user) {
      toast.error("You must be logged in to book a service");
      return;
    }

    setIsLoading(true);
    try {
      const bookingData = {
  worker_id: worker.id,
  service_id: worker.serviceId,
  amount: total,
  slot,
  booking_date: new Date(`${date}T${slot.slice(0, 5)}:00`).toISOString(),
  payment_method: method,
};

      const result = await createBooking(bookingData);

      onConfirm({
        id: result.id,
        workerId: worker.id,
        workerName: worker.name,
        serviceName,
        date,
        slot,
        hours: qty,
        amount: result.amount || worker.pricePerHour * qty,
        status: "Upcoming",
        paid: true,
      });

      toast.success("Payment successful", {
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
              <div className="grid grid-cols-2 gap-2">
                {timeSlots.map((s) => (
                  <Button
                    key={s}
                    type="button"
                    variant={slot === s ? "default" : "outline"}
                    className="justify-center"
                    onClick={() => setSlot(s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Duration</Label>
              <Select value={hours} onValueChange={setHours}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6].map((h) => (
                    <SelectItem key={h} value={String(h)}>
                      {h} hour{h > 1 ? "s" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                <CreditCard className="size-4 text-primary" /> Payment method
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
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-4 text-primary" /> Payment is held securely
              and released after the job is marked complete.
            </p>
          </div>
        )}

        <DialogFooter>
          {step === "schedule" ? (
            <Button onClick={() => setStep("payment")}>
              Continue · {currency(subtotal)}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep("schedule")}>
                Back
              </Button>
              <Button onClick={pay} disabled={isLoading}>
                {isLoading ? "Processing..." : `Pay ${currency(total)}`}
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
            onClick={() => {
              onSubmit(booking.id, rating, review);
              toast.success("Thanks for the review!");
              onClose();
            }}
          >
            Submit review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

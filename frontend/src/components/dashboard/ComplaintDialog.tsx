import { useState } from "react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Booking } from "@/lib/dashboard-data";

const reasons = [
  "Worker did not arrive",
  "Work quality was poor",
  "Overcharged / billing issue",
  "Unprofessional behaviour",
  "Damage to property",
];

export function ComplaintDialog({
  booking,
  onClose,
  onSubmit,
}: {
  booking: Booking | null;
  onClose: () => void;
  onSubmit: (id: string, complaint: string) => void;
}) {
  const [reason, setReason] = useState(reasons[0]!);
  const [details, setDetails] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!booking) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Raise a complaint</DialogTitle>
          <DialogDescription>
            {booking.id} · {booking.serviceName} with {booking.workerName}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="details">What happened?</Label>
            <Textarea
              id="details"
              rows={4}
              placeholder="Add details so our support team can act fast."
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={isSubmitting}
            onClick={async () => {
              setIsSubmitting(true);
              try {
                await onSubmit(booking.id, details ? `${reason} — ${details}` : reason);
                toast.success("Complaint submitted");
                onClose();
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to submit complaint");
              } finally {
                setIsSubmitting(false);
              }
            }}
          >
            {isSubmitting ? "Submitting..." : "Submit complaint"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

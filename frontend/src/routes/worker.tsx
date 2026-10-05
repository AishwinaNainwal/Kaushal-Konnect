import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BadgeCheck, CalendarDays, Check, Clock, FileCheck2, Inbox, LogOut, MapPin, ShieldCheck, Star, Wallet } from "lucide-react";
import { toast } from "sonner";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/hooks/use-auth";
import { API_BASE_URL } from "@/lib/api";
import { currency } from "@/lib/dashboard-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type WorkerProfile = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  city: string | null;
  locality: string | null;
  worker_zone: string | null;
  service_id: string;
  hourly_rate: number;
  available: boolean;
  is_verified: boolean;
  rating: number;
  completed_jobs: number;
  skills: string[];
};
type WorkerBooking = {
  id: string;
  customer_name: string | null;
  service_name: string | null;
  status: string;
  booking_date: string | null;
  slot: string | null;
  amount: number | null;
  payment_status: string | null;
  complaint_status: string | null;
};
type WorkerDocument = { id: string; document_type: string; file_path: string | null; status: string; created_at: string };
type WorkerReview = { id: string; service_name: string | null; customer_name: string | null; rating: number; comment: string | null; created_at: string };
type WorkerPayment = { id: string; booking_id: string; amount: number; status: string; payment_method: string | null; payment_date: string | null };

const serviceNames: Record<string, string> = {
  "home-cleaning": "Home Cleaning", plumbing: "Plumbing", electrical: "Electrical",
  painting: "Painting", carpentry: "Carpentry", "appliance-repair": "Appliance Repair",
};

export const Route = createFileRoute("/worker")({
  head: () => ({ meta: [{ title: "Worker Dashboard | Kaushal Konnect" }] }),
  component: WorkerDashboard,
});

async function apiRequest<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (options.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.detail || `Request failed (${response.status})`);
  return payload;
}

function WorkerDashboard() {
  const { user, token, logout } = useAuth();
  const [profile, setProfile] = useState<WorkerProfile | null>(null);
  const [bookings, setBookings] = useState<WorkerBooking[]>([]);
  const [documents, setDocuments] = useState<WorkerDocument[]>([]);
  const [reviews, setReviews] = useState<WorkerReview[]>([]);
  const [payments, setPayments] = useState<WorkerPayment[]>([]);
  const [skillDraft, setSkillDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const refresh = async (currentToken: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const [profileData, bookingRows, documentRows, reviewRows, paymentRows] = await Promise.all([
        apiRequest<WorkerProfile>("/workers/me", currentToken),
        apiRequest<WorkerBooking[]>("/bookings/", currentToken),
        apiRequest<WorkerDocument[]>("/workers/me/documents", currentToken),
        apiRequest<WorkerReview[]>("/reviews/me", currentToken),
        apiRequest<WorkerPayment[]>("/payments/", currentToken),
      ]);
      setProfile(profileData);
      setBookings(bookingRows);
      setDocuments(documentRows);
      setReviews(reviewRows);
      setPayments(paymentRows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load worker data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) void refresh(token);
    else setIsLoading(false);
  }, [token]);

  const pending = useMemo(() => bookings.filter((booking) => booking.status === "REQUESTED"), [bookings]);
  const upcoming = useMemo(() => bookings.filter((booking) => booking.status === "ACCEPTED"), [bookings]);
  const releasedAmount = payments.filter((payment) => payment.status === "RELEASED").reduce((sum, payment) => sum + Number(payment.amount), 0);

  const setAvailability = async (available: boolean) => {
    if (!token) return;
    try {
      const updated = await apiRequest<WorkerProfile>("/workers/me/availability", token, {
        method: "PATCH",
        body: JSON.stringify({ available }),
      });
      setProfile(updated);
      toast.success(available ? "You are available for bookings" : "You are unavailable for bookings");
    } catch (updateError) {
      toast.error(updateError instanceof Error ? updateError.message : "Failed to update availability");
    }
  };

  const saveProfile = async () => {
    if (!token || !profile) return;
    setIsSaving(true);
    try {
      const updated = await apiRequest<WorkerProfile>("/workers/me", token, {
        method: "PATCH",
        body: JSON.stringify({
          full_name: profile.full_name,
          phone: profile.phone,
          city: profile.city,
          locality: profile.locality,
          worker_zone: profile.worker_zone,
          service_id: profile.service_id,
          hourly_rate: Number(profile.hourly_rate),
        }),
      });
      setProfile(updated);
      toast.success("Profile saved");
    } catch (updateError) {
      toast.error(updateError instanceof Error ? updateError.message : "Failed to save profile");
    } finally {
      setIsSaving(false);
    }
  };

  const saveSkills = async () => {
    if (!token || !profile) return;
    const skills = [...new Set([...profile.skills, skillDraft.trim()].filter(Boolean))];
    try {
      const updated = await apiRequest<WorkerProfile>("/workers/me/skills", token, {
        method: "PUT",
        body: JSON.stringify({ skills }),
      });
      setProfile(updated);
      setSkillDraft("");
      toast.success("Skills saved");
    } catch (updateError) {
      toast.error(updateError instanceof Error ? updateError.message : "Failed to save skills");
    }
  };

  const decideBooking = async (booking: WorkerBooking, status: "ACCEPTED" | "REJECTED" | "CANCELLED") => {
    if (!token) return;
    try {
      const updated = await apiRequest<WorkerBooking>(`/bookings/${booking.id}/status?status=${status}`, token, { method: "PATCH" });
      setBookings((current) => current.map((item) => item.id === booking.id ? { ...item, ...updated } : item));
      toast.success(status === "ACCEPTED" ? "Booking accepted" : status === "REJECTED" ? "Booking rejected" : "Booking cancelled");
    } catch (updateError) {
      toast.error(updateError instanceof Error ? updateError.message : "Failed to update booking");
    }
  };

  const completeBooking = async (bookingId: string) => {
    if (!token) return;
    try {
      const updated = await apiRequest<WorkerBooking>(`/bookings/${bookingId}/complete`, token, { method: "PATCH" });
      setBookings((current) => current.map((item) => item.id === bookingId ? { ...item, ...updated } : item));
      const [paymentRows, profileData] = await Promise.all([
        apiRequest<WorkerPayment[]>("/payments/", token),
        apiRequest<WorkerProfile>("/workers/me", token),
      ]);
      setPayments(paymentRows);
      setProfile(profileData);
      toast.success("Booking marked complete");
    } catch (updateError) {
      toast.error(updateError instanceof Error ? updateError.message : "Failed to complete booking");
    }
  };

  const patchProfile = (patch: Partial<WorkerProfile>) => setProfile((current) => current ? { ...current, ...patch } : current);

  if (isLoading) return <div className="flex min-h-screen items-center justify-center"><p className="text-muted-foreground">Loading worker data...</p></div>;

  return (
    <ProtectedRoute allowedRoles={["worker", "admin"]}>
      <main className="min-h-screen bg-background pb-20">
        <header className="bg-gradient-navy text-navy-foreground">
          <div className="mx-auto max-w-6xl px-5 pt-10 pb-24 sm:px-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div><p className="font-display text-lg font-bold">Kaushal Konnect</p><p className="text-xs text-navy-foreground/60">Worker dashboard</p></div>
              {user?.role === "admin" && <Link to="/" className="text-sm hover:text-primary">Customer view</Link>}
              <div className="flex items-center gap-3"><Switch checked={profile?.available ?? false} onCheckedChange={(value) => void setAvailability(value)} aria-label="Availability" /><span>{profile?.available ? "Available" : "Unavailable"}</span><Button variant="ghost" size="sm" onClick={() => logout()}><LogOut className="mr-2 size-4" />Logout</Button></div>
            </div>
            <h1 className="mt-10 text-4xl font-bold">Welcome back, {profile?.full_name.split(" ")[0] ?? "Worker"}</h1>
            <p className="mt-3 flex flex-wrap gap-4 text-sm text-navy-foreground/70"><span><BadgeCheck className="mr-1 inline size-4 text-primary" />{serviceNames[profile?.service_id ?? ""] ?? profile?.service_id} · {profile?.is_verified ? "Verified" : "Pending verification"}</span><span><MapPin className="mr-1 inline size-4 text-primary" />{[profile?.locality, profile?.city].filter(Boolean).join(", ") || "Location not set"}</span><span><Star className="mr-1 inline size-4 text-primary" />{Number(profile?.rating ?? 0).toFixed(1)} rating</span></p>
          </div>
        </header>
        <div className="mx-auto -mt-16 max-w-6xl px-5 sm:px-8">
          {error && <p role="alert" className="mb-4 rounded border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={<Inbox className="size-5" />} label="New requests" value={String(pending.length)} />
            <StatCard icon={<CalendarDays className="size-5" />} label="Upcoming jobs" value={String(upcoming.length)} />
            <StatCard icon={<Wallet className="size-5" />} label="Released payments" value={currency(releasedAmount)} />
            <StatCard icon={<ShieldCheck className="size-5" />} label="Verification documents" value={String(documents.length)} />
          </div>
          <Tabs defaultValue="jobs" className="mt-10">
            <TabsList className="flex-wrap"><TabsTrigger value="jobs">Jobs</TabsTrigger><TabsTrigger value="availability">Availability</TabsTrigger><TabsTrigger value="profile">Profile & skills</TabsTrigger><TabsTrigger value="verification">Verification</TabsTrigger><TabsTrigger value="reviews">Reviews</TabsTrigger><TabsTrigger value="earnings">Payments</TabsTrigger><TabsTrigger value="welfare">Welfare</TabsTrigger></TabsList>

            <TabsContent value="jobs" className="mt-6 space-y-8">
              <section><h2 className="text-xl font-bold">Incoming booking requests</h2>{pending.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No pending booking requests.</p> : <div className="mt-4 grid gap-4 lg:grid-cols-2">{pending.map((booking) => <BookingCard key={booking.id} booking={booking} onAccept={() => void decideBooking(booking, "ACCEPTED")} onReject={() => void decideBooking(booking, "REJECTED")} />)}</div>}</section>
              <section><h2 className="text-xl font-bold">Upcoming bookings</h2>{upcoming.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No upcoming bookings.</p> : <div className="mt-4 space-y-3">{upcoming.map((booking) => <BookingCard key={booking.id} booking={booking} onCancel={() => void decideBooking(booking, "CANCELLED")} onComplete={() => void completeBooking(booking.id)} />)}</div>}</section>
              <section><h2 className="text-xl font-bold">Booking history</h2>{bookings.filter((booking) => !["REQUESTED", "ACCEPTED"].includes(booking.status)).length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No completed or cancelled bookings.</p> : <div className="mt-4 space-y-3">{bookings.filter((booking) => !["REQUESTED", "ACCEPTED"].includes(booking.status)).map((booking) => <BookingCard key={booking.id} booking={booking} />)}</div>}</section>
            </TabsContent>

            <TabsContent value="availability" className="mt-6"><h2 className="text-xl font-bold">Booked schedule</h2><p className="mt-1 text-sm text-muted-foreground">Time-slot availability is calculated from active bookings. Your Available switch controls whether new requests are accepted.</p>{bookings.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No scheduled bookings.</p> : <div className="mt-4 space-y-3">{bookings.filter((booking) => ["REQUESTED", "ACCEPTED"].includes(booking.status)).map((booking) => <BookingCard key={booking.id} booking={booking} />)}</div>}</TabsContent>

            <TabsContent value="profile" className="mt-6 space-y-6"><Card><CardContent className="grid gap-4 p-6 sm:grid-cols-2"><Field label="Full name" value={profile?.full_name ?? ""} onChange={(value) => patchProfile({ full_name: value })} /><Field label="Phone" value={profile?.phone ?? ""} onChange={(value) => patchProfile({ phone: value })} /><Field label="City" value={profile?.city ?? ""} onChange={(value) => patchProfile({ city: value })} /><Field label="Locality" value={profile?.locality ?? ""} onChange={(value) => patchProfile({ locality: value })} /><Field label="Service area" value={profile?.worker_zone ?? ""} onChange={(value) => patchProfile({ worker_zone: value })} /><Field label="Hourly rate" value={String(profile?.hourly_rate ?? "")} onChange={(value) => patchProfile({ hourly_rate: Number(value) || 0 })} /><div><Label>Service</Label><p className="mt-2 text-sm">{serviceNames[profile?.service_id ?? ""] ?? profile?.service_id}</p></div><Button disabled={isSaving} onClick={() => void saveProfile()}>{isSaving ? "Saving..." : "Save profile"}</Button></CardContent></Card><Card><CardContent className="space-y-4 p-6"><h2 className="text-xl font-bold">Skills</h2><div className="flex flex-wrap gap-2">{profile?.skills.map((skill) => <Badge key={skill} variant="secondary">{skill}</Badge>)}</div><div className="flex gap-2"><Input value={skillDraft} onChange={(event) => setSkillDraft(event.target.value)} placeholder="Add a skill" /><Button variant="outline" onClick={() => void saveSkills()}>Save skills</Button></div></CardContent></Card></TabsContent>

            <TabsContent value="verification" className="mt-6"><h2 className="text-xl font-bold">Verification documents</h2>{documents.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No verification documents on file.</p> : <div className="mt-4 space-y-3">{documents.map((document) => <Card key={document.id}><CardContent className="flex items-center justify-between gap-4 p-4"><div><p className="font-medium"><FileCheck2 className="mr-2 inline size-4" />{document.document_type}</p><p className="text-xs text-muted-foreground">{document.file_path ?? "No file path recorded"}</p></div><Badge>{document.status}</Badge></CardContent></Card>)}</div>}</TabsContent>

            <TabsContent value="reviews" className="mt-6"><h2 className="text-xl font-bold">Customer reviews</h2>{reviews.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No reviews yet.</p> : <div className="mt-4 space-y-3">{reviews.map((review) => <Card key={review.id}><CardContent className="p-5"><p className="font-medium"><Star className="mr-1 inline size-4 text-primary" />{review.rating}/5 · {review.service_name}</p><p className="text-sm text-muted-foreground">{review.customer_name} · {new Date(review.created_at).toLocaleDateString()}</p>{review.comment && <p className="mt-2 text-sm">{review.comment}</p>}</CardContent></Card>)}</div>}</TabsContent>

            <TabsContent value="earnings" className="mt-6"><h2 className="text-xl font-bold">Payments</h2>{payments.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No payment records yet.</p> : <div className="mt-4 space-y-3">{payments.map((payment) => <Card key={payment.id}><CardContent className="flex justify-between gap-4 p-4"><span>Booking {payment.booking_id} · {payment.payment_method ?? "method not set"}</span><span>{payment.status} · {currency(Number(payment.amount))}</span></CardContent></Card>)}</div>}</TabsContent>

            <TabsContent value="welfare" className="mt-6"><h2 className="text-xl font-bold">Welfare</h2><p className="mt-3 text-sm text-muted-foreground">Welfare and insurance benefits are not represented in the current database schema.</p></TabsContent>
          </Tabs>
        </div>
      </main>
    </ProtectedRoute>
  );
}

function BookingCard({ booking, onAccept, onReject, onCancel, onComplete }: { booking: WorkerBooking; onAccept?: () => void; onReject?: () => void; onCancel?: () => void; onComplete?: () => void }) {
  return <Card><CardContent className="flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="font-display font-semibold">{booking.customer_name ?? "Customer"}</p><p className="text-sm text-muted-foreground">{booking.service_name} · {booking.booking_date?.slice(0, 10) ?? "Date not set"} · {booking.slot ?? "Time not set"}</p><p className="mt-1 text-xs text-muted-foreground">{booking.id} · {booking.complaint_status ? `Complaint ${booking.complaint_status}` : "No complaint"}</p></div><div className="flex items-center gap-3"><Badge>{booking.status}</Badge><span className="font-display font-bold">{currency(Number(booking.amount ?? 0))}</span>{onAccept && <Button size="sm" onClick={onAccept}>Accept</Button>}{onReject && <Button size="sm" variant="outline" onClick={onReject}>Reject</Button>}{onCancel && <Button size="sm" variant="outline" onClick={onCancel}>Cancel booking</Button>}{onComplete && <Button size="sm" variant="outline" onClick={onComplete}><Check className="mr-1 size-4" />Complete</Button>}</div></CardContent></Card>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div className="space-y-2"><Label>{label}</Label><Input value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <Card><CardContent className="flex items-center gap-4 p-5"><span className="grid size-10 place-items-center rounded bg-accent text-accent-foreground">{icon}</span><div><p className="text-xs uppercase text-muted-foreground">{label}</p><p className="font-display text-2xl font-bold">{value}</p></div></CardContent></Card>;
}
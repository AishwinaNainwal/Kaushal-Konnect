import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, BadgeCheck, CalendarDays, Check, FileCheck2, LogOut, MessageSquareWarning, Star, Users, Wallet } from "lucide-react";
import { toast } from "sonner";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/hooks/use-auth";
import { API_BASE_URL } from "@/lib/api";
import { currency } from "@/lib/dashboard-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type WorkerRecord = {
  id: string;
  full_name: string;
  service_id: string;
  city: string | null;
  locality: string | null;
  is_verified: boolean;
  available: boolean;
  hourly_rate: number;
  rating: number;
  completed_jobs: number;
  skills: string[];
};
type ServiceRecord = { id: string; name: string; description: string | null; base_price: number | null };
type BookingRecord = {
  id: string;
  worker_id: string;
  customer_id: string;
  worker_name: string | null;
  customer_name: string | null;
  service_name: string | null;
  status: string;
  booking_date: string | null;
  slot: string | null;
  amount: number | null;
  payment_status: string | null;
};
type ComplaintRecord = {
  id: string;
  booking_id: string;
  customer_name: string | null;
  worker_name: string | null;
  service_name: string | null;
  description: string;
  status: string;
  created_at: string;
};
type ReviewRecord = {
  id: string;
  booking_id: string;
  customer_name: string | null;
  worker_name: string | null;
  service_name: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
};
type PaymentRecord = {
  id: string;
  booking_id: string;
  amount: number;
  status: string;
  payment_method: string | null;
  payment_date: string | null;
};

const serviceNames: Record<string, string> = {
  "home-cleaning": "Home Cleaning",
  plumbing: "Plumbing",
  electrical: "Electrical",
  painting: "Painting",
  carpentry: "Carpentry",
  "appliance-repair": "Appliance Repair",
};

export const Route = createFileRoute("/coop")({
  head: () => ({ meta: [{ title: "Cooperative Dashboard | Kaushal Konnect" }] }),
  component: CoopDashboard,
});

async function apiList<T>(path: string, token: string): Promise<T[]> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.detail || `Failed to load ${path} (${response.status})`);
  return payload;
}

function CoopDashboard() {
  const { user, token } = useAuth();
  const [workers, setWorkers] = useState<WorkerRecord[]>([]);
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let current = true;
    setIsLoading(true);
    void Promise.all([
      apiList<WorkerRecord>("/workers/?limit=100", token),
      apiList<ServiceRecord>("/services/", token),
      apiList<BookingRecord>("/bookings/?limit=100", token),
      apiList<ComplaintRecord>("/complaints/", token),
      apiList<ReviewRecord>("/reviews/", token),
      apiList<PaymentRecord>("/payments/", token),
    ]).then(([workerRows, serviceRows, bookingRows, complaintRows, reviewRows, paymentRows]) => {
      if (!current) return;
      setWorkers(workerRows);
      setServices(serviceRows);
      setBookings(bookingRows);
      setComplaints(complaintRows);
      setReviews(reviewRows);
      setPayments(paymentRows);
      setError(null);
    }).catch((loadError) => {
      if (current) setError(loadError instanceof Error ? loadError.message : "Failed to load cooperative data");
    }).finally(() => {
      if (current) setIsLoading(false);
    });
    return () => { current = false; };
  }, [token]);

  const pendingWorkers = workers.filter((worker) => !worker.is_verified);
  const verifiedCount = workers.filter((worker) => worker.is_verified).length;
  const activeCount = workers.filter((worker) => worker.is_verified && worker.available).length;
  const openComplaints = complaints.filter((complaint) => complaint.status !== "RESOLVED").length;
  const payoutTotal = payments.filter((payment) => payment.status === "RELEASED").reduce((total, payment) => total + Number(payment.amount), 0);
  const averageRating = reviews.length ? (reviews.reduce((total, review) => total + Number(review.rating), 0) / reviews.length).toFixed(1) : "—";
  const filteredWorkers = useMemo(() => workers.filter((worker) =>
    worker.full_name.toLowerCase().includes(query.toLowerCase()) ||
    (serviceNames[worker.service_id] ?? worker.service_id).toLowerCase().includes(query.toLowerCase())
  ), [workers, query]);

  const approveWorker = async (worker: WorkerRecord) => {
    if (!token) return;
    setApprovingId(worker.id);
    try {
      const response = await fetch(`${API_BASE_URL}/workers/${worker.id}/verify`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.detail || `Verification failed (${response.status})`);
      if (result?.is_verified !== true) throw new Error("The API did not confirm verification.");
      setWorkers((current) => current.map((item) => item.id === worker.id ? { ...item, ...result } : item));
      toast.success(`${worker.full_name} verified`);
    } catch (approveError) {
      toast.error(approveError instanceof Error ? approveError.message : "Failed to verify worker");
    } finally {
      setApprovingId(null);
    }
  };

  const updateComplaint = async (complaint: ComplaintRecord, status: string) => {
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE_URL}/complaints/${complaint.id}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.detail || `Update failed (${response.status})`);
      setComplaints((current) => current.map((item) => item.id === complaint.id ? result : item));
      toast.success("Complaint status updated");
    } catch (updateError) {
      toast.error(updateError instanceof Error ? updateError.message : "Failed to update complaint");
    }
  };

  return (
    <ProtectedRoute allowedRoles={["coop_manager", "admin"]}>
      <main className="min-h-screen bg-background pb-20">
        <header className="bg-gradient-navy text-navy-foreground">
          <div className="mx-auto max-w-6xl px-5 pt-10 pb-24 sm:px-8">
            <div className="flex items-center justify-between gap-4">
              <div><p className="font-display text-lg font-bold">Kaushal Konnect</p><p className="text-xs text-navy-foreground/60">Cooperative dashboard</p></div>
              {user?.role === "admin" && <Link to="/" className="text-sm hover:text-primary">Customer view</Link>}
              <Button variant="ghost" size="sm" onClick={() => { localStorage.removeItem("auth_token"); localStorage.removeItem("auth_user"); window.location.href = "/login"; }}><LogOut className="mr-2 size-4" />Logout</Button>
            </div>
            <h1 className="mt-10 max-w-2xl text-4xl font-bold">Cooperative control room</h1>
            <p className="mt-3 flex flex-wrap gap-5 text-sm text-navy-foreground/70">
              <span><Users className="mr-1 inline size-4 text-primary" />{workers.length} workers</span>
              <span><FileCheck2 className="mr-1 inline size-4 text-primary" />{pendingWorkers.length} pending verifications</span>
              <span><MessageSquareWarning className="mr-1 inline size-4 text-primary" />{openComplaints} open complaints</span>
            </p>
          </div>
        </header>

        <div className="mx-auto -mt-16 max-w-6xl px-5 sm:px-8">
          {error && <p role="alert" className="mb-4 rounded border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={<BadgeCheck className="size-5" />} label="Verified and available" value={String(activeCount)} />
            <StatCard icon={<FileCheck2 className="size-5" />} label="Pending verification" value={String(pendingWorkers.length)} />
            <StatCard icon={<CalendarDays className="size-5" />} label="Open bookings" value={String(bookings.filter((booking) => ["REQUESTED", "ACCEPTED"].includes(booking.status)).length)} />
            <StatCard icon={<Wallet className="size-5" />} label="Released payments" value={currency(payoutTotal)} />
          </div>

          <Tabs defaultValue="workers" className="mt-10">
            <TabsList className="flex-wrap">
              <TabsTrigger value="workers">Workers</TabsTrigger>
              <TabsTrigger value="verification">Verification</TabsTrigger>
              <TabsTrigger value="services">Services</TabsTrigger>
              <TabsTrigger value="bookings">Bookings</TabsTrigger>
              <TabsTrigger value="complaints">Complaints</TabsTrigger>
              <TabsTrigger value="reviews">Reviews</TabsTrigger>
              <TabsTrigger value="welfare">Welfare & payments</TabsTrigger>
              <TabsTrigger value="stats">Statistics</TabsTrigger>
            </TabsList>

            <TabsContent value="workers" className="mt-6 space-y-5">
              <section>
                <h2 className="text-xl font-bold">Worker registration</h2>
                <p className="mt-2 text-sm text-muted-foreground">Workers create their account through Sign Up. New profiles appear here after registration.</p>
              </section>
              <section>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <h2 className="text-xl font-bold">Worker roster</h2>
                  <Input className="w-56" placeholder="Search name or service" value={query} onChange={(event) => setQuery(event.target.value)} />
                </div>
                {isLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading workers...</p> : filteredWorkers.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No workers found.</p> : (
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {filteredWorkers.map((worker) => (
                      <Card key={worker.id}><CardContent className="p-5">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-display font-semibold">{worker.full_name}</p>
                          <Badge variant={worker.is_verified ? "default" : "outline"}>{worker.is_verified ? "Verified" : "Unverified"}</Badge>
                          <Badge variant="secondary">{worker.available ? "Available" : "Unavailable"}</Badge>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">{serviceNames[worker.service_id] ?? worker.service_id} · {[worker.locality, worker.city].filter(Boolean).join(", ") || "Location not set"}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{worker.completed_jobs} completed jobs · {Number(worker.rating).toFixed(1)} rating · {currency(Number(worker.hourly_rate))}/hr</p>
                        {worker.skills.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{worker.skills.map((skill) => <Badge key={skill} variant="outline">{skill}</Badge>)}</div>}
                      </CardContent></Card>
                    ))}
                  </div>
                )}
              </section>
            </TabsContent>

            <TabsContent value="verification" className="mt-6">
              <h2 className="text-xl font-bold">Worker verification</h2>
              {isLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading workers...</p> : pendingWorkers.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No pending workers.</p> : (
                <div className="mt-4 grid gap-4 lg:grid-cols-2">{pendingWorkers.map((worker) => (
                  <Card key={worker.id} className="border-primary/40"><CardContent className="p-5">
                    <p className="font-display font-semibold">{worker.full_name}</p>
                    <p className="text-sm text-muted-foreground">{serviceNames[worker.service_id] ?? worker.service_id} · {[worker.locality, worker.city].filter(Boolean).join(", ") || "Location not set"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{worker.available ? "Available" : "Unavailable"}</p>
                    <Button className="mt-4" disabled={approvingId === worker.id} onClick={() => void approveWorker(worker)}><Check className="mr-1 size-4" />{approvingId === worker.id ? "Approving..." : "Approve"}</Button>
                  </CardContent></Card>
                ))}</div>
              )}
            </TabsContent>

            <TabsContent value="services" className="mt-6">
              <h2 className="text-xl font-bold">Services</h2>
              {services.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No services configured.</p> : <div className="mt-4 grid gap-4 lg:grid-cols-2">{services.map((service) => (
                <Card key={service.id}><CardContent className="p-5"><p className="font-display font-semibold">{service.name}</p><p className="mt-1 text-sm text-muted-foreground">{service.description || "No description"}</p><p className="mt-3 text-sm">Base price: {service.base_price == null ? "Not set" : currency(Number(service.base_price))}</p><p className="text-xs text-muted-foreground">{workers.filter((worker) => worker.service_id === service.id).length} worker profiles</p></CardContent></Card>
              ))}</div>}
            </TabsContent>

            <TabsContent value="bookings" className="mt-6">
              <h2 className="text-xl font-bold">Bookings</h2>
              {bookings.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No bookings yet.</p> : <div className="mt-4 space-y-3">{bookings.map((booking) => (
                <Card key={booking.id}><CardContent className="flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="font-display font-semibold">{booking.service_name} · {booking.customer_name}</p><p className="text-sm text-muted-foreground">{booking.worker_name} · {booking.booking_date?.slice(0, 10)} · {booking.slot}</p><p className="mt-1 text-xs text-muted-foreground">{booking.id}</p></div><div className="flex items-center gap-3"><Badge>{booking.status}</Badge><Badge variant="outline">{booking.payment_status ?? "No payment"}</Badge><span className="font-display font-bold">{currency(Number(booking.amount ?? 0))}</span></div></CardContent></Card>
              ))}</div>}
            </TabsContent>

            <TabsContent value="complaints" className="mt-6">
              <h2 className="text-xl font-bold">Complaints</h2>
              {complaints.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No complaints yet.</p> : <div className="mt-4 grid gap-4 lg:grid-cols-2">{complaints.map((complaint) => (
                <Card key={complaint.id}><CardContent className="p-5"><div className="flex items-center gap-2"><Badge>{complaint.status}</Badge><span className="text-xs text-muted-foreground">{new Date(complaint.created_at).toLocaleDateString()}</span></div><p className="mt-3 font-medium">{complaint.customer_name ?? "Customer"} · {complaint.service_name}</p><p className="text-sm text-muted-foreground">Worker: {complaint.worker_name ?? "Unknown"} · Booking {complaint.booking_id}</p><p className="mt-2 text-sm">{complaint.description}</p>{complaint.status !== "RESOLVED" && <div className="mt-4 flex gap-2"><Button size="sm" onClick={() => void updateComplaint(complaint, complaint.status === "OPEN" ? "INVESTIGATING" : "RESOLVED")}>{complaint.status === "OPEN" ? "Investigate" : "Resolve"}</Button></div>}</CardContent></Card>
              ))}</div>}
            </TabsContent>

            <TabsContent value="reviews" className="mt-6">
              <h2 className="text-xl font-bold">Reviews</h2>
              {reviews.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No reviews yet.</p> : <div className="mt-4 space-y-3">{reviews.map((review) => <Card key={review.id}><CardContent className="p-5"><p className="font-medium">{review.service_name} · {review.worker_name}</p><p className="text-sm"><Star className="mr-1 inline size-4 text-primary" />{review.rating}/5 from {review.customer_name}</p>{review.comment && <p className="mt-2 text-sm text-muted-foreground">{review.comment}</p>}</CardContent></Card>)}</div>}
            </TabsContent>

            <TabsContent value="welfare" className="mt-6 space-y-6">
              <section><h2 className="text-xl font-bold">Welfare</h2><p className="mt-3 text-sm text-muted-foreground">Welfare and insurance records are not represented in the current database schema.</p></section>
              <section><h2 className="text-xl font-bold">Payments</h2>{payments.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No payment records yet.</p> : <div className="mt-4 space-y-3">{payments.map((payment) => <Card key={payment.id}><CardContent className="flex justify-between gap-4 p-4"><span>Booking {payment.booking_id} · {payment.payment_method ?? "method not set"}</span><span>{payment.status} · {currency(Number(payment.amount))}</span></CardContent></Card>)}</div>}</section>
            </TabsContent>

            <TabsContent value="stats" className="mt-6">
              <h2 className="text-xl font-bold">Database statistics</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard icon={<Users className="size-5" />} label="Worker profiles" value={String(workers.length)} />
                <StatCard icon={<Activity className="size-5" />} label="Services" value={String(services.length)} />
                <StatCard icon={<CalendarDays className="size-5" />} label="Bookings" value={String(bookings.length)} />
                <StatCard icon={<MessageSquareWarning className="size-5" />} label="Complaints" value={String(complaints.length)} />
                <StatCard icon={<Star className="size-5" />} label="Average review" value={averageRating} />
                <StatCard icon={<Wallet className="size-5" />} label="Payment records" value={String(payments.length)} />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </ProtectedRoute>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <Card><CardContent className="flex items-center gap-4 p-5"><span className="grid size-10 place-items-center rounded bg-accent text-accent-foreground">{icon}</span><div><p className="text-xs uppercase text-muted-foreground">{label}</p><p className="font-display text-2xl font-bold">{value}</p></div></CardContent></Card>;
}
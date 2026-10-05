import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import {
  BadgeCheck,
  CalendarDays,
  Hammer,
  MapPin,
  MessageSquareWarning,
  Paintbrush,
  Receipt,
  Refrigerator,
  Sparkles,
  Star,
  Wrench,
  Zap,
  LogOut,
} from "lucide-react";

import { BookingFlow, ReviewDialog } from "@/components/dashboard/BookingFlow";
import { ComplaintDialog } from "@/components/dashboard/ComplaintDialog";
import { CustomerAnalytics } from "@/components/dashboard/CustomerAnalytics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  currency,
  type Service,
  type Booking,
  type Worker,
} from "@/lib/dashboard-data";
import {
  getRecommendedWorkers,
  getServices,
  getWorkerLocations,
  getUserBookings,
  createReview,
  createComplaint,
  type ApiService,
} from "@/lib/api";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Customer Dashboard | Kaushal Konnect" },
      {
        name: "description",
        content:
          "Browse home services, compare verified workers by rating, price and distance, book a time slot, pay securely and manage your bookings.",
      },
      {
        property: "og:title",
        content: "Customer Dashboard | HomeHands Services",
      },
      {
        property: "og:description",
        content:
          "Book verified home-service professionals near you, pay securely and track every booking in one dashboard.",
      },
    ],
  }),
  component: CustomerDashboard,
});

const icons = {
  Sparkles,
  Wrench,
  Zap,
  Paintbrush,
  Hammer,
  Refrigerator,
};

const categoryMapping: Record<string, string> = {
  "home-cleaning": "Home Cleaning",
  plumbing: "Plumbing",
  electrical: "Electrical",
  painting: "Painting",
  carpentry: "Carpentry",
  "appliance-repair": "Appliance Repair",
};

const servicePresentation: Record<string, { icon: string; blurb: string }> = {
  "home-cleaning": { icon: "Sparkles", blurb: "Deep & regular cleaning" },
  plumbing: { icon: "Wrench", blurb: "Leaks, fittings, drainage" },
  electrical: { icon: "Zap", blurb: "Wiring, fixtures, repairs" },
  painting: { icon: "Paintbrush", blurb: "Interior & exterior walls" },
  carpentry: { icon: "Hammer", blurb: "Furniture & fittings" },
  "appliance-repair": { icon: "Refrigerator", blurb: "AC, washer, fridge" },
};

function mapService(service: ApiService): Service {
  return {
    id: service.id,
    name: service.name,
    icon: servicePresentation[service.id]?.icon ?? "Wrench",
    from: Number(service.base_price ?? 0),
    blurb: servicePresentation[service.id]?.blurb ?? service.description ?? "",
  };
}

function mapBookingRecord(booking: any): Booking {
  const slotParts = String(booking.slot ?? "").match(/(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/);
  const slotStart = slotParts?.[1] ?? "";
  const slotEnd = slotParts?.[2] ?? "";
  const startMinutes = slotStart ? Number(slotStart.slice(0, 2)) * 60 + Number(slotStart.slice(3)) : 0;
  const endMinutes = slotEnd ? Number(slotEnd.slice(0, 2)) * 60 + Number(slotEnd.slice(3)) : 0;
  const status = String(booking.status).toUpperCase();
  return {
    id: String(booking.id),
    workerId: String(booking.worker_id),
    workerName: booking.worker_name ?? "Worker",
    serviceName: booking.service_name ?? booking.service_id,
    date: booking.booking_date ? String(booking.booking_date).slice(0, 10) : "N/A",
    slot: booking.slot ?? "N/A",
    hours: Math.max(0, (endMinutes - startMinutes) / 60),
    amount: Number(booking.amount) || 0,
    status: status === "COMPLETED" ? "Completed" : status === "CANCELLED" ? "Cancelled" : status === "REJECTED" ? "Rejected" : status === "REQUESTED" ? "Requested" : "Upcoming",
    paid: ["SUCCESS", "RELEASED"].includes(String(booking.payment_status).toUpperCase()),
    ...(booking.review_rating == null ? {} : { rating: Number(booking.review_rating) }),
    ...(booking.review_comment == null ? {} : { review: booking.review_comment }),
    ...(booking.complaint_status == null ? {} : { complaint: booking.complaint_status }),
  };
}

function CustomerDashboard() {
  return (
    <ProtectedRoute allowedRoles={['customer', 'admin']}>
      <DashboardContent />
    </ProtectedRoute>
  );
}
function DashboardContent() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [userLocation, setUserLocation] = useState("");
  const [serviceId, setServiceId] = useState("home-cleaning");
  const [services, setServices] = useState<Service[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [sort, setSort] = useState("rating");
  const [budget, setBudget] = useState("1000");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingWorker, setBookingWorker] =
    useState<Worker | null>(null);
  const [reviewTarget, setReviewTarget] =
    useState<Booking | null>(null);
  const [complaintTarget, setComplaintTarget] =
    useState<Booking | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [realWorkers, setRealWorkers] = useState<Worker[]>([]);

  useEffect(() => {
    let isCurrent = true;
    async function loadDiscoveryOptions() {
      try {
        const [apiServices, workerLocations] = await Promise.all([
          getServices(),
          getWorkerLocations(),
        ]);
        if (!isCurrent) return;
        const mappedServices = apiServices.map(mapService);
        setServices(mappedServices);
        setLocations(workerLocations);
        setServiceId((current) => mappedServices.some((service) => service.id === current)
          ? current
          : mappedServices[0]?.id ?? "");
        setUserLocation((current) => workerLocations.includes(current)
          ? current
          : user?.city && workerLocations.includes(user.city)
            ? user.city
            : workerLocations[0] ?? "");
      } catch (error) {
        if (isCurrent) setApiError(error instanceof Error ? error.message : "Failed to load discovery options");
      }
    }
    void loadDiscoveryOptions();
    return () => { isCurrent = false; };
  }, [user?.city]);

  useEffect(() => {
    let isCurrent = true;
    async function fetchHistory() {
      try {
        const data = await getUserBookings();
        if (isCurrent) setBookings(data.map(mapBookingRecord));
      } catch (e) {
        console.error("Failed to fetch bookings:", e);
      }
    }
    void fetchHistory();
    return () => { isCurrent = false; };
  }, [user?.id]);

  const activeService = services.find((s) => s.id === serviceId) ?? services[0];

  const handleSearch = async (
    selectedServiceId = serviceId,
    selectedLocation = userLocation,
    selectedBudget = budget,
  ) => {
    setIsLoading(true);
    setApiError(null);

    try {
      if (!selectedServiceId || !selectedLocation.trim()) {
        throw new Error("Choose a service and location before searching.");
      }
      const category =
  categoryMapping[selectedServiceId] || selectedServiceId;

      console.log("SEARCH:", {
        category,
        zone: selectedLocation.trim(),
        budget: parseFloat(selectedBudget) || 1000,
      });
      const zone = selectedLocation.trim();

      const budgetVal = parseFloat(selectedBudget) || 1000;

      const data = await getRecommendedWorkers(
        category,
        zone,
        budgetVal,
      );

      const mappedWorkers: Worker[] = data.map((w: any) => ({
        id: String(w.id),
        name: w.full_name || "Unknown Professional",
        serviceId: String(w.service_id),
        rating: w.rating,
        reviews: w.completed_jobs,
        pricePerHour: w.hourly_rate,
        skills: [services.find((service) => service.id === w.service_id)?.name || w.service_id || "Professional"],
        verified: w.is_verified,
        jobs: w.completed_jobs,
        // Adding these to the Worker type mapping internally
        city: w.city,
        locality: w.locality,
      }));

      setRealWorkers(mappedWorkers);
    } catch (e: any) {
      setApiError(
        e.message ||
          "An error occurred while fetching workers.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const visibleWorkers = useMemo(() => {
    console.log("REAL WORKERS:", realWorkers);
    if (realWorkers.length > 0) {
      return [...realWorkers].sort((a, b) => {
        if (sort === "price") {
          return a.pricePerHour - b.pricePerHour;
        }

        return b.rating - a.rating;
      });
    }

    // No search results are shown until the API returns matching workers.
    return [];
  }, [serviceId, sort, realWorkers]);

  const upcoming = bookings.filter(
    (b) => b.status === "Upcoming",
  );

  const spent = bookings.reduce(
    (sum, b) => sum + (b.paid ? b.amount : 0),
    0,
  );

  return (
    <main className="min-h-screen bg-background pb-20">
      <header className="bg-gradient-navy text-navy-foreground">
        <div className="mx-auto max-w-6xl px-5 pt-10 pb-24 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-gradient-gold font-display text-lg font-bold text-primary-foreground">
                KK
              </span>

              <div>
                <p className="font-display text-lg font-bold leading-none">
                  Kaushal Konnect
                </p>
                <p className="text-xs text-navy-foreground/60">
                  Customer dashboard
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {user?.role === 'admin' && (
                <>
                  <Link
                    to="/worker"
                    className="text-xs uppercase tracking-widest text-navy-foreground/70 hover:text-primary"
                  >
                    Worker view
                  </Link>
                  <Link
                    to="/coop"
                    className="text-xs uppercase tracking-widest text-navy-foreground/70 hover:text-primary"
                  >
                    Co-op view
                  </Link>
                </>
              )}
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    className="flex items-center gap-2 text-xs uppercase tracking-widest text-navy-foreground/70 hover:text-primary hover:bg-navy-foreground/10"
                  >
                    <div className="grid size-6 place-items-center rounded-full bg-gradient-gold text-[10px] font-bold text-primary-foreground">
                      {user?.full_name?.charAt(0) || "U"}
                    </div>
                    My Account
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-full sm:max-w-xl">
                  <SheetHeader className="mb-6">
                    <SheetTitle className="font-display text-2xl font-bold">
                      User Dashboard
                    </SheetTitle>
                  </SheetHeader>
                  <div className="overflow-y-auto h-full pb-10">
                    <CustomerAnalytics bookings={bookings} user={user} />
                  </div>
                </SheetContent>
              </Sheet>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs uppercase tracking-widest text-navy-foreground/70 hover:text-destructive"
                onClick={() => {
                  logout();
                  navigate({ to: '/login' });
                }}
              >
                <LogOut className="mr-2 size-3.5" />
                Logout
              </Button>
              <Badge className="bg-primary/15 text-primary hover:bg-primary/15">
                <BadgeCheck className="mr-1 size-3.5" />
                Verified workers only
              </Badge>
            </div>
          </div>

          <h1 className="mt-10 max-w-xl text-4xl font-bold leading-tight sm:text-5xl">
            Good evening, {user?.full_name || "Guest"}.{" "}
            <span className="text-primary">
              What needs fixing?
            </span>
          </h1>

          <div className="mt-8 grid gap-3 sm:grid-cols-[1.2fr_1fr_0.8fr_auto]">
            <div className="space-y-1.5">
              <Label
                htmlFor="loc"
                className="text-xs uppercase tracking-widest text-navy-foreground/60"
              >
                Your location
              </Label>

              <div className="relative">
              
                <Select value={userLocation} onValueChange={(value) => {
                  setUserLocation(value);
                  void handleSearch(serviceId, value);
                }}>
                  <SelectTrigger
                    id="location"
                    className="border-navy-foreground/15 bg-navy-foreground/5 text-navy-foreground"
                  >
                    <SelectValue placeholder="Choose a location" />
                  </SelectTrigger>

                  <SelectContent>
                    {locations.map((location) => <SelectItem key={location} value={location}>{location}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="service"
                className="text-xs uppercase tracking-widest text-navy-foreground/60"
              >
                Select service
              </Label>

              <Select
                value={serviceId}
                onValueChange={(value) => {
                  setServiceId(value);
                  setRealWorkers([]);
                  setApiError(null);
                  void handleSearch(value);
                }}
              >
                <SelectTrigger
                  id="service"
                  className="border-navy-foreground/15 bg-navy-foreground/5 text-navy-foreground"
                >
                  <SelectValue placeholder="Choose a service" />
                </SelectTrigger>

                <SelectContent>
                  {services.map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="budget"
                className="text-xs uppercase tracking-widest text-navy-foreground/60"
              >
                Your budget (₹)
              </Label>

              <div className="relative">
                <span className="absolute top-1/2 left-3 -translate-y-1/2 text-primary font-bold">₹</span>

                <Input
                  id="budget"
                  type="number"
                  value={budget}
                  onChange={(e) =>
                    setBudget(e.target.value)
                  }
                  placeholder="Max budget"
                  className="border-navy-foreground/15 bg-navy-foreground/5 pl-9 text-navy-foreground placeholder:text-navy-foreground/40"
                />
              </div>
            </div>

            <div className="flex items-end">
              <Button
                className="w-full shadow-gold sm:w-auto"
                onClick={() => {
                  console.log("FIND WORKERS CLICKED");
                  handleSearch();
                }}
                disabled={isLoading}
              >
                {isLoading ? "Searching..." : "Find workers"}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto -mt-16 max-w-6xl px-5 sm:px-8">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            icon={<CalendarDays className="size-5" />}
            label="Upcoming bookings"
            value={String(upcoming.length)}
          />

          <StatCard
            icon={<Receipt className="size-5" />}
            label="Total spent"
            value={currency(spent)}
          />

          <StatCard
            icon={<Star className="size-5" />}
            label="Reviews given"
            value={String(
              bookings.filter((b) => b.rating).length,
            )}
          />
        </div>

        <Tabs defaultValue="browse" className="mt-10">
          <TabsList>
            <TabsTrigger value="browse">
              Browse & book
            </TabsTrigger>
            <TabsTrigger value="history">
              Booking history
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="browse"
            className="mt-6 space-y-8"
          >
            <section>
              <h2 className="text-xl font-bold">
                Available services
              </h2>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {services.map((s) => {
                  const Icon =
                    icons[s.icon as keyof typeof icons];

                  const active = s.id === serviceId;

                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setServiceId(s.id);
                        setRealWorkers([]);
                        setApiError(null);
                        handleSearch(s.id);
                      }}
                      className={`flex items-center gap-4 rounded-xl border p-4 text-left transition-all ${
                        active
                          ? "border-primary bg-accent shadow-gold"
                          : "border-border bg-card hover:border-primary/50 hover:shadow-elevated"
                      }`}
                    >
                      <span
                        className={`grid size-11 shrink-0 place-items-center rounded-lg ${
                          active
                            ? "bg-gradient-gold text-primary-foreground"
                            : "bg-secondary text-secondary-foreground"
                        }`}
                      >
                        <Icon className="size-5" />
                      </span>

                      <span className="min-w-0">
                        <span className="block font-display font-semibold">
                          {s.name}
                        </span>

                        <span className="block truncate text-sm text-muted-foreground">
                          {s.blurb} · from{" "}
                          {currency(s.from)}/hr
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                      <h2 className="text-xl font-bold">
                        {activeService?.name ?? "Workers"} near{" "}
                    {userLocation.split(",")[0] || "you"}
                  </h2>

                  <p className="text-sm text-muted-foreground">
                    {visibleWorkers.length} verified worker
                    {visibleWorkers.length === 1
                      ? ""
                      : "s"}{" "}
                    available
                  </p>
                </div>

                <div className="w-44">
                  <Select
                    value={sort}
                    onValueChange={setSort}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>

                    <SelectContent>
                      <SelectItem value="rating">
                        Top rated
                      </SelectItem>

                      <SelectItem value="price">
                        Lowest price
                      </SelectItem>

                    </SelectContent>
                  </Select>
                </div>
              </div>

              {apiError && (
                <div className="my-4 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm font-medium text-destructive">
                  {apiError}
                </div>
              )}

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {visibleWorkers.map((w) => (
                  <Card
                    key={w.id}
                    className="border-border transition-shadow hover:shadow-elevated"
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <span className="grid size-12 place-items-center rounded-full bg-secondary font-display text-lg font-bold text-secondary-foreground">
                            {w.name.charAt(0)}
                          </span>

                          <div>
                            <p className="flex items-center gap-1.5 font-display font-semibold">
                              {w.name}

                              {w.verified && (
                                <BadgeCheck className="size-4 text-primary" />
                              )}
                            </p>

                            <p className="text-xs text-muted-foreground">
                              {w.jobs} jobs completed
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="font-display text-xl font-bold">
                            {currency(w.pricePerHour)}
                          </p>

                          <p className="text-xs text-muted-foreground">
                            per hour
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                        <span className="flex items-center gap-1 font-medium">
                          <Star className="size-4 fill-primary text-primary" />

                          {w.rating.toFixed(1)}

                          <span className="text-muted-foreground">
                            ({w.reviews})
                          </span>
                        </span>

                        <span className="flex items-center gap-1 text-muted-foreground">
                          <MapPin className="size-4 text-primary" />
                          {(w as any).locality ? `${(w as any).locality}, ${(w as any).city}` : "Location not set"}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {w.skills.map((s) => (
                          <Badge
                            key={s}
                            variant="secondary"
                            className="font-normal"
                          >
                            {s}
                          </Badge>
                        ))}
                      </div>

                      <Button
                        className="mt-5 w-full"
                        onClick={() => setBookingWorker(w)}
                      >
                        Select date & book
                      </Button>
                    </CardContent>
                  </Card>
                ))}

                {visibleWorkers.length === 0 &&
                  !isLoading && (
                    <p className="text-sm text-muted-foreground">
                      No workers match that search for{" "}
                      {activeService?.name ?? "this service"}.
                    </p>
                  )}
              </div>
            </section>
          </TabsContent>

          <TabsContent
            value="history"
            className="mt-6"
          >
            <h2 className="text-xl font-bold">
              Your bookings
            </h2>

            <div className="mt-4 space-y-4">
              {[...bookings].reverse().map((b) => (
                <Card key={b.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                    <div className="min-w-52">
                      <div className="flex items-center gap-2">
                        <p className="font-display font-semibold">
                          {b.serviceName}
                        </p>

                        <Badge
                          variant={
                            b.status === "Upcoming"
                              ? "default"
                              : "secondary"
                          }
                          className="font-normal"
                        >
                          {b.status}
                        </Badge>
                      </div>

                      <p className="mt-1 text-sm text-muted-foreground">
                        {b.workerName} · {b.date} ·{" "}
                        {b.slot} · {b.hours} hr
                      </p>

                      <p className="mt-1 text-xs text-muted-foreground">
                        {b.id} ·{" "}
                        {b.paid
                          ? "Paid"
                          : "Payment pending"}{" "}
                        {currency(b.amount)}
                      </p>

                      {b.rating && (
                        <p className="mt-2 flex items-center gap-1 text-sm">
                          <Star className="size-4 fill-primary text-primary" />

                          {b.rating}/5

                          {b.review && (
                            <span className="text-muted-foreground">
                              — {b.review}
                            </span>
                          )}
                        </p>
                      )}

                      {b.complaint && (
                        <p className="mt-2 text-sm text-destructive">
                          Complaint: {b.complaint}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {b.status === "Completed" && !b.rating && (
                        <Button variant="outline" size="sm" onClick={() => setReviewTarget(b)}>
                          <Star className="mr-1 size-4" /> Rate & review
                        </Button>
                      )}
                      {!b.complaint && b.status !== "Cancelled" && b.status !== "Rejected" && (
                        <Button variant="outline" size="sm" onClick={() => setComplaintTarget(b)}>
                          <MessageSquareWarning className="mr-1 size-4" /> Raise complaint
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <BookingFlow
        worker={bookingWorker}
        serviceName={activeService?.name ?? "Service"}
        location={userLocation}
        onClose={() => setBookingWorker(null)}
        onConfirm={async () => setBookings((await getUserBookings()).map(mapBookingRecord))}
      />

      <ReviewDialog
        booking={reviewTarget}
        onClose={() => setReviewTarget(null)}
        onSubmit={async (id, rating, review) => {
          await createReview({ booking_id: id, rating, comment: review });
          setBookings((await getUserBookings()).map(mapBookingRecord));
        }}
      />

      <ComplaintDialog
        booking={complaintTarget}
        onClose={() => setComplaintTarget(null)}
        onSubmit={async (id, complaint) => {
          await createComplaint({ booking_id: id, description: complaint });
          setBookings((await getUserBookings()).map(mapBookingRecord));
        }}
      />
    </main>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card className="shadow-elevated">
      <CardContent className="flex items-center gap-4 p-5">
        <span className="grid size-11 place-items-center rounded-lg bg-accent text-accent-foreground">
          {icon}
        </span>

        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            {label}
          </p>

          <p className="font-display text-2xl font-bold">
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

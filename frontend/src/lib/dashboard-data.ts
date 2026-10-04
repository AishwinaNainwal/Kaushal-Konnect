export type Service = {
  id: string;
  name: string;
  icon: string;
  from: number;
  blurb: string;
};

export type Worker = {
  id: string;
  name: string;
  serviceId: string;
  rating: number;
  reviews: number;
  pricePerHour: number;
  distanceKm: number;
  skills: string[];
  verified: boolean;
  jobs: number;
};

export type Booking = {
  id: string;
  workerId: string;
  workerName: string;
  serviceName: string;
  date: string;
  slot: string;
  hours: number;
  amount: number;
  status: "Upcoming" | "Completed" | "Cancelled";
  paid: boolean;
  rating?: number;
  review?: string;
  complaint?: string;
};

export const services: Service[] = [
  { id: "home-cleaning", name: "Home Cleaning", icon: "Sparkles", from: 18, blurb: "Deep & regular cleaning" },
  { id: "plumbing", name: "Plumbing", icon: "Wrench", from: 26, blurb: "Leaks, fittings, drainage" },
  { id: "electrical", name: "Electrical", icon: "Zap", from: 30, blurb: "Wiring, fixtures, repairs" },
  { id: "painting", name: "Painting", icon: "Paintbrush", from: 22, blurb: "Interior & exterior walls" },
  { id: "carpentry", name: "Carpentry", icon: "Hammer", from: 28, blurb: "Furniture & fittings" },
  { id: "appliance-repair", name: "Appliance Repair", icon: "Refrigerator", from: 24, blurb: "AC, washer, fridge" },
];

export const workers: Worker[] = [];

export const timeSlots = [
  "08:00 – 10:00",
  "10:00 – 12:00",
  "12:00 – 14:00",
  "14:00 – 16:00",
  "16:00 – 18:00",
  "18:00 – 20:00",
];

export const initialBookings: Booking[] = [];

export const currency = (n: number) => `₹${n.toLocaleString('en-IN')}`;

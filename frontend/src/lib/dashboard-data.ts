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
  status: "Requested" | "Upcoming" | "Completed" | "Cancelled" | "Rejected";
  paid: boolean;
  rating?: number;
  review?: string;
  complaint?: string;
};

export const currency = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export const API_BASE_URL = import.meta.env["VITE_API_URL"] || 'http://localhost:8000';

export interface ApiService {
  id: string;
  name: string;
  description: string | null;
  base_price: number | string | null;
}

export interface ApiAvailabilitySlot {
  slot: string;
  available: boolean;
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('auth_token');
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (response.status === 401) {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    window.location.href = '/login';
  }
  return response;
}

async function readApiError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null);
  return payload?.detail || payload?.message || fallback;
}

export async function getServices(): Promise<ApiService[]> {
  const response = await apiFetch('/services/');
  if (!response.ok) throw new Error(await readApiError(response, 'Failed to load services'));
  return response.json();
}

export async function getWorkerLocations(): Promise<string[]> {
  const response = await apiFetch('/workers/locations');
  if (!response.ok) throw new Error(await readApiError(response, 'Failed to load locations'));
  return response.json();
}

export async function getWorkerAvailability(workerId: string, date: string): Promise<ApiAvailabilitySlot[]> {
  const params = new URLSearchParams({ worker_id: workerId, date });
  const response = await apiFetch(`/bookings/availability?${params}`);
  if (!response.ok) throw new Error(await readApiError(response, 'Failed to load available time slots'));
  const result = await response.json();
  return result.slots;
}

async function authenticatedFetch(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem('auth_token');

  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  headers.set('Content-Type', 'application/json');

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    // Optional: Clear token and redirect to login
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    window.location.href = '/login';
  }

  return response;
}

export async function getRecommendedWorkers(
  category: string,
  zone: string,
  budget: number,
  topN: number = 10
) {
  const params = new URLSearchParams({
    category,
    zone,
    budget: budget.toString(),
    top_n: topN.toString(),
  });

  const response = await authenticatedFetch(
    `${API_BASE_URL}/recommendations/?${params}`
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('No eligible workers found.');
    }

    throw new Error('Failed to fetch recommendations.');
  }

  const data = await response.json();

  console.log("RECOMMENDATION DATA:", data);

  return data;
}

export async function createBooking(bookingData: {
  worker_id: string;
  service_id: string;
  amount: number;
  slot: string;
  booking_date: string;
  payment_method: string;
}) {
  const response = await authenticatedFetch(`${API_BASE_URL}/bookings`, {
    method: 'POST',
    body: JSON.stringify(bookingData),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, 'Failed to create booking'));
  }

  return response.json();
}

export async function getUserBookings() {
  const response = await apiFetch('/bookings/');

  if (!response.ok) {
    throw new Error('Failed to fetch bookings');
  }

  return response.json();
}

export async function createReview(data: { booking_id: string; rating: number; comment: string }) {
  const response = await apiFetch('/reviews/', { method: 'POST', body: JSON.stringify(data) });
  if (!response.ok) throw new Error(await readApiError(response, 'Failed to save review'));
  return response.json();
}

export async function createComplaint(data: { booking_id: string; description: string }) {
  const response = await apiFetch('/complaints/', { method: 'POST', body: JSON.stringify(data) });
  if (!response.ok) throw new Error(await readApiError(response, 'Failed to submit complaint'));
  return response.json();
}

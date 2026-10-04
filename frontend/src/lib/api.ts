export const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://kaushal-konnect.onrender.com';

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
    const errorData = await response.json();
    throw new Error(errorData.detail || errorData.message || 'Failed to create booking');
  }

  return response.json();
}

export async function getUserBookings() {
  const response = await authenticatedFetch(`${API_BASE_URL}/bookings`);

  if (!response.ok) {
    throw new Error('Failed to fetch bookings');
  }

  return response.json();
}

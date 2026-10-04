import { useState, useEffect } from 'react';
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { API_BASE_URL } from '@/lib/api';
import { toast } from 'sonner';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login, user } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
  if (user) {
  if (user.role === 'worker') {
    navigate({ to: '/worker' });
  } else if (user.role === 'coop_manager') {
    navigate({ to: '/coop' });
  } else {
    navigate({ to: '/' });
  }
}
}, [user, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    try {
      // FastAPI OAuth2 expects form data for login
      const formData = new FormData();
      formData.append('username', email);
      formData.append('password', password);

      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Login failed');
      }

      const data = await response.json();
      console.log("Login data received:", data);

      // 1. Update Auth State
      login(data.access_token, data.user);

      // 2. Success feedback
      toast.success('Welcome back!');

      // 3. Redirect based on role will be handled in useEffect after user state updates

    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 bg-cover bg-center bg-no-repeat relative"
      style={{ backgroundImage: "url('/loginbg.png')" }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <Card className="w-full max-w-md relative z-10 bg-card/70 backdrop-blur-md border-white/20">
        <CardHeader className="space-y-1">
  <div className="flex flex-col items-center mb-4">
    <div className="flex items-center gap-3">
      <span className="grid size-10 place-items-center rounded-xl bg-gradient-gold font-display text-lg font-bold text-primary-foreground">
        KK
      </span>

      <p className="font-display text-2xl font-bold">
        Kaushal Konnect
      </p>
    </div>

    <p className="mt-1 text-xs text-muted-foreground">
     Connect. Book. Get it done.
    </p>
  </div>

  <CardTitle className="text-2xl font-bold text-center">Login</CardTitle>
          <CardDescription className="text-center">
            Enter your email and password to access your account
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Logging in...' : 'Login'}
            </Button>
            <div className="text-center text-sm text-muted-foreground">
              Don't have an account?{' '}
              <Link to="/signup" className="text-primary hover:underline font-medium">
                Sign up
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

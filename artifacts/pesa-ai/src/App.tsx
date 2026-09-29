import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ClerkProvider, SignIn, SignUp } from '@clerk/react';
import { clerkAppearance, clerkPubKey, clerkProxyUrl, basePath, stripBase } from '@/lib/clerk-config';
import NotFound from '@/pages/not-found';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

// Pages
import LandingPage from '@/pages/landing';
import LoginPage from '@/pages/login';
import ForgotPasswordPage from '@/pages/forgot-password';
import DashboardPage from '@/pages/dashboard';
import AdminPage from '@/pages/admin';
import PrivacyPage from '@/pages/privacy';
import PublicShopPage from '@/pages/public-shop';
import PublicLocationPage from '@/pages/public-location';
import SetupPage from '@/pages/setup';
import { OwnerLoginPage, OwnerSignupPage } from '@/pages/owner-auth';

const queryClient = new QueryClient();

function ClerkSignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#f7faf8] px-4 py-10">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        forceRedirectUrl={`${basePath}/owner-login`}
      />
    </div>
  );
}

function ClerkSignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#f7faf8] px-4 py-10">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        forceRedirectUrl={`${basePath}/signup`}
      />
    </div>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/sign-in/*?" component={ClerkSignInPage} />
        <Route path="/sign-up/*?" component={ClerkSignUpPage} />
        <Route path="/owner-login" component={OwnerLoginPage} />
        <Route path="/" component={LandingPage} />
        <Route path="/shop/:slug" component={PublicShopPage} />
        <Route path="/l/:token" component={PublicLocationPage} />
        <Route path="/login" component={LoginPage} />
        <Route path="/signup" component={OwnerSignupPage} />
        <Route path="/setup" component={SetupPage} />
        <Route path="/forgot-password" component={ForgotPasswordPage} />
        <Route path="/settings/mpesa" component={DashboardPage} />
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/dashboard/:section" component={DashboardPage} />
        <Route path="/dashboard/:section/:sub" component={DashboardPage} />
        <Route path="/dashboard/:section/:sub/:subsub" component={DashboardPage} />
        <Route path="/admin" component={AdminPage} />
        <Route path="/privacy" component={PrivacyPage} />
        <Route path="/admin/login">{() => { window.location.replace("/admin"); return null; }}</Route>
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: "Welcome back", subtitle: "Sign in to your Pesa SI owner account" } },
        signUp: { start: { title: "Create your Pesa SI owner account", subtitle: "Use Google or a verified email address" } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <Router />
    </ClerkProvider>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={basePath}>
          <ClerkProviderWithRoutes />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

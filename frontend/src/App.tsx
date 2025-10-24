import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { ThemeProvider } from "./components/dashboard/ThemeProvider";
import { AuthProvider } from "./contexts/AuthContext";
import { ProfileProvider } from "./contexts/ProfileContext";
import { ToastProvider } from "./contexts/ToastContext";
import { ConfirmationProvider } from "./contexts/ConfirmationContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useNavigation } from "./hooks/useNavigation";
import { AuthPage } from "./components/auth/AuthPage";
import { EmailVerificationHandler } from "./components/auth/EmailVerificationHandler";
import { SupabaseRedirectHandler } from "./components/auth/SupabaseRedirectHandler";
import { ResetPasswordPage } from "./components/auth/ResetPasswordPage";
import { ProtectedRoute } from "./components/dashboard/ProtectedRoute";
import { PublicRoute } from "./components/dashboard/PublicRoute";
import { Sidebar } from "./components/dashboard/Sidebar";
import { ThemeToggle } from "./components/dashboard/ThemeToggle";
import { Avatar, AvatarFallback, AvatarImage } from "./components/ui/avatar";
import { User, Home, ChevronRight, TrendingUp, Activity, ArrowRightLeft, BookOpen, Star, BarChart3, CreditCard, Shield } from "lucide-react";
 
// Import all dashboard components
import MarketRotationRRG from "./components/market-rotation/MarketRotationRRG";
import MarketRotationRRC from "./components/market-rotation/MarketRotationRRC";
import { MarketRotationSeasonality } from "./components/market-rotation/MarketRotationSeasonality";
import { MarketRotationTrendFilter } from "./components/market-rotation/MarketRotationTrendFilter";
import SeasonalityAnalysis from "./components/SeasonalityAnalysis";
import { BrokerTransaction } from "./components/broker-activity/BrokerTransaction";
import { BrokerSummaryPage } from "./components/broker-activity/BrokerSummaryPage";
import { BrokerInventoryPage } from "./components/broker-activity/BrokerInventoryPage";
import { StockTransactionDoneSummary } from "./components/stock-transaction/StockTransactionDoneSummary";
import { StockTransactionDoneDetail } from "./components/stock-transaction/StockTransactionDoneDetail";
import { StoryAccumulationDistribution } from "./components/story/StoryAccumulationDistribution";
import { StoryMarketParticipant } from "./components/story/StoryMarketParticipant";
import { StoryOwnership } from "./components/story/StoryOwnership";
import { StoryForeignFlow } from "./components/story/StoryForeignFlow";
import { AstrologyLunarCalendar } from "./components/astrology/AstrologyLunarCalendar";
import BaZiCycleAnalyzer from "./components/astrology/BaZiCycleAnalysis";
import { TechnicalAnalysisTradingView } from "./components/technical-analysis/TechnicalAnalysisTradingView";
import { ProfilePage } from "./components/profile/ProfilePage";
import { SubscriptionPage } from "./components/subscription/SubscriptionPage";
import { AdminPage } from "./components/admin/AdminPage";
import { Dashboard } from "./components/dashboard/Dashboard";
import { LandingPage } from "./components/dashboard/LandingPage";
import { PricingPage } from "./components/dashboard/PricingPage";
import { SubscriptionSuccess } from "./components/subscription/SubscriptionSuccess";
import { SubscriptionError } from "./components/subscription/SubscriptionError";
import { SubscriptionPending } from "./components/subscription/SubscriptionPending";
import { FeaturesPage } from "./pages/FeaturesPage";
import { ContactPage } from "./pages/ContactPage";
import { TermsPage } from "./pages/TermsPage";
import { PrivacyPage } from "./pages/PrivacyPage";

// Dashboard Layout Component
function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { profile, isLoading, isAuthenticated } = useNavigation();
  const location = useLocation();
  const navigate = useNavigate();
  const hasRedirected = React.useRef(false);

  // Handle redirect in useEffect to avoid calling navigate during render
  useEffect(() => {
    // Reset redirect flag when user becomes authenticated with profile
    if (isAuthenticated && profile) {
      hasRedirected.current = false;
    }
    
    if (!isLoading && (!profile || !isAuthenticated) && !hasRedirected.current) {
      console.log('DashboardLayout: No profile or not authenticated, redirecting to auth');
      hasRedirected.current = true;
      navigate('/auth', { replace: true });
    }
  }, [isLoading, profile, isAuthenticated, navigate]);

  // Show loading while profile is being fetched
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // If no profile or not authenticated after loading, show loading while redirect happens
  if (!profile || !isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  const toggleSidebar = () => setSidebarOpen((v) => !v);

  // Get current route from URL
  const getCurrentRoute = () => {
    const path = location.pathname;
    if (path === '/profile') return 'profile';
    if (path === '/dashboard' || path === '/dashboard/') return 'dashboard';
    if (path === '/subscription') return 'subscription';
    // Remove leading slash and return the route
    return path.replace('/', '') || 'dashboard';
  };

  const currentRoute = getCurrentRoute();

  // Breadcrumb mapping based on sidebar menu structure
  const breadcrumbMap: Record<string, { title: string; icon?: React.ComponentType<any>; children?: Record<string, string> }> = {
    'dashboard': { title: 'Dashboard', icon: Home },
    'market-rotation': {
      title: 'Market Rotation',
      icon: TrendingUp,
      children: {
        'rrg': 'Relative Rotation Graph',
        'rrc': 'Relative Rotation Curve',
        'seasonality': 'Seasonality',
        'trend-filter': 'Trend Filter',
      },
    },
    'broker-activity': {
      title: 'Broker Activity',
      icon: Activity,
      children: {
        'transaction': 'Broker Transaction',
        'summary': 'Broker Summary',
        'inventory': 'Broker Inventory',
      },
    },
    'stock-transaction': {
      title: 'Stock Transaction',
      icon: ArrowRightLeft,
      children: {
        'done-summary': 'Done Summary',
        'done-detail': 'Done Detail',
      },
    },
    'story': {
      title: 'Story',
      icon: BookOpen,
      children: {
        'accumulation-distribution': 'Accumulation Distribution',
        'market-participant': 'Market Participant',
        'ownership': 'Ownership',
        'foreign-flow': 'Foreign Flow',
      },
    },
    'astrology': { title: 'Astrology', icon: Star, children: { 'lunar': 'Ba Zi & Shio', 'bazi-cycle': 'Ba Zi Cycle Analysis' } },
    'technical-analysis': { title: 'Technical Analysis', icon: BarChart3 },
    'profile': { title: 'Profile' },
    'subscription': { title: 'Subscription', icon: CreditCard },
    'admin': { title: 'Admin', icon: Shield },
  };

  const getBreadcrumbParts = () => {
    const path = location.pathname.replace(/^\/+/, '');
    if (!path || path === 'dashboard') return [{ title: 'Dashboard', icon: Home }];
    const segments = path.split('/');
    const base = segments[0];
    if (!base) return [{ title: 'Dashboard', icon: Home }];
    const entry = breadcrumbMap[base];
    if (!entry) return [{ title: 'Dashboard', icon: Home }];
    const parts: { title: string; icon?: React.ComponentType<any> }[] = [{ title: entry.title, ...(entry.icon && { icon: entry.icon }) }];
    if (segments[1] && entry.children) {
      const child = entry.children[segments[1]];
      if (child) parts.push({ title: child });
    }
    return parts;
  };

  // Handle profile click with debounce
  const handleProfileClick = () => {
    if (location.pathname !== '/profile') {
      navigate('/profile');
    }
  };

  // Render main content based on route
  const renderMainContent = () => {
    switch (currentRoute) {
      // Market Rotation routes
      case "market-rotation":
      case "market-rotation/rrg":
        return <MarketRotationRRG />;
      case "market-rotation/rrc":
        return <MarketRotationRRC />;
      case "market-rotation/seasonality":
        return <MarketRotationSeasonality />;
      case "seasonality":
        return <SeasonalityAnalysis />;
      case "market-rotation/trend-filter":
        return <MarketRotationTrendFilter />;

      // Broker Activity routes
      case "broker-activity":
      case "broker-activity/transaction":
        return <BrokerTransaction />;
      case "broker-activity/summary":
        return <BrokerSummaryPage />;
      case "broker-activity/inventory":
        return <BrokerInventoryPage />;

      // Stock Transaction routes
      case "stock-transaction":
      case "stock-transaction/done-summary":
        return <StockTransactionDoneSummary />;
      case "stock-transaction/done-detail":
        return <StockTransactionDoneDetail />;

      // Story routes
      case "story":
      case "story/accumulation-distribution":
        return <StoryAccumulationDistribution />;
      case "story/market-participant":
        return <StoryMarketParticipant />;
      case "story/ownership":
        return <StoryOwnership />;
      case "story/foreign-flow":
        return <StoryForeignFlow />;

      // Astrology routes
      case "astrology":
      case "astrology/lunar":
        return <AstrologyLunarCalendar />;
      case "astrology/bazi-cycle":
        return <BaZiCycleAnalyzer />;

      // Technical Analysis
      case "technical-analysis":
        return (
          <div className="h-full">
            <TechnicalAnalysisTradingView />
          </div>
        );

      // Profile
      case "profile":
        return <ProfilePage />;

      // Subscription
      case "subscription":
        return <SubscriptionPage />;

      // Admin
      case "admin":
        return <AdminPage />;

      // Dashboard (default)
      case "dashboard":
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
        currentRoute={getCurrentRoute()}
      />

      {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden ml-0 lg:ml-16">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card h-14">
          <div className="flex items-center gap-3">
            {/* Mobile Hamburger Menu */}
            <button
              onClick={toggleSidebar}
              className="lg:hidden p-1.5 rounded-md hover:bg-accent hover:text-accent-foreground active:bg-accent/80 transition-all duration-200"
              aria-label="Toggle sidebar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            
            {/* Breadcrumb Navigation */}
            <nav className="flex items-center space-x-2 text-sm">
              {getBreadcrumbParts().map((part, idx, arr) => (
                <div key={idx} className="flex items-center space-x-2">
                  {idx === 0 && part.icon ? (
                    <part.icon className="w-4 h-4 text-muted-foreground" />
                  ) : idx === 0 ? (
                    <Home className="w-4 h-4 text-muted-foreground" />
                  ) : null}
                  <span className={`whitespace-nowrap ${idx === arr.length - 1 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{part.title}</span>
                  {idx < arr.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                </div>
              ))}
            </nav>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Theme Toggle */}
            <ThemeToggle />
            {/* Profile Button */}
            <div className="relative">
            <button
              onClick={handleProfileClick}
              className="flex items-center gap-2 hover:bg-accent hover:text-accent-foreground active:bg-accent/80 rounded-lg px-3 py-1.5 transition-all duration-200 group relative"
              aria-label="Open profile"
              title="View Profile"
            >
              <Avatar className="h-7 w-7 ring-2 ring-transparent group-hover:ring-blue-200 dark:group-hover:ring-blue-800 transition-all duration-200">
                <AvatarImage src={profile?.avatarUrl || profile?.avatar} alt="User Avatar" />
                <AvatarFallback className="bg-muted text-muted-foreground group-hover:bg-blue-100 dark:group-hover:bg-blue-900 transition-colors duration-200">
                  <User className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div className="hidden sm:block text-left">
                <div className="text-sm font-medium leading-none group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-200">
                  {profile?.full_name || profile?.name || 'User'}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 group-hover:text-blue-500 dark:group-hover:text-blue-300 transition-colors duration-200">
                  {profile?.role || 'Free Plan'}
                </div>
              </div>
              {/* Hover indicator */}
              <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-0 h-0.5 bg-blue-500 group-hover:w-8 transition-all duration-200"></div>
            </button>
            
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto p-6">
          {renderMainContent()}
        </main>
      </div>
    </div>
  );
}

// Navigation wrapper component for public routes
function PublicRouteWrapper() {
  const navigate = useNavigate();
  
  return (
    <Routes>
      {/* Landing page - public route */}
      <Route 
        path="/" 
        element={
          <LandingPage 
            onStartTrial={() => navigate('/auth?mode=register')} 
            onSignIn={() => navigate('/auth?mode=login')}
            onRegister={() => navigate('/auth?mode=register')}
          />
        } 
      />
      <Route path="/features" element={<FeaturesPage />} />
      <Route 
        path="/pricing" 
        element={
          <PricingPage 
            onSignIn={() => navigate('/auth?mode=login')}
            onRegister={() => navigate('/auth?mode=register')}
          />
        } 
      />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      
      {/* Email verification handler */}
      <Route 
        path="/auth/verify" 
        element={<EmailVerificationHandler />} 
      />
      
      {/* Supabase redirect handler for direct email verification */}
      <Route 
        path="/auth/callback" 
        element={<SupabaseRedirectHandler />} 
      />
      
      {/* Password reset page */}
      <Route 
        path="/auth/reset-password" 
        element={<ResetPasswordPage key={window.location.search} />} 
      />
      
      {/* Public routes - redirect to dashboard if authenticated */}
      <Route 
        path="/auth" 
        element={
          <PublicRoute children={<AuthPage />} />
        } 
      />
      
      {/* Protected routes - redirect to auth if not authenticated */}
      <Route 
        path="/dashboard/*" 
        element={
          <ProtectedRoute children={<DashboardLayout />} />
        } 
      />
      
      {/* Profile route - handled by dashboard layout */}
      <Route 
        path="/profile" 
        element={
          <ProtectedRoute children={<DashboardLayout />} />
        } 
      />
      
      {/* Subscription route - handled by dashboard layout */}
      <Route 
        path="/subscription" 
        element={
          <ProtectedRoute children={<DashboardLayout />} />
        } 
      />
      
      {/* Market Rotation routes */}
      <Route 
        path="/market-rotation/*" 
        element={
          <ProtectedRoute children={<DashboardLayout />} />
        } 
      />
      
      {/* Broker Activity routes */}
      <Route 
        path="/broker-activity/*" 
        element={
          <ProtectedRoute children={<DashboardLayout />} />
        } 
      />
      
      {/* Stock Transaction routes */}
      <Route 
        path="/stock-transaction/*" 
        element={
          <ProtectedRoute children={<DashboardLayout />} />
        } 
      />
      
      {/* Story routes */}
      <Route 
        path="/story/*" 
        element={
          <ProtectedRoute children={<DashboardLayout />} />
        } 
      />
      
      {/* Astrology routes */}
      <Route 
        path="/astrology/*" 
        element={
          <ProtectedRoute children={<DashboardLayout />} />
        } 
      />
      
      {/* Technical Analysis route */}
      <Route 
        path="/technical-analysis" 
        element={
          <ProtectedRoute children={<DashboardLayout />} />
        } 
      />
      
      {/* Admin route */}
      <Route 
        path="/admin" 
        element={
          <ProtectedRoute children={<DashboardLayout />} />
        } 
      />
      
      {/* Subscription callback routes */}
      <Route 
        path="/subscription/success" 
        element={<SubscriptionSuccess />} 
      />
      <Route 
        path="/subscription/error" 
        element={<SubscriptionError />} 
      />
      <Route 
        path="/subscription/pending" 
        element={<SubscriptionPending />} 
      />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ConfirmationProvider>
          <AuthProvider>
            <ProfileProvider>
              <Router>
                <ErrorBoundary>
                  <PublicRouteWrapper />
                </ErrorBoundary>
              </Router>
            </ProfileProvider>
          </AuthProvider>
        </ConfirmationProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}


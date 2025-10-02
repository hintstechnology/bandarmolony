import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ThemeProvider } from "./components/ThemeProvider";
import { ProfileProvider, useProfile } from "./contexts/ProfileContext";
import { AuthPage } from "./components/auth/AuthPage";
import { EmailVerificationHandler } from "./components/auth/EmailVerificationHandler";
import { SupabaseRedirectHandler } from "./components/auth/SupabaseRedirectHandler";
import { ResetPasswordPage } from "./components/auth/ResetPasswordPage";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { PublicRoute } from "./components/PublicRoute";
import { Sidebar } from "./components/Sidebar";
import { ThemeToggle } from "./components/ThemeToggle";
import { Avatar, AvatarFallback, AvatarImage } from "./components/ui/avatar";
import { User, Home, ChevronRight, ChevronDown } from "lucide-react";
// Import all dashboard components
import { MarketRotationRRG } from "./components/MarketRotationRRG";
import { MarketRotationRRC } from "./components/MarketRotationRRC";
import { MarketRotationSeasonality } from "./components/MarketRotationSeasonality";
import { MarketRotationTrendFilter } from "./components/MarketRotationTrendFilter";
import { BrokerTransaction } from "./components/BrokerTransaction";
import { BrokerSummaryPage } from "./components/BrokerSummaryPage";
import { BrokerInventoryPage } from "./components/BrokerInventoryPage";
import { StockTransactionDoneSummary } from "./components/StockTransactionDoneSummary";
import { StockTransactionDoneDetail } from "./components/StockTransactionDoneDetail";
import { StoryAccumulationDistribution } from "./components/StoryAccumulationDistribution";
import { StoryMarketParticipant } from "./components/StoryMarketParticipant";
import { StoryOwnership } from "./components/StoryOwnership";
import { StoryForeignFlow } from "./components/StoryForeignFlow";
import { AstrologyLunarCalendar } from "./components/AstrologyLunarCalendar";
import { TechnicalAnalysis } from "./components/TechnicalAnalysis";
import { ProfilePage } from "./components/ProfilePage";
import { SubscriptionPage } from "./components/SubscriptionPage";
import { AdminPage } from "./components/AdminPage";
import { Dashboard } from "./components/Dashboard";
import { LandingPage } from "./components/LandingPage";
import { SubscriptionSuccess } from "./pages/SubscriptionSuccess";
import { SubscriptionError } from "./pages/SubscriptionError";
import { SubscriptionPending } from "./pages/SubscriptionPending";

// Dashboard Layout Component
function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { profile, isLoading } = useProfile();
  const location = useLocation();
  const navigate = useNavigate();

  // Redirect to auth if no profile and not loading
  useEffect(() => {
    if (!isLoading && !profile) {
      navigate('/auth', { replace: true });
    }
  }, [profile, isLoading, navigate]);

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

  // If no profile after loading, show nothing (will redirect)
  if (!profile) {
    return null;
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

  // Handle profile click
  const handleProfileClick = () => {
    navigate('/profile');
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

      // Technical Analysis
      case "technical-analysis":
        return (
          <div className="h-full">
            <TechnicalAnalysis />
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
      <div className="flex-1 flex flex-col overflow-hidden">
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
              <div className="flex items-center space-x-1">
                <Home className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Dashboard</span>
              </div>
              {getCurrentRoute() !== 'dashboard' && (
                <>
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                  <span className="text-foreground font-medium">
                    {getCurrentRoute()
                      .split('/')
                      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
                      .join(' / ')}
                  </span>
                </>
              )}
            </nav>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Notifications */}
            <button className="relative p-1.5 rounded-md hover:bg-accent hover:text-accent-foreground active:bg-accent/80 transition-all duration-200 group">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
            
            {/* Theme Toggle */}
            <ThemeToggle />
            
            {/* Profile Button */}
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
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto p-6">
          {renderMainContent()}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ProfileProvider>
        <Router>
          <Routes>
            {/* Landing page - public route */}
            <Route 
              path="/" 
              element={
                <LandingPage 
                  onStartTrial={() => window.location.href = '/auth?mode=register'} 
                  onSignIn={() => window.location.href = '/auth?mode=login'}
                  onRegister={() => window.location.href = '/auth?mode=register'}
                />
              } 
            />
            
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
              element={<ResetPasswordPage />} 
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
        </Router>
      </ProfileProvider>
    </ThemeProvider>
  );
}

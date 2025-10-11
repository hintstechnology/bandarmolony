import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Home,
  TrendingUp,
  Activity,
  ArrowRightLeft,
  BookOpen,
  Star,
  BarChart3,
  CreditCard,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  LogOut,
  User,
  Pin,
  Shield,
} from "lucide-react";
import { useProfile } from "../../contexts/ProfileContext";
import { useToast } from "../../contexts/ToastContext";
import { api } from "../../services/api";

/** ===== MENU ===== */
const menuItems = [
  { title: "Dashboard", icon: Home, url: "#", route: "dashboard" },
  {
    title: "Market Rotation",
    icon: TrendingUp,
    url: "#",
    route: "market-rotation",
    children: [
      { title: "Relative Rotation Graph", url: "#", route: "market-rotation/rrg" },
      { title: "Relative Rotation Curve", url: "#", route: "market-rotation/rrc" },
      { title: "Seasonality", url: "#", route: "market-rotation/seasonality" },
      { title: "Trend Filter", url: "#", route: "market-rotation/trend-filter" },
    ],
  },
  {
    title: "Broker Activity",
    icon: Activity,
    url: "#",
    route: "broker-activity",
    children: [
      { title: "Broker Transaction", url: "#", route: "broker-activity/transaction" },
      { title: "Broker Summary", url: "#", route: "broker-activity/summary" },
      { title: "Broker Inventory", url: "#", route: "broker-activity/inventory" },
    ],
  },
  {
    title: "Stock Transaction",
    icon: ArrowRightLeft,
    url: "#",
    route: "stock-transaction",
    children: [
      { title: "Done Summary", url: "#", route: "stock-transaction/done-summary" },
      { title: "Done Detail", url: "#", route: "stock-transaction/done-detail" },
    ],
  },
  {
    title: "Story",
    icon: BookOpen,
    url: "#",
    route: "story",
    children: [
      { title: "Accumulation Distribution", url: "#", route: "story/accumulation-distribution" },
      { title: "Market Participant", url: "#", route: "story/market-participant" },
      { title: "Ownership", url: "#", route: "story/ownership" },
      { title: "Foreign Flow", url: "#", route: "story/foreign-flow" },
    ],
  },
  {
    title: "Astrology",
    icon: Star,
    url: "#",
    route: "astrology",
    children: [{ title: "Ba Zi & Shio", url: "#", route: "astrology/lunar" }],
  },
  {
    title: "Technical Analysis",
    icon: BarChart3,
    url: "#",
    route: "technical-analysis",
  },
];

/** ===== BOTTOM MENU ===== */
const bottomMenuItems = [
  { title: "Subscription", icon: CreditCard, url: "#", route: "subscription" },
  { title: "Log out", icon: LogOut, url: "#", route: "logout" },
];

/** ===== ADMIN MENU ===== */
const adminMenuItems = [
  { title: "Admin Dashboard", icon: Shield, url: "#", route: "admin" },
];

interface SidebarProps {
  isOpen: boolean;                 // pinned
  onToggle: () => void;            // toggle pinned
  currentRoute: string;
}

export function Sidebar({
  isOpen,
  onToggle,
  currentRoute,
}: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isHovered, setIsHovered] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const { profile } = useProfile();
  const { showToast } = useToast();
  const [isPinned, setIsPinned] = useState(false);

  const isExpanded = isOpen || isPinned || isHovered;

  const toggleExpanded = (title: string) => {
    setExpandedItems((prev) =>
      prev.includes(title) ? prev.filter((i) => i !== title) : [...prev, title],
    );
  };

  const handlePin = () => {
    setIsPinned(true);
    // Don't call onToggle here, let the parent handle the state
  };

  const handleUnpin = () => {
    setIsPinned(false);
    // Don't call onToggle here, let the parent handle the state
  };

  const handleNavigation = async (route: string) => {
    if (route === 'logout') {
      try {
        await api.logout();
        showToast({
          type: 'success',
          title: 'Logout Berhasil!',
          message: 'Anda telah berhasil logout.',
        });
        navigate('/auth');
      } catch (error) {
        console.error('Logout error:', error);
        // Still navigate to auth even if logout fails
        navigate('/auth');
      }
    } else if (route === '/profile') {
      // Navigate directly to profile page
      navigate('/profile');
      if (window.innerWidth < 1024) onToggle();
    } else if (route === 'dashboard') {
      // Navigate to dashboard
      navigate('/dashboard');
      if (window.innerWidth < 1024) onToggle();
    } else {
      // Navigate to specific routes without /dashboard prefix
      navigate(`/${route}`);
      if (window.innerWidth < 1024) onToggle();
    }
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden bg-black/30 backdrop-blur-[2px]"
          onClick={onToggle}
        />
      )}

      <div
        className={`
          fixed inset-y-0 left-0 z-50 bg-card border-r border-border
          transform transition-all duration-300 ease-in-out h-screen
          ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          ${isExpanded ? "w-64" : "w-16"}
          lg:relative lg:transform-none overflow-hidden
        `}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="relative flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-border h-16">
            {/* Logo kiri – left aligned */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-semibold leading-none text-sm">L</span>
              </div>
              {isExpanded && (
                <span className="text-card-foreground font-semibold whitespace-nowrap">
                  Logo
                </span>
              )}
            </div>

            {/* Panah pin/unpin */}
            {!isOpen && !isPinned && isHovered ? (
              // Show pin icon when hovered in shrink mode
              <button
                type="button"
                onClick={handlePin}
                aria-label="Pin sidebar"
                title="Pin sidebar"
                className="flex items-center justify-center w-8 h-8 rounded-full border border-border bg-background hover:bg-muted transition"
              >
                <Pin className="w-4 h-4" />
              </button>
            ) : isPinned ? (
              // Show unpin button when pinned
              <button
                type="button"
                onClick={handleUnpin}
                aria-label="Unpin sidebar"
                title="Unpin sidebar"
                className="flex items-center justify-center w-8 h-8 rounded-full border border-border bg-background hover:bg-muted transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            ) : (
              // Show normal toggle
              <button
                type="button"
                onClick={onToggle}
                aria-label={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
                title={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
                className="flex items-center justify-center w-8 h-8 rounded-full border border-border bg-background hover:bg-muted transition"
              >
                {isExpanded ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 py-2 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              {/* Admin Menu Items - Only show for admin users - AT THE TOP */}
              {profile?.role === 'admin' && (
                <>
                  {isExpanded && (
                    <div className="px-4 mb-2">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Administration
                      </h3>
                    </div>
                  )}
                  <nav className="space-y-0.5 px-2 mb-4">
                    {adminMenuItems.map((item) => (
                      <div
                        key={item.title}
                        onClick={() => handleNavigation(item.route)}
                        className={`
                          flex items-center gap-3 px-3 py-3 text-sm rounded-md transition-all duration-200 cursor-pointer min-h-12 group
                          ${!isExpanded ? "justify-center" : ""}
                          ${
                            currentRoute === item.route
                              ? "bg-accent text-accent-foreground shadow-sm"
                              : "text-card-foreground hover:bg-accent hover:text-accent-foreground hover:shadow-sm active:bg-accent/80"
                          }
                        `}
                      >
                        <item.icon className="w-5 h-5 flex-shrink-0" />
                        {isExpanded && <span className="whitespace-nowrap text-sm">{item.title}</span>}
                      </div>
                    ))}
                  </nav>
                </>
              )}

              {isExpanded && (
                <div className="px-4 mb-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Dashboard
                  </h3>
                </div>
              )}

              <nav className="space-y-0.5 px-2">
                {menuItems.map((item) => {
                  const active =
                    currentRoute === item.route ||
                    currentRoute.startsWith(item.route + "/");

                  return (
                    <div key={item.title}>
                      <div
                        className={`
                          flex items-center justify-between px-3 py-3 text-sm rounded-md transition-all duration-200 cursor-pointer min-h-12 group
                          ${!isExpanded ? "justify-center" : ""}
                          ${
                            active
                              ? "bg-accent text-accent-foreground shadow-sm"
                              : "text-card-foreground hover:bg-accent hover:text-accent-foreground hover:shadow-sm active:bg-accent/80"
                          }
                        `}
                        onClick={() => {
                          if (item.children && isExpanded) {
                            toggleExpanded(item.title);
                          } else {
                            handleNavigation(item.route);
                          }
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <item.icon className="w-5 h-5 flex-shrink-0" />
                          {isExpanded && (
                            <span className="whitespace-nowrap text-sm">{item.title}</span>
                          )}
                        </div>
                        {item.children && isExpanded && (
                          <div className="flex-shrink-0">
                            {expandedItems.includes(item.title) ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </div>
                        )}
                      </div>

                      {item.children &&
                        isExpanded &&
                        expandedItems.includes(item.title) && (
                          <div className="ml-6 mt-0.5 space-y-0.5">
                            {item.children.map((child) => (
                              <div
                                key={child.title}
                                onClick={() => handleNavigation(child.route)}
                                className={`
                                  block px-2 py-1 text-xs rounded-md transition-all duration-200 cursor-pointer group
                                  ${
                                    currentRoute === child.route
                                      ? "bg-accent text-accent-foreground shadow-sm font-medium"
                                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground hover:shadow-sm active:bg-accent/80"
                                  }
                                `}
                              >
                                {child.title}
                              </div>
                            ))}
                          </div>
                        )}
                    </div>
                  );
                })}
              </nav>
            </div>

            {/* Bottom */}
            <div className="border-t border-border pt-2 px-2 space-y-0.5">
              {/* Profile Menu Item */}
              <div
                onClick={() => handleNavigation('/profile')}
                className={`
                  flex items-center gap-3 px-3 py-3 text-sm rounded-md transition-all duration-200 cursor-pointer min-h-12 group
                  ${!isExpanded ? "justify-center" : ""}
                  ${
                    currentRoute === '/profile'
                      ? "bg-accent text-accent-foreground shadow-sm"
                      : "text-card-foreground hover:bg-accent hover:text-accent-foreground hover:shadow-sm active:bg-accent/80"
                  }
                `}
              >
                <User className="w-5 h-5 flex-shrink-0" />
                {isExpanded && <span className="whitespace-nowrap text-sm">Profile</span>}
              </div>

              {bottomMenuItems.map((item) => (
                <div
                  key={item.title}
                  onClick={() => handleNavigation(item.route)}
                  className={`
                    flex items-center gap-3 px-3 py-3 text-sm rounded-md transition-all duration-200 cursor-pointer min-h-12 group
                    ${!isExpanded ? "justify-center" : ""}
                    ${
                      currentRoute === item.route
                        ? "bg-accent text-accent-foreground shadow-sm"
                        : "text-card-foreground hover:bg-accent hover:text-accent-foreground hover:shadow-sm active:bg-accent/80"
                    }
                  `}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {isExpanded && <span className="whitespace-nowrap text-sm">{item.title}</span>}
                </div>
              ))}

            </div>
          </div>
        </div>
      </div>
    </>
  );
}

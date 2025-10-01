import React, { useState } from "react";
import {
  Home,
  TrendingUp,
  Activity,
  ArrowRightLeft,
  BookOpen,
  Star,
  BarChart3,
  CreditCard,
  User,
  LogOut,
  ChevronDown,
  ChevronRight,
  Sun,
  Moon,
} from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { Button } from "./ui/Button";

const menuItems = [
  { title: "Home", icon: Home, url: "#", route: "home" },
  {
    title: "Market Rotation",
    icon: TrendingUp,
    url: "#",
    route: "market-rotation",
    children: [
      {
        title: "Relative Rotation Graph",
        url: "#",
        route: "market-rotation/rrg",
      },
      {
        title: "Relative Rotation Curve",
        url: "#",
        route: "market-rotation/rrc",
      },
      {
        title: "Seasonality",
        url: "#",
        route: "market-rotation/seasonality",
      },
      {
        title: "Trend Filter",
        url: "#",
        route: "market-rotation/trend-filter",
      },
    ],
  },
  {
    title: "Broker Activity",
    icon: Activity,
    url: "#",
    route: "broker-activity",
    children: [
      {
        title: "Broker Transaction",
        url: "#",
        route: "broker-activity/transaction",
      },
      {
        title: "Broker Summary",
        url: "#",
        route: "broker-activity/summary",
      },
      {
        title: "Broker Inventory",
        url: "#",
        route: "broker-activity/inventory",
      },
    ],
  },
  {
    title: "Stock Transaction",
    icon: ArrowRightLeft,
    url: "#",
    route: "stock-transaction",
    children: [
      {
        title: "Done Summary",
        url: "#",
        route: "stock-transaction/done-summary",
      },
      {
        title: "Done Detail",
        url: "#",
        route: "stock-transaction/done-detail",
      },
    ],
  },
  {
    title: "Story",
    icon: BookOpen,
    url: "#",
    route: "story",
    children: [
      {
        title: "Accumulation Distribution",
        url: "#",
        route: "story/accumulation-distribution",
      },
      {
        title: "Market Participant",
        url: "#",
        route: "story/market-participant",
      },
      {
        title: "Ownership",
        url: "#",
        route: "story/ownership",
      },
      {
        title: "Foreign Flow",
        url: "#",
        route: "story/foreign-flow",
      },
    ],
  },
  {
    title: "Astrology",
    icon: Star,
    url: "#",
    route: "astrology",
    children: [
      {
        title: "Ba Zi & Shio",
        url: "#",
        route: "astrology/lunar",
      },
    ],
  },
  {
    title: "Technical Analysis",
    icon: BarChart3,
    url: "#",
    route: "technical-analysis",
  },
  {
    title: "TA TradingView",
    icon: BarChart3,
    url: "#",
    route: "technical-analysis/tradingview",
  },
];

const bottomMenuItems = [
  {
    title: "Subscription",
    icon: CreditCard,
    url: "#",
    route: "subscription",
  },
  { title: "Profile", icon: User, url: "#", route: "profile" },
  { title: "Log out", icon: LogOut, url: "#", route: "logout" },
];

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  currentRoute: string;
  onRouteChange: (route: string) => void;
}

export function Sidebar({
  isOpen,
  onToggle,
  currentRoute,
  onRouteChange,
}: SidebarProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>(
    [],
  );
  const { theme, toggleTheme } = useTheme();

  const isExpanded = isOpen || isHovered;

  const toggleExpanded = (title: string) => {
    setExpandedItems((prev) =>
      prev.includes(title)
        ? prev.filter((item) => item !== title)
        : [...prev, title],
    );
  };

  const handleNavigation = (route: string) => {
    onRouteChange(route);
    if (window.innerWidth < 1024) {
      onToggle();
    }
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar - Fixed height, no scroll */}
      <div
        className={`
          fixed inset-y-0 left-0 z-50 bg-sidebar border-r border-sidebar-border transform transition-all duration-300 ease-in-out h-screen
          ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          ${isExpanded ? "w-64" : "w-16"}
        `}
        onMouseEnter={() => {
          setIsHovered(true);
          // Close any open dropdowns while hover-expanded to avoid repaint/layout shift
          if (!isOpen) {
            setExpandedItems([]);
          }
        }}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="flex flex-col h-full">
          {/* Header - Fixed height */}
          <div className="flex items-center justify-between p-3 border-b border-sidebar-border h-16 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-sidebar-primary rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-sidebar-primary-foreground font-semibold">
                  L
                </span>
              </div>
              {isExpanded && (
                <span className="text-sidebar-foreground font-semibold whitespace-nowrap">
                  Logo
                </span>
              )}
            </div>
            {isExpanded && (
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleTheme}
                className="p-2 flex-shrink-0"
              >
                {theme === "dark" ? (
                  <Sun className="w-4 h-4 text-sidebar-foreground" />
                ) : (
                  <Moon className="w-4 h-4 text-sidebar-foreground" />
                )}
              </Button>
            )}
          </div>

          {/* Menu Items - Flexible area, no scroll */}
          <div className="flex-1 py-2 flex flex-col justify-between min-h-0">
            <div>
              {isExpanded && (
                <div className="px-4 mb-2">
                  <h3 className="text-xs font-semibold text-sidebar-foreground/60 uppercase tracking-wider">
                    Dashboard
                  </h3>
                </div>
              )}
              <nav className="space-y-0.5 px-2">
                {menuItems.map((item) => (
                  <div key={item.title}>
                    <div
                      className={`
                        flex items-center justify-between px-2 py-1.5 text-sm rounded-md transition-colors cursor-pointer
                        ${!isExpanded ? "justify-center" : ""}
                        ${
                          currentRoute === item.route ||
                          currentRoute.startsWith(
                            item.route + "/",
                          )
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        }
                      `}
                      onClick={() => {
                        if (
                          item.children &&
                          isExpanded
                        ) {
                          toggleExpanded(item.title);
                        } else {
                          handleNavigation(item.route);
                        }
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <item.icon className="w-4 h-4 flex-shrink-0" />
                        {isExpanded && (
                          <span className="whitespace-nowrap text-xs">
                            {item.title}
                          </span>
                        )}
                      </div>
                      {item.children && isExpanded && (
                        <div className="flex-shrink-0">
                          {expandedItems.includes(
                            item.title,
                          ) ? (
                            <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ChevronRight className="w-3 h-3" />
                          )}
                        </div>
                      )}
                    </div>

                    {/* Dropdown Menu */}
                    {item.children &&
                      isExpanded &&
                      expandedItems.includes(item.title) && (
                        <div className="ml-6 mt-0.5 space-y-0.5">
                          {item.children.map((child) => (
                            <div
                              key={child.title}
                              onClick={() =>
                                handleNavigation(child.route)
                              }
                              className={`
                              block px-2 py-1 text-xs rounded-md transition-colors cursor-pointer
                              ${
                                currentRoute === child.route
                                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                              }
                            `}
                            >
                              {child.title}
                            </div>
                          ))}
                        </div>
                      )}
                  </div>
                ))}
              </nav>
            </div>

            {/* Bottom Menu - Fixed at bottom */}
            <div className="border-t border-sidebar-border pt-2 px-2 space-y-0.5">
              {bottomMenuItems.map((item) => (
                <div
                  key={item.title}
                  onClick={() => handleNavigation(item.route)}
                  className={`
                    flex items-center gap-3 px-2 py-1.5 text-sm rounded-md transition-colors cursor-pointer
                    ${!isExpanded ? "justify-center" : ""}
                    ${
                      currentRoute === item.route
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    }
                  `}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {isExpanded && (
                    <span className="whitespace-nowrap text-xs">
                      {item.title}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
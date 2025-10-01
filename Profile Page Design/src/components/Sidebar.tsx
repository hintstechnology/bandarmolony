import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { 
  Home, 
  TrendingUp, 
  Activity, 
  ArrowLeftRight, 
  BookOpen, 
  Star, 
  BarChart3, 
  CreditCard,
  User,
  LogOut,
  Menu,
  ChevronRight
} from "lucide-react";
import { cn } from "./ui/utils";

interface SidebarProps {
  currentPage?: string;
  onPageChange?: (page: string) => void;
}

const menuItems = [
  { id: "home", label: "Home", icon: Home },
  { id: "market-rotation", label: "Market Rotation", icon: TrendingUp },
  { id: "broker-activity", label: "Broker Activity", icon: Activity },
  { id: "stock-transaction", label: "Stock Transaction", icon: ArrowLeftRight },
  { id: "story", label: "Story", icon: BookOpen },
  { id: "astrology", label: "Astrology", icon: Star },
  { id: "technical-analysis", label: "Technical Analysis", icon: BarChart3 },
];

const bottomItems = [
  { id: "subscription", label: "Subscription", icon: CreditCard },
  { id: "profile", label: "Profile", icon: User },
  { id: "logout", label: "Log out", icon: LogOut },
];

export function Sidebar({ currentPage = "profile", onPageChange }: SidebarProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setIsExpanded(false);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleItemClick = (id: string) => {
    if (onPageChange) {
      onPageChange(id);
    }
    // Auto collapse on mobile after selection
    if (isMobile) {
      setIsExpanded(false);
    }
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isMobile && isExpanded && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden" 
          onClick={() => setIsExpanded(false)}
        />
      )}
      
      <div className={cn(
        "h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300 ease-in-out",
        "flex-shrink-0",
        isExpanded ? "w-56" : "w-16",
        isMobile && "fixed left-0 top-0 z-50"
      )}>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="p-4 border-b border-sidebar-border">
          <div className="flex items-center justify-between">
            <div className={cn(
              "flex items-center space-x-3 transition-opacity duration-200",
              !isExpanded && "opacity-0"
            )}>
              <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
                <span className="text-sidebar font-bold text-sm">L</span>
              </div>
              {isExpanded && (
                <span className="text-sidebar-foreground font-medium">Logo</span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-sidebar-foreground hover:bg-sidebar-accent p-2"
            >
              <Menu className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Main Menu Items */}
        <div className="flex-1 py-4">
          <nav className="space-y-1 px-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              
              return (
                <Button
                  key={item.id}
                  variant="ghost"
                  onClick={() => handleItemClick(item.id)}
                  className={cn(
                    "w-full justify-start h-10 px-3 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors",
                    isActive && "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary",
                    !isExpanded && "justify-center px-0"
                  )}
                >
                  <Icon className={cn("h-4 w-4", isExpanded && "mr-3")} />
                  {isExpanded && (
                    <>
                      <span className="truncate">{item.label}</span>
                      {(item.id === "market-rotation" || item.id === "broker-activity" || 
                        item.id === "stock-transaction" || item.id === "story" || 
                        item.id === "astrology") && (
                        <ChevronRight className="h-3 w-3 ml-auto" />
                      )}
                    </>
                  )}
                </Button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Items */}
        <div className="border-t border-sidebar-border p-2 space-y-1">
          {bottomItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            
            return (
              <Button
                key={item.id}
                variant="ghost"
                onClick={() => handleItemClick(item.id)}
                className={cn(
                  "w-full justify-start h-10 px-3 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors",
                  isActive && "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary",
                  !isExpanded && "justify-center px-0",
                  item.id === "logout" && "text-destructive hover:text-destructive hover:bg-destructive/10"
                )}
              >
                <Icon className={cn("h-4 w-4", isExpanded && "mr-3")} />
                {isExpanded && <span className="truncate">{item.label}</span>}
              </Button>
            );
          })}
        </div>
      </div>
      </div>
    </>
  );
}
import { Home, TrendingUp, Activity, ArrowRightLeft, BookOpen, Star, BarChart3, CreditCard, User, LogOut } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
} from "./ui/sidebar";

const menuItems = [
  {
    title: "Home",
    icon: Home,
    url: "#",
  },
  {
    title: "Market Relations",
    icon: TrendingUp,
    url: "#",
  },
  {
    title: "Broker Activity",
    icon: Activity,
    url: "#",
  },
  {
    title: "Stock Transaction",
    icon: ArrowRightLeft,
    url: "#",
  },
  {
    title: "Story",
    icon: BookOpen,
    url: "#",
  },
  {
    title: "Astrology",
    icon: Star,
    url: "#",
  },
  {
    title: "Technical Analysis",
    icon: BarChart3,
    url: "#",
  },
];

const bottomMenuItems = [
  {
    title: "Subscription",
    icon: CreditCard,
    url: "#",
  },
  {
    title: "Profile",
    icon: User,
    url: "#",
  },
  {
    title: "Log out",
    icon: LogOut,
    url: "#",
  },
];

export function DashboardSidebar() {
  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-4 py-2">
          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
            <span className="text-primary-foreground">L</span>
          </div>
          <span>Logo</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Dashboard</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <a href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {bottomMenuItems.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild>
                <a href={item.url}>
                  <item.icon />
                  <span>{item.title}</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
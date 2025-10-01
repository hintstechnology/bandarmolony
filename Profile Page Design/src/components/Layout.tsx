import { useState, ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

interface LayoutProps {
  children: ReactNode;
  currentPage?: string;
}

const pageNames: Record<string, string> = {
  home: "Dashboard",
  "market-rotation": "Market Rotation", 
  "broker-activity": "Broker Activity",
  "stock-transaction": "Stock Transaction",
  story: "Story",
  astrology: "Astrology",
  "technical-analysis": "Technical Analysis",
  subscription: "Subscription",
  profile: "Profile",
};

export function Layout({ children, currentPage = "profile" }: LayoutProps) {
  const [selectedPage, setSelectedPage] = useState(currentPage);

  const handlePageChange = (pageId: string) => {
    setSelectedPage(pageId);
    // In a real app, you would handle routing here
    if (pageId === "logout") {
      // Handle logout logic
      console.log("Logout clicked");
      return;
    }
  };

  const pageName = pageNames[selectedPage] || "Page";

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <Sidebar 
        currentPage={selectedPage} 
        onPageChange={handlePageChange}
      />
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 md:ml-0">
        {/* Header */}
        <Header pageName={pageName} />
        
        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          <div className="h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
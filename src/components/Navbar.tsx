import React from 'react';
import { Menu } from 'lucide-react';
import { Button } from './ui/Button';

interface NavbarProps {
  onToggleSidebar: () => void;
}

export function Navbar({ onToggleSidebar }: NavbarProps) {
  return (
    <nav className="bg-card border-b border-border px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleSidebar}
          className="lg:hidden"
        >
          <Menu className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold text-card-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Welcome back! Here's your trading overview.</p>
        </div>
      </div>
      
      {/* Additional navbar items can be added here */}
      <div className="flex items-center gap-2">
        {/* Space for future navbar items */}
      </div>
    </nav>
  );
}
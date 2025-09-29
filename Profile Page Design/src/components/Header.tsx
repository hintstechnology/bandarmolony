import { ThemeToggle } from "./ThemeToggle";
import { Button } from "./ui/button";
import { User } from "lucide-react";

interface HeaderProps {
  pageName: string;
}

export function Header({ pageName }: HeaderProps) {
  return (
    <header className="h-14 border-b border-border bg-background px-4 sm:px-6 flex items-center justify-between flex-shrink-0">
      <div className="min-w-0 flex-1">
        <h1 className="font-medium text-foreground truncate">{pageName}</h1>
      </div>
      
      <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0">
        <ThemeToggle />
        <Button variant="ghost" size="sm" className="rounded-full p-2">
          <User className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
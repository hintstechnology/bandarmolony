import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../ThemeProvider';
import { getImageUrl } from '../../utils/imageMapping';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className="min-h-screen flex">
      {/* Background Image Section */}
      <div className="hidden lg:flex lg:flex-1 relative">
        <img
          src={getImageUrl('auth/auth_bg.jpg')}
          alt="Modern cityscape background"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/20" />
        <div className="absolute bottom-4 left-4 text-white/80 text-sm">
          Photo by{' '}
          <a 
            href="https://unsplash.com/@antjt" 
            target="_blank" 
            rel="noopener noreferrer"
            className="underline hover:text-white transition-colors"
          >
            Anthony Tyrrell
          </a>
        </div>
      </div>

      {/* Auth Form Section */}
      <div className="flex-1 lg:flex-none lg:w-[480px] relative bg-background">
        {/* Dark Mode Toggle */}
        <button
          onClick={toggleTheme}
          className="absolute top-6 right-6 p-2 rounded-lg hover:bg-accent transition-colors"
          aria-label="Toggle dark mode"
        >
          {theme === 'dark' ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
        </button>

        {/* Form Container */}
        <div className="flex flex-col justify-center min-h-screen px-8 lg:px-12">
          <div className="w-full max-w-sm mx-auto">
            {children}
          </div>
        </div>

        {/* Footer */}
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex items-center justify-center space-x-4 text-sm text-muted-foreground">
          <div className="flex items-center space-x-2">
          </div>
        </div>
      </div>
    </div>
  );
}
import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { getImageUrl } from '../../utils/imageMapping.ts';

interface AuthLayoutProps {
  children: React.ReactNode;
  onBackToLanding?: () => void;
}

export function AuthLayout({ children, onBackToLanding }: AuthLayoutProps) {
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

        {onBackToLanding && (
          <button
            type="button"
            onClick={onBackToLanding}
            className="absolute top-6 left-6 inline-flex items-center gap-2 rounded-full bg-black/40 px-4 py-2 text-sm font-medium text-white backdrop-blur transition hover:bg-black/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Kembali ke landing page</span>
          </button>
        )}

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

import React from 'react';

interface LogoProps {
  className?: string;
  showText?: boolean;
  textClassName?: string;
  iconClassName?: string;
  badgeClassName?: string;
}

const Logo: React.FC<LogoProps> = ({ 
  className = '', 
  showText = true, 
  textClassName = '',
  iconClassName = '',
  badgeClassName = ''
}) => {
  // Get Supabase URL from environment
  const getSupabaseUrl = () => {
    return (import.meta as any).env?.VITE_SUPABASE_URL || 'https://bandarmolony.supabase.co';
  };

  // Get logo URL for the NY badge
  const getLogoUrl = () => {
    return `${getSupabaseUrl()}/storage/v1/object/public/assets/images/logo_bandarmolony.png`;
  };

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Text "Bandarmolo" */}
      {showText && (
        <span className={`font-bold text-white ${textClassName}`}>Bandarmolo</span>
      )}

      {/* Logo Image (NY badge with chart) */}
      <div className={`relative flex items-center justify-center bg-white rounded-lg shadow-md ${badgeClassName}`} style={{ aspectRatio: '1.2' }}>
        <img
          src={getLogoUrl()}
          alt="Bandarmolony Logo"
          className="w-full h-full object-contain p-2"
          style={{ 
            objectFit: 'contain',
            maxWidth: '100%',
            maxHeight: '100%',
            width: 'auto',
            height: 'auto'
          }}
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            // Fallback if image fails to load
            const fallback = e.currentTarget.nextElementSibling as HTMLElement;
            if (fallback) {
              fallback.style.display = 'inline';
            }
          }}
        />
        {/* Fallback text if image fails to load */}
        <span className="absolute text-xs font-bold text-gray-500 hidden">NY</span>
      </div>
    </div>
  );
};

export default Logo;

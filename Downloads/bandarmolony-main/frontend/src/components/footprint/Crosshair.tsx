import React from 'react';
import { CrosshairData } from './FootprintChart';

interface CrosshairProps {
  data: CrosshairData;
  chartHeight: number;
}

export const Crosshair: React.FC<CrosshairProps> = ({ data, chartHeight }) => {
  if (!data.visible) return null;

  // Get theme colors
  const getThemeColors = () => {
    const isDark = document.documentElement.classList.contains('dark');
    return {
      crosshairColor: isDark ? '#3b82f6' : '#2962FF',
      tooltipBackground: isDark ? '#1E222D' : '#FFFFFF',
      tooltipBorder: isDark ? '#2A2E39' : '#E1E3E6',
      textColor: isDark ? '#f9fafb' : '#191919',
      mutedTextColor: isDark ? '#9ca3af' : '#787B86',
      bidColor: '#2962FF',
      askColor: '#F23645',
      deltaPositiveColor: '#26A69A',
      deltaNegativeColor: '#F23645'
    };
  };

  const themeColors = getThemeColors();

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Horizontal Line */}
      <div
        className="absolute left-0 right-0 h-px z-50"
        style={{ 
          top: data.y,
          backgroundColor: themeColors.crosshairColor
        }}
      />
      
      {/* Vertical Line */}
      <div
        className="absolute top-0 w-px z-50"
        style={{ 
          left: data.x,
          height: chartHeight,
          backgroundColor: themeColors.crosshairColor
        }}
      />
      
      {/* Price Label - On Y-Axis */}
      <div
        className="absolute transform -translate-y-1/2"
        style={{ 
          top: data.y,
          right: '0px', // On the Y-axis edge
          zIndex: 9999999 // Higher than axis z-index
        }}
      >
        <div className="px-2 py-1 rounded text-xs font-medium shadow-lg backdrop-blur-none" style={{
          backgroundColor: themeColors.crosshairColor,
          color: '#FFFFFF'
        }}>
          {data.price.toFixed(0)} {/* Price level from bid/ask volume (whole numbers) */}
        </div>
      </div>
      
      {/* Time Label - On X-Axis */}
      <div
        className="absolute transform -translate-x-1/2"
        style={{ 
          left: data.x,
          bottom: '0px', // On the X-axis edge
          zIndex: 9999999 // Higher than axis z-index
        }}
      >
        <div className="px-2 py-1 rounded text-xs font-medium shadow-lg backdrop-blur-none" style={{
          backgroundColor: themeColors.crosshairColor,
          color: '#FFFFFF'
        }}>
          {data.time}
        </div>
      </div>
      
      {/* Tooltip */}
      <div
        className="absolute z-30 pointer-events-none"
        style={{
          left: data.x + 20,
          top: data.y - 100, // Move tooltip above crosshair
          transform: data.x > (typeof window !== 'undefined' ? window.innerWidth : 1200) - 200 ? 'translateX(-100%)' : undefined
        }}
      >
        <div className="backdrop-blur-sm rounded shadow-lg p-3 text-xs" style={{
          backgroundColor: themeColors.tooltipBackground,
          border: `1px solid ${themeColors.tooltipBorder}`,
          color: themeColors.textColor
        }}>
          <div className="space-y-1">
            <div className="flex justify-between gap-4">
              <span style={{ color: themeColors.mutedTextColor }}>Price:</span>
              <span className="font-medium" style={{ color: themeColors.textColor }}>{data.price.toFixed(0)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span style={{ color: themeColors.mutedTextColor }}>Time:</span>
              <span className="font-medium" style={{ color: themeColors.textColor }}>{data.time}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span style={{ color: themeColors.mutedTextColor }}>Bid Vol:</span>
              <span className="font-medium" style={{ color: themeColors.bidColor }}>{data.bidVol}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span style={{ color: themeColors.mutedTextColor }}>Ask Vol:</span>
              <span className="font-medium" style={{ color: themeColors.askColor }}>{data.askVol}</span>
            </div>
            <div className="flex justify-between gap-4 border-t pt-1" style={{ borderTopColor: themeColors.tooltipBorder }}>
              <span style={{ color: themeColors.mutedTextColor }}>Delta:</span>
              <span 
                className="font-bold"
                style={{ 
                  color: data.delta >= 0 ? themeColors.deltaPositiveColor : themeColors.deltaNegativeColor
                }}
              >
                {data.delta >= 0 ? '+' : ''}{data.delta}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

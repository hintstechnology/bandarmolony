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
      // Crosshair color per request
      crosshairColor: '#9FA2AA',
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
      {/* Horizontal & Vertical dashed crosshair (5px dash, 2px gap, 1px thick) */}
      <svg className="absolute inset-0 z-50" width="100%" height="100%">
        <line x1={0} y1={data.y} x2={'100%'} y2={data.y} stroke={themeColors.crosshairColor} strokeWidth={1} strokeDasharray="5 2" strokeOpacity={0.75} />
        <line x1={data.x} y1={0} x2={data.x} y2={'100%'} stroke={themeColors.crosshairColor} strokeWidth={1} strokeDasharray="5 2" strokeOpacity={0.75} />
      </svg>
      
      {/* Labels now rendered by Axis to ensure they are within axis layers */}
      
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
              <span className="font-medium" style={{ color: themeColors.textColor }}>
                {(() => {
                  try {
                    const date = new Date(data.time);
                    if (isNaN(date.getTime())) {
                      throw new Error('Invalid date');
                    }
                    
                    const day = date.getDate().toString().padStart(2, '0');
                    const month = date.toLocaleDateString('en-US', { month: 'short' });
                    const year = date.getFullYear().toString().slice(-2);
                    return `${day} ${month} '${year}`;
                  } catch (error) {
                    return data.time;
                  }
                })()}
              </span>
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

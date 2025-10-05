import React from 'react';
import { CrosshairData } from './FootprintChart';

interface CrosshairProps {
  data: CrosshairData;
  chartHeight: number;
}

export const Crosshair: React.FC<CrosshairProps> = ({ data, chartHeight }) => {
  if (!data.visible) return null;

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Horizontal Line */}
      <div
        className="absolute left-0 right-0 h-px z-50"
        style={{ 
          top: data.y,
          backgroundColor: '#2962FF'
        }}
      />
      
      {/* Vertical Line */}
      <div
        className="absolute top-0 w-px z-50"
        style={{ 
          left: data.x,
          height: chartHeight,
          backgroundColor: '#2962FF'
        }}
      />
      
      {/* Price Label - Mepet ke kanan */}
      <div
        className="absolute transform -translate-y-1/2"
        style={{ 
          top: data.y,
          right: '10px', // Mepet ke kanan dengan margin kecil
          zIndex: 9999999 // Higher than axis z-index
        }}
      >
        <div className="px-2 py-1 rounded text-xs font-medium shadow-lg backdrop-blur-none" style={{
          backgroundColor: '#2962FF',
          color: '#FFFFFF'
        }}>
          {data.price.toFixed(0)} {/* Price level from bid/ask volume (whole numbers) */}
        </div>
      </div>
      
      {/* Time Label - Mepet ke bawah */}
      <div
        className="absolute transform -translate-x-1/2"
        style={{ 
          left: data.x,
          top: chartHeight - 10, // Mepet ke bawah dengan margin kecil
          zIndex: 9999999 // Higher than axis z-index
        }}
      >
        <div className="px-2 py-1 rounded text-xs font-medium shadow-lg backdrop-blur-none" style={{
          backgroundColor: '#2962FF',
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
          transform: data.x > window.innerWidth - 200 ? 'translateX(-100%)' : undefined
        }}
      >
        <div className="backdrop-blur-sm rounded shadow-lg p-3 text-xs" style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E1E3E6'
        }}>
          <div className="space-y-1">
            <div className="flex justify-between gap-4">
              <span style={{ color: '#787B86' }}>Price:</span>
              <span className="font-medium" style={{ color: '#191919' }}>{data.price.toFixed(0)}</span> {/* Price level from bid/ask volume (whole numbers) */}
            </div>
            <div className="flex justify-between gap-4">
              <span style={{ color: '#787B86' }}>Time:</span>
              <span className="font-medium" style={{ color: '#191919' }}>{data.time}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span style={{ color: '#787B86' }}>Bid Vol:</span>
              <span className="font-medium" style={{ color: '#2962FF' }}>{data.bidVol}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span style={{ color: '#787B86' }}>Ask Vol:</span>
              <span className="font-medium" style={{ color: '#F23645' }}>{data.askVol}</span>
            </div>
            <div className="flex justify-between gap-4 border-t pt-1" style={{ borderTopColor: '#E1E3E6' }}>
              <span style={{ color: '#787B86' }}>Delta:</span>
              <span 
                className="font-bold"
                style={{ 
                  color: data.delta >= 0 ? '#26A69A' : '#F23645'
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
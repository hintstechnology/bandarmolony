import React, { memo } from 'react';
import { VolumeLevel } from './FootprintChart';

interface VolumeBarProps {
  level: VolumeLevel;
  y: number;
  width: number;
  maxVolume: number;
  maxBarWidth: number;
  bodyWidth: number;
  isPOCBid: boolean;
  isPOCAsk: boolean;
  showDelta: boolean;
}

export const VolumeBar: React.FC<VolumeBarProps> = memo(({
  level,
  y,
  width,
  maxVolume,
  maxBarWidth,
  bodyWidth,
  isPOCBid,
  isPOCAsk,
  showDelta
}) => {
  const barHeight = 16;
  const centerX = width / 2;
  const bodyHalfWidth = bodyWidth / 2;
  
  // Calculate bar widths proportional to volume - make them visually different
  const totalVolume = level.bidVolume + level.askVolume;
  const bidRatio = totalVolume > 0 ? level.bidVolume / totalVolume : 0.5;
  const askRatio = totalVolume > 0 ? level.askVolume / totalVolume : 0.5;
  
  const bidBarWidth = Math.max(bidRatio * maxBarWidth * 0.8, level.bidVolume > 0 ? 20 : 0);
  const askBarWidth = Math.max(askRatio * maxBarWidth * 0.8, level.askVolume > 0 ? 20 : 0);
  
  // Delta calculation
  const delta = level.askVolume - level.bidVolume;
  const deltaColor = delta >= 0 ? '#00C853' : '#D50000';
  
  // POC styling - separate for bid and ask (same golden color)
  const pocBidStyle = isPOCBid ? {
    backgroundColor: '#A58B00', // Golden color for bid POC
    boxShadow: '0 0 4px rgba(165, 139, 0, 0.3)',
    border: '1px solid #A58B00'
  } : {};
  
  const pocAskStyle = isPOCAsk ? {
    backgroundColor: '#A58B00', // Golden color for ask POC
    boxShadow: '0 0 4px rgba(165, 139, 0, 0.3)',
    border: '1px solid #A58B00'
  } : {};
  
  // Debug: log volume bar position
  console.log('VolumeBar Debug:', {
    price: level.price,
    y,
    barHeight,
    bidVol: level.bidVolume,
    askVol: level.askVolume
  });

  return (
    <div
      className="absolute flex items-center volume-bar"
      data-volume-level="true"
      data-price={level.price}
      data-bid-volume={level.bidVolume}
      data-ask-volume={level.askVolume}
      style={{
        top: y,
        left: 0,
        width,
        height: barHeight
      }}
    >
      {/* Bid Bar (Left side) */}
      <div
        className="flex items-center justify-end"
        style={{
          width: centerX - bodyHalfWidth - 2,
          height: barHeight - 2,
          marginRight: 2
        }}
      >
        <div
          className={`h-full flex items-center justify-end pr-1 ${
            isPOCBid ? 'bg-[#A58B00] border border-[#A58B00]' : 'bg-[#FF6B6B] border border-[#FF4444]'
          }`}
          style={{ 
            width: bidBarWidth,
            minWidth: level.bidVolume > 0 ? 20 : 0,
            ...pocBidStyle
          }}
        >
          <span className="font-medium text-white" style={{ fontSize: '0.6rem' }}>
            {level.bidVolume}
          </span>
        </div>
      </div>
      
      {/* Candlestick Body Space (No Price Label) */}
      <div
        className="flex items-center justify-center"
        style={{
          width: bodyWidth,
          height: barHeight - 2
        }}
      >
        {/* Empty space for candlestick */}
      </div>
      
      {/* Ask Bar (Right side) */}
      <div
        className="flex items-center justify-start"
        style={{
          width: centerX - bodyHalfWidth - 2,
          height: barHeight - 2,
          marginLeft: 2
        }}
      >
        <div
          className={`h-full flex items-center justify-start pl-1 ${
            isPOCAsk ? 'bg-[#A58B00] border border-[#A58B00]' : 'bg-[#4CAF50] border border-[#2E7D32]'
          }`}
          style={{ 
            width: askBarWidth,
            minWidth: level.askVolume > 0 ? 20 : 0,
            ...pocAskStyle
          }}
        >
          <span className="font-medium text-white" style={{ fontSize: '0.6rem' }}>
            {level.askVolume}
          </span>
        </div>
      </div>
      
      {/* Delta Indicator */}
      {showDelta && (
        <div
          className="absolute right-1 top-0 bottom-0 flex items-center"
          style={{ color: deltaColor }}
        >
          <span className="font-bold" style={{ fontSize: '0.6rem' }}>
            {delta >= 0 ? '+' : ''}{delta}
          </span>
        </div>
      )}
      
    </div>
  );
});
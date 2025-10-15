import React, { memo } from 'react';
import { CandleData } from './FootprintChart';
import { VolumeBar } from './VolumeBar';

interface CandlestickBarProps {
  data: CandleData;
  index: number;
  width: number;
  height: number;
  minPrice: number;
  maxPrice: number;
  showPOC: boolean;
  showDelta: boolean;
  zoom: number;
  verticalScale: number;
  horizontalScale: number;
}

export const CandlestickBar: React.FC<CandlestickBarProps> = memo(({
  data,
  index,
  width,
  height,
  minPrice,
  maxPrice,
  showPOC,
  showDelta,
  zoom,
  verticalScale,
  horizontalScale
}) => {
  const priceRange = maxPrice - minPrice;
  
  // Calculate candlestick positions using provided height to match Y axis
  const CHART_HEIGHT = height;
  const getYPosition = (price: number) => {
    // True center-based scaling: expand equally up and down from center
    const centerY = CHART_HEIGHT / 2;
    // Calculate position relative to center of price range
    const midPrice = (maxPrice + minPrice) / 2;
    const priceOffset = (price - midPrice) / priceRange;
    // Scale from center: expand equally in both directions
    const halfScaledRange = (CHART_HEIGHT * verticalScale) / 2;
    return centerY - priceOffset * halfScaledRange;
  };
  
  // Calculate actual price range from volume levels
  const volumePrices = data.volumeLevels.map(level => level.price);
  const actualMinPrice = Math.min(...volumePrices);
  const actualMaxPrice = Math.max(...volumePrices);
  const actualPriceRange = actualMaxPrice - actualMinPrice;
  
  // Use volume-based positioning for candlestick - use CHART_HEIGHT to match Y axis
  const getVolumeBasedYPosition = (price: number) => {
    // True center-based scaling for volume-based positioning
    const centerY = CHART_HEIGHT / 2;
    // Calculate position relative to center of actual price range
    const midPrice = (actualMaxPrice + actualMinPrice) / 2;
    const priceOffset = (price - midPrice) / actualPriceRange;
    // Scale from center: expand equally in both directions
    const halfScaledRange = (CHART_HEIGHT * verticalScale) / 2;
    return centerY - priceOffset * halfScaledRange;
  };
  
  // Get volume bars height range - use CHART_HEIGHT to match Y axis
  const volumeBarTop = Math.min(...data.volumeLevels.map(level => getYPosition(level.price)));
  const volumeBarBottom = Math.max(...data.volumeLevels.map(level => getYPosition(level.price)));
  const volumeBarHeight = volumeBarBottom - volumeBarTop;
  
  // Calculate candlestick positions but limit to volume bars height - use CHART_HEIGHT to match Y axis
  const openY = Math.max(volumeBarTop, Math.min(volumeBarBottom, getVolumeBasedYPosition(data.open)));
  const closeY = Math.max(volumeBarTop, Math.min(volumeBarBottom, getVolumeBasedYPosition(data.close)));
  const highY = Math.max(volumeBarTop, Math.min(volumeBarBottom, getVolumeBasedYPosition(data.high)));
  const lowY = Math.max(volumeBarTop, Math.min(volumeBarBottom, getVolumeBasedYPosition(data.low)));
  
  const bodyTop = Math.min(openY, closeY);
  const bodyHeight = Math.abs(closeY - openY);
  const bodyWidth = 8;
  const bodyLeft = width / 2 - bodyWidth / 2;
  
  const isGreen = data.close > data.open;
  const wickLeft = width / 2 - 1;
  
  // Find maximum volume for scaling
  const maxVolume = Math.max(...data.volumeLevels.map(level => level.totalVolume));
  const maxBarWidth = (width - bodyWidth) / 2 - 10; // Leave space for candlestick
  
  return (
    <div 
      className="absolute"
      style={{
        left: index * width,
        top: 0,
        width,
        height: height
      }}
    >
      {/* Volume Bars */}
      {data.volumeLevels.map((level, levelIndex) => {
        const y = getYPosition(level.price);
        const isPOCBid = showPOC && level.price === data.pocBid;
        const isPOCAsk = showPOC && level.price === data.pocAsk;
        
        // Debug: log Y position calculation
        if (levelIndex === 0) {
          console.log('CandlestickBar Y Position Debug:', {
            price: level.price,
            maxPrice,
            minPrice,
            priceRange,
            height,
            CHART_HEIGHT,
            zoom,
            verticalScale,
            calculatedY: y,
            expectedY: ((maxPrice - level.price) / priceRange) * CHART_HEIGHT * zoom * verticalScale
          });
        }
        
        return (
          <VolumeBar
            key={`volume-${index}-${levelIndex}`}
            level={level}
            y={y}
            width={width}
            maxVolume={maxVolume}
            maxBarWidth={maxBarWidth}
            bodyWidth={bodyWidth}
            isPOCBid={isPOCBid}
            isPOCAsk={isPOCAsk}
            showDelta={showDelta}
          />
        );
      })}
      
      {/* Candlestick Wick */}
      <div
        className="absolute bg-gray-400"
        style={{
          left: wickLeft,
          top: highY,
          width: 2,
          height: lowY - highY
        }}
      />
      
      {/* Candlestick Body */}
      <div
        className={`absolute border ${
          isGreen 
            ? 'bg-[#00C853] border-[#00C853]' 
            : 'bg-[#D50000] border-[#D50000]'
        }`}
        style={{
          left: bodyLeft,
          top: bodyTop,
          width: bodyWidth,
          height: Math.max(bodyHeight, 2), // Minimum height for doji
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}
      />
      

      

    </div>
  );
});

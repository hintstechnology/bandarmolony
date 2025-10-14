import React from 'react';

interface AxisProps {
  type: 'x' | 'y';
  data: any[];
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
  zoom: number;
  verticalScale: number;
  minPrice: number;
  maxPrice: number;
  candleWidth: number;
  chartHeight: number;
  theme: 'light' | 'dark';
  onAxisDrag?: (type: 'x' | 'y', delta: number) => void;
  onAxisDoubleClick?: (type: 'x' | 'y') => void;
  // Crosshair (optional) to render labels inside axis areas
  crosshairX?: number;
  crosshairY?: number;
  crosshairPrice?: number;
  crosshairTime?: string;
  showCrosshair?: boolean;
}

export const Axis: React.FC<AxisProps> = ({
  type,
  data,
  width,
  height,
  scrollX,
  scrollY,
  zoom,
  verticalScale,
  minPrice,
  maxPrice,
  candleWidth,
  chartHeight,
  theme,
  onAxisDrag,
  onAxisDoubleClick,
  crosshairX,
  crosshairY,
  crosshairPrice,
  crosshairTime,
  showCrosshair
}) => {
  const isDark = theme === 'dark';
  const gridColor = isDark ? '#2a2a2a' : '#e0e0e0';
  const textColor = isDark ? '#d1d4dc' : '#191919'; // Lightweight-charts text color
  const lineColor = isDark ? '#444' : '#ccc';
  const backgroundColor = isDark ? '#020817' : '#FFFFFF'; // Updated dark background color

  // Drag functionality for axis scaling
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const startY = e.clientY;
    const startX = e.clientX;
    
    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - startY;
      const deltaX = e.clientX - startX;
      
      if (type === 'x' && onAxisDrag) {
        // X-axis: Only horizontal movement (deltaX)
        onAxisDrag('x', deltaX);
      } else if (type === 'y' && onAxisDrag) {
        // Y-axis: Only vertical movement (deltaY)
        onAxisDrag('y', deltaY);
      }
    };
    
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onAxisDoubleClick) {
      onAxisDoubleClick(type);
    }
  };

  if (type === 'x') {
    // X-axis: lines for each rendered bar
    const visibleBars = Math.ceil(width / candleWidth);
    const startIndex = Math.floor(scrollX / candleWidth);
    const endIndex = Math.min(startIndex + visibleBars + 1, data.length);

    return (
      <div 
        className="absolute left-0 right-0 w-full h-full cursor-ew-resize"
        style={{
          backgroundColor: backgroundColor,
          borderTop: `1px solid ${isDark ? '#2B2B43' : '#E1E3E6'}`,
          borderBottom: `1px solid ${isDark ? '#2B2B43' : '#E1E3E6'}`,
          borderLeft: `1px solid ${isDark ? '#2B2B43' : '#E1E3E6'}`,
          borderRight: `1px solid ${isDark ? '#2B2B43' : '#E1E3E6'}`,
          borderBottomLeftRadius: '8px',
          borderBottomRightRadius: '8px',
          zIndex: 10,
          bottom: 0,
          left: 0,
          right: 0,
          height: '24px',
          pointerEvents: 'auto'
        }}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      >
        <svg width={width} height={24} className="absolute bottom-0 left-0">
          {/* Grid lines for each bar */}
          {Array.from({ length: endIndex - startIndex }, (_, i) => {
            const index = startIndex + i;
            const x = index * candleWidth - scrollX;
            const candle = data[index];
            
            if (!candle || x < -candleWidth || x > width + candleWidth) return null;

            return (
              <g key={index}>
                {/* Vertical grid line */}
                <line
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={24}
                  stroke={lineColor}
                  strokeWidth={0.5}
                />
                {/* Time label */}
                <text
                  x={x + candleWidth / 2}
                  y={18}
                  textAnchor="middle"
                  fontSize="12"
                  fontFamily="'-apple-system', 'BlinkMacSystemFont', 'Trebuchet MS', 'Roboto', 'Ubuntu', sans-serif"
                  fontWeight="400"
                  fill={textColor}
                  className="select-none"
                >
                  {(() => {
                    try {
                      const date = new Date(candle.timestamp);
                      const day = date.getDate().toString().padStart(2, '0');
                      const month = date.toLocaleDateString('en-US', { month: 'short' });
                      const year = date.getFullYear().toString().slice(-2);
                      return `${day} ${month} '${year}`;
                    } catch {
                      return candle.timestamp.split(' ')[1] || candle.timestamp;
                    }
                  })()}
                </text>
              </g>
            );
          })}
        </svg>
        {/* Crosshair vertical line inside X-axis to visually connect */}
        {showCrosshair && typeof crosshairX === 'number' && (
          <div
            className="absolute bottom-0 w-px"
            style={{ left: crosshairX, height: 24, backgroundColor: '#9FA2AA', opacity: 0.75 }}
          />
        )}
        {/* Crosshair time label inside X-axis */}
        {showCrosshair && typeof crosshairX === 'number' && crosshairTime && (
          <div
            className="absolute transform -translate-x-1/2 text-xs font-medium"
            style={{
              left: crosshairX,
              top: 0,
              backgroundColor: '#131722',
              color: '#FFFFFF',
              lineHeight: 1.2,
              fontWeight: 600,
              padding: '0.28125rem 1.125rem',
              borderTopLeftRadius: '0px',
              borderTopRightRadius: '0px',
              borderBottomLeftRadius: '3px',
              borderBottomRightRadius: '3px'
            }}
          >
            {(() => {
              try {
                const date = new Date(crosshairTime);
                if (isNaN(date.getTime())) {
                  throw new Error('Invalid date');
                }
                
                const day = date.getDate().toString().padStart(2, '0');
                const month = date.toLocaleDateString('en-US', { month: 'short' });
                const year = date.getFullYear().toString().slice(-2);
                return `${day} ${month} '${year}`;
              } catch (error) {
                return crosshairTime;
              }
            })()}
          </div>
        )}
      </div>
    );
  }

  if (type === 'y') {
    // Y-axis: lines for each price level
    const priceRange = maxPrice - minPrice;
    const visibleHeight = height * zoom * verticalScale;
    const priceStep = priceRange / 20;
    const startPrice = Math.floor(minPrice / priceStep) * priceStep;
    const endPrice = Math.ceil(maxPrice / priceStep) * priceStep;

    return (
      <div 
        className="absolute top-0 bottom-0 w-full h-full cursor-ns-resize"
        style={{
          backgroundColor: backgroundColor,
          borderTop: `1px solid ${isDark ? '#2B2B43' : '#E1E3E6'}`,
          borderBottom: `1px solid ${isDark ? '#2B2B43' : '#E1E3E6'}`,
          borderLeft: `1px solid ${isDark ? '#2B2B43' : '#E1E3E6'}`,
          borderRight: `1px solid ${isDark ? '#2B2B43' : '#E1E3E6'}`,
          borderTopRightRadius: '8px',
          borderBottomRightRadius: '8px',
          zIndex: 10,
          top: 0,
          bottom: 0,
          right: 0,
          width: '64px',
          pointerEvents: 'auto'
        }}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      >
        <svg width={64} height={height} className="absolute right-0 top-0">
          {/* Grid lines for each price level */}
          {Array.from({ length: Math.ceil((endPrice - startPrice) / priceStep) + 1 }, (_, i) => {
            const price = startPrice + i * priceStep;
            if (price < minPrice || price > maxPrice) return null;

            // True center-based scaling to match chart
            const centerY = height / 2;
            // Calculate position relative to center of price range
            const midPrice = (maxPrice + minPrice) / 2;
            const priceOffset = (price - midPrice) / priceRange;
            // Scale from center: expand equally in both directions
            const halfScaledRange = (height * verticalScale) / 2;
            const y = centerY - priceOffset * halfScaledRange + scrollY;
            
            if (y < -50 || y > height + 50) return null;

            return (
              <g key={price}>
                {/* Horizontal grid line */}
                <line
                  x1={0}
                  y1={y}
                  x2={64}
                  y2={y}
                  stroke={lineColor}
                  strokeWidth={0.5}
                />
                {/* Price label hidden intentionally (main label drawn by Crosshair) */}
              </g>
            );
          })}
        </svg>
        {/* Crosshair horizontal line inside Y-axis to visually connect (ensure visible above grid) */}
        {showCrosshair && typeof crosshairY === 'number' && (
          <div
            className="absolute left-0 right-0 h-px"
            style={{ top: Math.min(Math.max(0, crosshairY), height - 1), backgroundColor: '#9FA2AA', opacity: 0.75 }}
          />
        )}
        {/* Crosshair price label inside Y-axis */}
        {showCrosshair && typeof crosshairY === 'number' && typeof crosshairPrice === 'number' && (
          <div
            className="absolute transform -translate-y-1/2 text-xs font-medium"
            style={{
              top: crosshairY,
              left: 0,
              backgroundColor: '#131722',
              color: '#FFFFFF',
              lineHeight: 1.2,
              fontWeight: 600,
              padding: '0.28125rem 1.125rem',
              borderTopLeftRadius: '0px',
              borderBottomLeftRadius: '0px',
              borderTopRightRadius: '3px',
              borderBottomRightRadius: '3px'
            }}
          >
            {crosshairPrice.toFixed(0)}
          </div>
        )}
      </div>
    );
  }

  return null;
};

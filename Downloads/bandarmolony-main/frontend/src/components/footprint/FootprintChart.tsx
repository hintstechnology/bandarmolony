import React, { useState, useRef, useCallback, useEffect } from 'react';
import { CandlestickBar } from './CandlestickBar';
import { Crosshair } from './Crosshair';
import { Axis } from './Axis';

export interface VolumeLevel {
  price: number;
  bidVolume: number;
  askVolume: number;
  totalVolume: number;
}

export interface CandleData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volumeLevels: VolumeLevel[];
  pocBid: number; // Point of Control for Bid - price with highest bid volume
  pocAsk: number; // Point of Control for Ask - price with highest ask volume
}

export interface CrosshairData {
  x: number;
  y: number;
  price: number;
  time: string;
  bidVol: number;
  askVol: number;
  delta: number;
  visible: boolean;
}

// Generate dummy data for demonstration
const generateDummyData = (): CandleData[] => {
  const data: CandleData[] = [];
  const basePrice = 1230;
  // Generate more data for better scrolling experience
  const times = [];
  for (let hour = 9; hour <= 16; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      times.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
    }
  }
  
  for (let i = 0; i < times.length; i++) {
    const open = basePrice + (Math.random() - 0.5) * 10 + i * 0.5;
    const close = open + (Math.random() - 0.5) * 5;
    const high = Math.max(open, close) + Math.random() * 3;
    const low = Math.min(open, close) - Math.random() * 3;
    
    // Generate volume levels around OHLC range - optimized
    const volumeLevels: VolumeLevel[] = [];
    const priceStep = 0.5; // Larger step for better performance
    const minPrice = low - 1.5;
    const maxPrice = high + 1.5;
    
    let maxBidVolume = 0;
    let maxAskVolume = 0;
    let pocBidPrice = 0;
    let pocAskPrice = 0;
    
    for (let price = minPrice; price <= maxPrice; price += priceStep) {
      const roundedPrice = Math.round(price * 100) / 100;
      
      // Higher volume around OHLC levels
      let volumeMultiplier = 1;
      if (Math.abs(price - open) < 0.5 || Math.abs(price - close) < 0.5 ||
          Math.abs(price - high) < 0.3 || Math.abs(price - low) < 0.3) {
        volumeMultiplier = 2.5;
      }
      
      const bidVolume = Math.floor(Math.random() * 600 * volumeMultiplier) + 50;
      const askVolume = Math.floor(Math.random() * 600 * volumeMultiplier) + 50;
      const totalVolume = bidVolume + askVolume;
      
      // Track POC for Bid (highest bid volume)
      if (bidVolume > maxBidVolume) {
        maxBidVolume = bidVolume;
        pocBidPrice = roundedPrice;
      }
      
      // Track POC for Ask (highest ask volume)
      if (askVolume > maxAskVolume) {
        maxAskVolume = askVolume;
        pocAskPrice = roundedPrice;
      }
      
      volumeLevels.push({
        price: roundedPrice,
        bidVolume,
        askVolume,
        totalVolume
      });
    }
    
    data.push({
      timestamp: times[i],
      open,
      high,
      low,
      close,
      volumeLevels,
      pocBid: pocBidPrice,
      pocAsk: pocAskPrice
    });
  }
  
  return data;
};

interface FootprintChartProps {
  showCrosshair?: boolean;
  showPOC?: boolean;
  showDelta?: boolean;
  timeframe?: string;
  zoom?: number;
}

export const FootprintChart: React.FC<FootprintChartProps> = ({
  showCrosshair: propShowCrosshair,
  showPOC: propShowPOC,
  showDelta: propShowDelta,
  timeframe: propTimeframe,
  zoom: propZoom
}) => {
  const [data] = useState<CandleData[]>(generateDummyData());
  const [crosshair, setCrosshair] = useState<CrosshairData>({
    x: 0, y: 0, price: 0, time: '', bidVol: 0, askVol: 0, delta: 0, visible: false
  });
  // Chart dimensions and layout - responsive
  const CHART_HEIGHT = Math.max(400, (typeof window !== 'undefined' ? window.innerHeight : 800) - 250); // Responsive height
  const PRICE_LEVEL_HEIGHT = 16;

  const [showCrosshair, setShowCrosshair] = useState(propShowCrosshair ?? true);
  const [showPOC, setShowPOC] = useState(propShowPOC ?? true);
  const [showDelta, setShowDelta] = useState(propShowDelta ?? false);
  const [timeframe, setTimeframe] = useState(propTimeframe ?? '15m');
  const [zoom, setZoom] = useState(propZoom ?? 1.1);
  
  // Theme detection
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  
  // Chart dimensions
  const [chartWidth, setChartWidth] = useState(800);
  const [chartHeight, setChartHeight] = useState(400);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragMode, setDragMode] = useState<'none' | 'pan' | 'zoom'>('none');
  const [verticalScale, setVerticalScale] = useState(1.6); // Default 160%
  const [horizontalScale, setHorizontalScale] = useState(1.5); // Default 150%
  const [containerHeight, setContainerHeight] = useState(400);
  const [isDoubleClicking, setIsDoubleClicking] = useState(false);
  const [lastPinchDistance, setLastPinchDistance] = useState(0);
  const [isPinching, setIsPinching] = useState(false);
  const [showPanIndicator, setShowPanIndicator] = useState(false);

  // Sync props with state
  useEffect(() => {
    if (propShowCrosshair !== undefined) setShowCrosshair(propShowCrosshair);
    if (propShowPOC !== undefined) setShowPOC(propShowPOC);
    if (propShowDelta !== undefined) setShowDelta(propShowDelta);
    if (propTimeframe !== undefined) setTimeframe(propTimeframe);
    if (propZoom !== undefined) setZoom(propZoom);
  }, [propShowCrosshair, propShowPOC, propShowDelta, propTimeframe, propZoom]);

  // Theme detection
  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setTheme(isDark ? 'dark' : 'light');
  }, []);

  // Update chart dimensions
  useEffect(() => {
    const updateDimensions = () => {
      const container = chartRef.current?.parentElement?.parentElement; // Get the main container
      if (container) {
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        
        // Set chart dimensions to fill the container
        setChartWidth(containerWidth - 64); // Subtract Y-axis width
        setChartHeight(containerHeight - 24); // Subtract X-axis height
        
        // Update container height state
        setContainerHeight(containerHeight);
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Auto scroll to last bar when data changes or component mounts
  useEffect(() => {
    if (data.length > 0) {
      const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
      const visibleBars = Math.floor(screenWidth / CANDLE_WIDTH);
      const rightMargin = screenWidth * 0.1; // 10% of screen width for better margin
      const totalBars = data.length;
      
      // Debug: Calculate different approaches
      const approach1 = Math.max(0, (totalBars - visibleBars) * CANDLE_WIDTH + rightMargin);
      const approach2 = Math.max(0, (totalBars - 1) * CANDLE_WIDTH - screenWidth + rightMargin);
      const approach3 = Math.max(0, totalBars * CANDLE_WIDTH - screenWidth + rightMargin);
      
      // Use approach 3 - show the very last bar
      const lastCandlePosition = approach3;
      
      setScrollX(lastCandlePosition);
      console.log('🔍 DEBUG Auto scroll to last bar:', {
        totalBars,
        visibleBars,
        screenWidth,
        CANDLE_WIDTH,
        rightMargin,
        approach1: `(${totalBars} - ${visibleBars}) * ${CANDLE_WIDTH} + ${rightMargin} = ${approach1}`,
        approach2: `(${totalBars} - 1) * ${CANDLE_WIDTH} - ${screenWidth} + ${rightMargin} = ${approach2}`,
        approach3: `${totalBars} * ${CANDLE_WIDTH} - ${screenWidth} + ${rightMargin} = ${approach3}`,
        selected: lastCandlePosition,
        totalChartWidth: totalBars * CANDLE_WIDTH,
        shouldShowLastBar: lastCandlePosition >= (totalBars - 1) * CANDLE_WIDTH - screenWidth
      });
      
      // Verify scroll position after a short delay
      setTimeout(() => {
        console.log('🔍 VERIFY Scroll position after delay:', {
          currentScrollX: scrollX,
          expectedScrollX: lastCandlePosition,
          isCorrect: Math.abs(scrollX - lastCandlePosition) < 10
        });
      }, 100);
    }
  }, [data.length]);

  // Get theme colors from the main app
  const getThemeColors = () => {
    const isDark = document.documentElement.classList.contains('dark');
    return {
      textColor: isDark ? '#f9fafb' : '#111827',
      gridColor: isDark ? '#4b5563' : '#e5e7eb',
      borderColor: isDark ? '#6b7280' : '#d1d5db',
      axisTextColor: isDark ? '#d1d5db' : '#6b7280',
      backgroundColor: isDark ? '#131722' : '#FFFFFF',
      cardBackground: isDark ? '#1E222D' : '#FFFFFF',
      cardBorder: isDark ? '#2A2E39' : '#E1E3E6'
    };
  };

  const themeColors = getThemeColors();
  
  const chartRef = useRef<HTMLDivElement>(null);
  
  // Update container height on mount and resize
  useEffect(() => {
    const updateHeight = () => {
      setContainerHeight(window.innerHeight - 80);
    };
    
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);
  
  // Chart dimensions with scaling
  const CANDLE_WIDTH = 120 * horizontalScale; // Apply horizontal scaling
  
  // Auto-scroll to show the last candles by default with 5% right margin
  const totalBars = data.length;
  const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const visibleBars = Math.floor(screenWidth / CANDLE_WIDTH);
  const rightMargin = screenWidth * 0.1; // 10% of screen width for better margin
  // Calculate position to show the very last bar with margin
  const lastCandlePosition = Math.max(0, totalBars * CANDLE_WIDTH - screenWidth + rightMargin);
  
  const [scrollX, setScrollX] = useState(lastCandlePosition);
  const [scrollY, setScrollY] = useState(0);
  
  // Calculate price range
  const allPrices = data.flatMap(candle => 
    candle.volumeLevels.map(level => level.price)
  );
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const priceRange = maxPrice - minPrice;
  
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!chartRef.current || !showCrosshair) return;
    
    const rect = chartRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Calculate which candle
    const candleIndex = Math.floor((x + scrollX) / CANDLE_WIDTH);
    
    if (candleIndex >= 0 && candleIndex < data.length) {
      const candle = data[candleIndex];
      
      // Visual-based detection: Check if mouse is over any volume bar element
      const elementsAtPoint = document.elementsFromPoint(e.clientX, e.clientY);
      
      // Look for volume bar elements (they have specific data attributes)
      let detectedLevel: VolumeLevel | null = null;
      let detectedY = y;
      
      // Check if we're over a volume bar by looking for elements with volume data
      for (const element of elementsAtPoint) {
        // Check if this is a volume bar element by looking for data attributes or classes
        if (element.getAttribute('data-volume-level') === 'true' || 
            element.classList.contains('volume-bar')) {
          
          // Extract volume data from the element
          const price = parseFloat(element.getAttribute('data-price') || '0');
          const bidVol = parseInt(element.getAttribute('data-bid-volume') || '0');
          const askVol = parseInt(element.getAttribute('data-ask-volume') || '0');
          
          // Find the matching level in our data
          const matchingLevel = candle.volumeLevels.find(level => 
            Math.abs(level.price - price) < 0.01 &&
            level.bidVolume === bidVol &&
            level.askVolume === askVol
          );
          
          if (matchingLevel) {
            detectedLevel = matchingLevel;
            // Get the actual visual position of the element
            const elementRect = element.getBoundingClientRect();
            detectedY = elementRect.top - rect.top + (elementRect.height / 2);
            break;
          }
        }
      }
      
      if (detectedLevel) {
        setCrosshair({
          x,
          y: detectedY,
          price: detectedLevel.price, // Price level from bid/ask volume detection
          time: candle.timestamp,
          bidVol: detectedLevel.bidVolume,
          askVol: detectedLevel.askVolume,
          delta: detectedLevel.askVolume - detectedLevel.bidVolume,
          visible: true
        });
      }
    }
  }, [data, scrollX, scrollY, zoom, verticalScale, maxPrice, priceRange, showCrosshair]);
  
  const handleMouseLeave = useCallback(() => {
    setCrosshair(prev => ({ ...prev, visible: false }));
  }, []);
  
  const handleScroll = useCallback((deltaX: number, deltaY: number) => {
    setScrollX(prev => {
      const newScrollX = prev + deltaX;
      const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
      const maxScrollX = Math.max(0, data.length * CANDLE_WIDTH - screenWidth);
      return Math.max(0, Math.min(maxScrollX, newScrollX));
    });
    setScrollY(prev => {
      const newScrollY = prev + deltaY;
      // Allow panning above highest bar by adding extra space (50% of chart height)
      const extraSpace = CHART_HEIGHT * 0.5;
      const maxScrollY = CHART_HEIGHT * zoom * verticalScale - CHART_HEIGHT + extraSpace;
      const minScrollY = -extraSpace; // Allow negative scroll to pan above
      return Math.max(minScrollY, Math.min(maxScrollY, newScrollY));
    });
  }, [data.length, CANDLE_WIDTH, CHART_HEIGHT, zoom, verticalScale]);
  
  const handleZoom = useCallback((delta: number) => {
    setZoom(prev => Math.max(0.5, Math.min(3, prev + delta)));
  }, []);

  const handleVerticalScale = useCallback((delta: number) => {
    setVerticalScale(prev => {
      const newScale = Math.max(0.5, Math.min(3, prev + delta));
      console.log('Vertical Scale:', { from: prev, to: newScale, percentage: Math.round(newScale * 100) + '%' });
      return newScale;
    });
  }, []);

  const handleYAxisDrag = useCallback((deltaY: number) => {
    const scaleDelta = deltaY * -0.001; // Less sensitive scaling
    setVerticalScale(prev => {
      const newScale = Math.max(0.5, Math.min(3, prev + scaleDelta));
      console.log('Vertical Scale (Drag):', { from: prev, to: newScale, percentage: Math.round(newScale * 100) + '%' });
      return newScale;
    });
  }, []);

  const handleXAxisDrag = useCallback((deltaX: number) => {
    const scaleDelta = deltaX * 0.0003; // Fixed: drag left (negative deltaX) = zoom in, drag right (positive deltaX) = zoom out
    setHorizontalScale(prev => {
      const newScale = Math.max(0.5, Math.min(3, prev + scaleDelta));
      console.log('Horizontal Scale:', { from: prev, to: newScale, percentage: Math.round(newScale * 100) + '%', deltaX, scaleDelta });
      return newScale;
    });
  }, []);

  const handleAxisDrag = useCallback((type: 'x' | 'y', delta: number) => {
    if (type === 'x') {
      handleXAxisDrag(delta);
    } else if (type === 'y') {
      handleYAxisDrag(delta);
    }
  }, [handleXAxisDrag, handleYAxisDrag]);

  const handleAxisDoubleClick = useCallback((type: 'x' | 'y') => {
    if (type === 'x') {
      setHorizontalScale(1); // Reset horizontal scale to 1
      console.log('Horizontal Scale Reset to 100%');
    } else if (type === 'y') {
      setVerticalScale(1.1); // Reset vertical scale to 1.1x (default zoom)
      console.log('Vertical Scale Reset to 110%');
    }
  }, []);

  // Calculate distance between two touch points
  const getPinchDistance = useCallback((touches: TouchList) => {
    if (touches.length < 2) return 0;
    const touch1 = touches[0];
    const touch2 = touches[1];
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  // Handle pinch gesture for horizontal scaling
  const handlePinch = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.touches.length === 2) {
      const currentDistance = getPinchDistance(e.touches);
      
      if (lastPinchDistance > 0) {
        const scaleChange = (currentDistance - lastPinchDistance) * 0.01;
        setHorizontalScale(prev => {
          const newScale = Math.max(0.5, Math.min(3, prev - scaleChange)); // Invert for pinch behavior
          console.log('Pinch Scale:', { from: prev, to: newScale, percentage: Math.round(newScale * 100) + '%' });
          return newScale;
        });
      }
      
      setLastPinchDistance(currentDistance);
      setIsPinching(true);
    }
  }, [lastPinchDistance, getPinchDistance]);

  // Handle touch start for pinch
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const distance = getPinchDistance(e.touches);
      setLastPinchDistance(distance);
      setIsPinching(true);
    }
  }, [getPinchDistance]);

  // Handle touch end for pinch
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      setLastPinchDistance(0);
      setIsPinching(false);
    }
  }, []);
  
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!chartRef.current || isDoubleClicking) return;
    
    const rect = chartRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setIsDragging(true);
    setDragStart({ x, y });
    setShowPanIndicator(true);
    setDragMode('pan');
    
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // Reset view to show latest data
  const resetView = useCallback(() => {
    const totalBars = data.length;
    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const visibleBars = Math.floor(screenWidth / CANDLE_WIDTH);
    const rightMargin = screenWidth * 0.1; // 10% of screen width for better margin
    // Calculate position to show the very last bar with margin
    const lastCandlePosition = Math.max(0, totalBars * CANDLE_WIDTH - screenWidth + rightMargin);
    
    setScrollX(lastCandlePosition);
    setScrollY(0);
    setZoom(1);
    setVerticalScale(1.6);
    setHorizontalScale(1.5);
  }, [data.length, CANDLE_WIDTH]);
  

  
  const handleMouseMoveGlobal = useCallback((e: MouseEvent) => {
    if (!isDragging || !chartRef.current) return;
    
    const rect = chartRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const deltaX = x - dragStart.x;
    const deltaY = y - dragStart.y;
    
    if (dragMode === 'pan') {
      // Pan with boundaries
      setScrollX(prev => {
        const newScrollX = prev - deltaX;
        const maxScrollX = Math.max(0, data.length * CANDLE_WIDTH - rect.width);
        return Math.max(0, Math.min(maxScrollX, newScrollX));
      });
      setScrollY(prev => {
        const newScrollY = prev - deltaY;
        // Allow panning above highest bar by adding extra space (50% of chart height)
        const extraSpace = CHART_HEIGHT * 0.5;
        const maxScrollY = CHART_HEIGHT * zoom * verticalScale - rect.height + extraSpace;
        const minScrollY = -extraSpace; // Allow negative scroll to pan above
        return Math.max(minScrollY, Math.min(maxScrollY, newScrollY));
      });
      setDragStart({ x, y });
    } else if (dragMode === 'zoom') {
      if (x > rect.width - 100) { // Right edge - vertical scaling
        handleYAxisDrag(deltaY);
      } else if (y > rect.height - 50) { // Bottom edge - horizontal scaling
        handleXAxisDrag(deltaX);
      } else {
        const zoomDelta = deltaY * -0.01;
        setZoom(prev => Math.max(0.5, Math.min(3, prev + zoomDelta)));
      }
      setDragStart({ x, y });
    }
  }, [isDragging, dragStart, dragMode, data.length, CANDLE_WIDTH, CHART_HEIGHT, zoom, verticalScale, handleYAxisDrag, handleXAxisDrag]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragMode('none');
    // Hide pan indicator after a short delay
    setTimeout(() => setShowPanIndicator(false), 1000);
  }, []);
  
  // Add global mouse event listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMoveGlobal);
      document.addEventListener('mouseup', handleMouseUp);
      // Prevent default drag behavior
      document.addEventListener('dragstart', (e) => e.preventDefault());
      return () => {
        document.removeEventListener('mousemove', handleMouseMoveGlobal);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('dragstart', (e) => e.preventDefault());
      };
    }
  }, [isDragging, handleMouseMoveGlobal, handleMouseUp]);

  // Add keyboard shortcuts for panning
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Pan with arrow keys
      const panAmount = 50;
      if (e.key === 'ArrowLeft') {
        setScrollX(prev => {
          const newScrollX = prev - panAmount;
          const maxScrollX = Math.max(0, data.length * CANDLE_WIDTH - (typeof window !== 'undefined' ? window.innerWidth : 1200));
          return Math.max(0, Math.min(maxScrollX, newScrollX));
        });
      } else if (e.key === 'ArrowRight') {
        setScrollX(prev => {
          const newScrollX = prev + panAmount;
          const maxScrollX = Math.max(0, data.length * CANDLE_WIDTH - (typeof window !== 'undefined' ? window.innerWidth : 1200));
          return Math.max(0, Math.min(maxScrollX, newScrollX));
        });
      } else if (e.key === 'ArrowUp') {
        setScrollY(prev => {
          const newScrollY = prev - panAmount;
          // Allow panning above highest bar by adding extra space (50% of chart height)
          const extraSpace = CHART_HEIGHT * 0.5;
          const maxScrollY = CHART_HEIGHT * zoom * verticalScale - CHART_HEIGHT + extraSpace;
          const minScrollY = -extraSpace; // Allow negative scroll to pan above
          return Math.max(minScrollY, Math.min(maxScrollY, newScrollY));
        });
      } else if (e.key === 'ArrowDown') {
        setScrollY(prev => {
          const newScrollY = prev + panAmount;
          // Allow panning above highest bar by adding extra space (50% of chart height)
          const extraSpace = CHART_HEIGHT * 0.5;
          const maxScrollY = CHART_HEIGHT * zoom * verticalScale - CHART_HEIGHT + extraSpace;
          const minScrollY = -extraSpace; // Allow negative scroll to pan above
          return Math.max(minScrollY, Math.min(maxScrollY, newScrollY));
        });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [data.length, CANDLE_WIDTH, CHART_HEIGHT, zoom, verticalScale]);

  return (
    <div 
      className="w-full h-full relative overflow-hidden bg-card text-card-foreground" 
      style={{ 
        height: '100%', // Use full height
        width: '100%',  // Use full width
        zIndex: 1,
        userSelect: 'none', // Prevent text selection
        WebkitUserSelect: 'none',
        MozUserSelect: 'none',
        msUserSelect: 'none'
      }}
    >

      {/* Main Chart Area */}
      <div 
        className="w-full h-full relative"
        style={{
          height: '100%', // Use full height
          width: '100%',   // Use full width
          paddingRight: '64px',        // Space for Y-axis
          // Removed paddingBottom to make chart reach bottom
          boxSizing: 'border-box'     // Include padding in dimensions
        }}
      >
        <div 
          ref={chartRef}
          className={`w-full h-full relative ${
            dragMode === 'pan' ? 'cursor-move' : 
            dragMode === 'zoom' ? 'cursor-ns-resize' : 'cursor-crosshair'
          }`}
          style={{ 
            overflowX: 'hidden',
            overflowY: 'hidden',
            zIndex: 1,
            height: '100%', // Use full height
            width: '100%',  // Use full width
            userSelect: 'none' // Prevent text selection during drag
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onMouseDown={handleMouseDown}
          onWheel={(e) => {
            e.preventDefault();
            if (e.ctrlKey) {
              handleZoom(e.deltaY > 0 ? -0.1 : 0.1);
            } else {
              handleScroll(e.deltaX, e.deltaY);
            }
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handlePinch}
          onTouchEnd={handleTouchEnd}
          onDoubleClick={(e) => {
            // Prevent double click interference
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {/* Grid Lines - Optimized */}
          <div className="absolute inset-0 pointer-events-none">
            {/* All grid lines removed for clean background */}
          </div>
          
          {/* Candlestick Bars - Optimized rendering */}
          <div 
            className="relative"
            style={{ 
              width: data.length * CANDLE_WIDTH,
              height: '100%', // Use full height
              marginLeft: -scrollX,
              marginTop: -scrollY
            }}
          >
            {data.map((candle, index) => {
              // Only render visible candles
              const xPos = index * CANDLE_WIDTH;
              const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
              if (xPos < scrollX - CANDLE_WIDTH || xPos > scrollX + windowWidth + CANDLE_WIDTH) {
                return null;
              }
              
              return (
                <CandlestickBar
                  key={`candle-${index}`}
                  data={candle}
                  index={index}
                  width={CANDLE_WIDTH}
                  height="100%" // Use full height
                  minPrice={minPrice}
                  maxPrice={maxPrice}
                  showPOC={showPOC}
                  showDelta={showDelta}
                  zoom={zoom}
                  verticalScale={verticalScale}
                  horizontalScale={horizontalScale}
                />
              );
            })}
          </div>
          
          {/* Crosshair */}
          {showCrosshair && (
            <Crosshair data={crosshair} chartHeight="100%" />
          )}
          
          {/* Pan Indicator */}
          {showPanIndicator && (
            <div className="absolute top-4 left-4 bg-primary text-primary-foreground px-3 py-2 rounded-md text-sm font-medium shadow-lg">
              {dragMode === 'pan' ? 'Pan Mode - Drag to move' : 'Zoom Mode - Drag to scale'}
            </div>
          )}
        </div>
        
      </div>
      
        {/* X-Axis - Moved inside main container */}
        <Axis
          type="x"
          data={data}
          width={chartWidth}
          height={chartHeight}
          scrollX={scrollX}
          scrollY={scrollY}
          zoom={zoom}
          verticalScale={verticalScale}
          minPrice={minPrice}
          maxPrice={maxPrice}
          candleWidth={CANDLE_WIDTH}
          chartHeight={CHART_HEIGHT}
          theme={theme}
          onAxisDrag={handleAxisDrag}
          onAxisDoubleClick={handleAxisDoubleClick}
        />
      
      {/* Y-Axis - Moved inside main container */}
      <Axis
        type="y"
        data={data}
        width={chartWidth}
        height={chartHeight}
        scrollX={scrollX}
        scrollY={scrollY}
        zoom={zoom}
        verticalScale={verticalScale}
        minPrice={minPrice}
        maxPrice={maxPrice}
        candleWidth={CANDLE_WIDTH}
        chartHeight={CHART_HEIGHT}
        theme={theme}
        onAxisDrag={handleAxisDrag}
        onAxisDoubleClick={handleAxisDoubleClick}
      />
      
    </div>
  );
};

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { CandlestickBar } from './CandlestickBar';
import { Crosshair } from './Crosshair';
import { ControlPanel } from './ControlPanel';
import { Settings, X } from 'lucide-react';

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
  const times = ['09:00', '09:15', '09:30', '09:45', '10:00', '10:15', '10:30', '10:45', '11:00', '11:15', '11:30', '11:45', '12:00', '12:15', '12:30', '12:45', '13:00', '13:15', '13:30', '13:45', '14:00', '14:15', '14:30', '14:45', '15:00', '15:15', '15:30', '15:45', '16:00', '16:15', '16:30'];
  
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

export const FootprintChart: React.FC = () => {
  const [data] = useState<CandleData[]>(generateDummyData());
  const [crosshair, setCrosshair] = useState<CrosshairData>({
    x: 0, y: 0, price: 0, time: '', bidVol: 0, askVol: 0, delta: 0, visible: false
  });
  // Chart dimensions and layout - responsive
  const CHART_HEIGHT = Math.max(400, (typeof window !== 'undefined' ? window.innerHeight : 800) - 250); // Responsive height
  const PRICE_LEVEL_HEIGHT = 16;

  const [showCrosshair, setShowCrosshair] = useState(true);
  const [showPOC, setShowPOC] = useState(true);
  const [showDelta, setShowDelta] = useState(false);
  const [timeframe, setTimeframe] = useState('15m');
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragMode, setDragMode] = useState<'none' | 'pan' | 'zoom'>('none');
  const [darkMode, setDarkMode] = useState(false);
  const [controlPanelOpen, setControlPanelOpen] = useState(false);
  const [verticalScale, setVerticalScale] = useState(1.6); // Default 160%
  const [horizontalScale, setHorizontalScale] = useState(1.5); // Default 150%
  const [containerHeight, setContainerHeight] = useState(400);
  const [isDoubleClicking, setIsDoubleClicking] = useState(false);
  const [lastPinchDistance, setLastPinchDistance] = useState(0);
  const [isPinching, setIsPinching] = useState(false);
  
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
  const rightMargin = screenWidth * 0.05; // 5% of screen width
  const lastCandlePosition = Math.max(0, (totalBars - visibleBars) * CANDLE_WIDTH + rightMargin);
  
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
        console.log('Crosshair Visual Detection:', {
          y, detectedY, 
          priceLevel: detectedLevel.price, // Price level from bid/ask volume
          candleIndex,
          bidVol: detectedLevel.bidVolume, askVol: detectedLevel.askVolume,
          elementsFound: elementsAtPoint.filter(el => el.getAttribute('data-volume-level') === 'true').length
        });
        
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
    // Free movement - no boundaries
    setScrollX(prev => prev + deltaX);
    setScrollY(prev => prev + deltaY);
  }, []);
  
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
    const scaleDelta = deltaY * -0.005; // Sensitive scaling
    setVerticalScale(prev => {
      const newScale = Math.max(0.5, Math.min(3, prev + scaleDelta));
      console.log('Vertical Scale (Drag):', { from: prev, to: newScale, percentage: Math.round(newScale * 100) + '%' });
      return newScale;
    });
  }, []);

  const handleXAxisDrag = useCallback((deltaX: number) => {
    const scaleDelta = deltaX * -0.005; // Sensitive scaling
    setHorizontalScale(prev => {
      const newScale = Math.max(0.5, Math.min(3, prev + scaleDelta));
      console.log('Horizontal Scale:', { from: prev, to: newScale, percentage: Math.round(newScale * 100) + '%' });
      return newScale;
    });
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
    
    // Determine drag mode based on position
    if (x > rect.width - 100) { // Right edge area
      setDragMode('zoom');
    } else if (y > rect.height - 50) { // Bottom edge area
      setDragMode('zoom');
    } else {
      setDragMode('pan');
    }
    
    e.preventDefault();
  }, []);
  

  
  const handleMouseMoveGlobal = useCallback((e: MouseEvent) => {
    if (!isDragging || !chartRef.current) return;
    
    const rect = chartRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const deltaX = x - dragStart.x;
    const deltaY = y - dragStart.y;
    
    if (dragMode === 'pan') {
      // Free movement - no boundaries
      setScrollX(prev => prev - deltaX);
      setScrollY(prev => prev - deltaY);
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
  }, []);
  
  // Add global mouse event listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMoveGlobal);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMoveGlobal);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMoveGlobal, handleMouseUp]);

  // Add escape key listener to close sidebar
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && controlPanelOpen) {
        setControlPanelOpen(false);
      }
    };

    if (controlPanelOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [controlPanelOpen]);

  return (
    <div className={`w-full h-screen ${darkMode ? 'dark' : ''} relative overflow-hidden`} style={{ 
      zIndex: 1,
      backgroundColor: darkMode ? '#131722' : '#FFFFFF',
      color: darkMode ? '#D1D4DC' : '#191919'
    }}>
      {/* Header */}
      <div className={`p-3 border-b ${darkMode ? 'bg-[#1E222D] border-[#2A2E39]' : 'bg-[#FFFFFF] border-[#E1E3E6]'}`} style={{
        backgroundColor: darkMode ? '#1E222D' : '#FFFFFF',
        borderBottom: `1px solid ${darkMode ? '#2A2E39' : '#E1E3E6'}`
      }}>
        <div className="flex justify-between items-center">
          <div>
            <h1 className={`text-lg font-semibold ${darkMode ? 'text-[#D1D4DC]' : 'text-[#191919]'}`}>
              Footprint Chart
            </h1>
            <p className={`text-sm ${darkMode ? 'text-[#787B86]' : 'text-[#787B86]'}`}>
              {/* Professional futures trading simulation */}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setControlPanelOpen(!controlPanelOpen)}
              className={`px-3 py-1 rounded text-sm flex items-center gap-2 ${
                darkMode 
                  ? 'bg-[#2A2E39] text-[#D1D4DC] hover:bg-[#3A3E4B]' 
                  : 'bg-[#F8F9FA] text-[#191919] hover:bg-[#E1E3E6]'
              }`}
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      
      <div className="w-full h-[calc(100vh-80px)]">
        {/* Main Chart Area */}
        <div className="w-full h-full relative">
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
              paddingTop: '5%', // 5% top margin
              backgroundColor: darkMode ? '#131722' : '#FFFFFF',
              border: `1px solid ${darkMode ? '#2A2E39' : '#E1E3E6'}`,
              borderRadius: '4px'
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
                height: CHART_HEIGHT * zoom * verticalScale,
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
                    height={CHART_HEIGHT}
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
              <Crosshair data={crosshair} chartHeight={containerHeight} />
            )}
          </div>
        </div>
        
        {/* Control Panel Popup */}
          <ControlPanel
            showCrosshair={showCrosshair}
            showPOC={showPOC}
            showDelta={showDelta}
            timeframe={timeframe}
            zoom={zoom}
            darkMode={darkMode}
          isOpen={controlPanelOpen}
          onClose={() => setControlPanelOpen(false)}
            onToggleCrosshair={() => setShowCrosshair(!showCrosshair)}
            onTogglePOC={() => setShowPOC(!showPOC)}
            onToggleDelta={() => setShowDelta(!showDelta)}
            onTimeframeChange={setTimeframe}
            onZoom={handleZoom}
            onExport={() => console.log('Export chart')}
            onToggleDarkMode={() => setDarkMode(!darkMode)}
          />
        
        {/* Mobile Control Panel */}
        <div className={`lg:hidden fixed bottom-0 left-0 right-0 p-4 border-t ${
          darkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'
        }`}>
          <div className="flex justify-center gap-2">
            <button
              onClick={() => setControlPanelOpen(!controlPanelOpen)}
              className={`px-3 py-2 rounded text-sm flex items-center gap-1 ${
                controlPanelOpen
                  ? darkMode ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white'
                  : darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'
              }`}
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
            <button
              onClick={() => setShowCrosshair(!showCrosshair)}
              className={`px-3 py-2 rounded text-sm ${
                showCrosshair
                  ? darkMode ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white'
                  : darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'
              }`}
            >
              Crosshair
            </button>
            <button
              onClick={() => setShowPOC(!showPOC)}
              className={`px-3 py-2 rounded text-sm ${
                showPOC
                  ? darkMode ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white'
                  : darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'
              }`}
            >
              POC
            </button>
            <button
              onClick={() => setShowDelta(!showDelta)}
              className={`px-3 py-2 rounded text-sm ${
                showDelta
                  ? darkMode ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white'
                  : darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'
              }`}
            >
              Delta
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
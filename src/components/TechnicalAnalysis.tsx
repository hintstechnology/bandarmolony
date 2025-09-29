import React, { useState, useRef, useEffect } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { PineScriptSnippets } from './PineScriptSnippets';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  MousePointer, 
  PenTool, 
  CircleDot, 
  Square, 
  Zap, 
  Code, 
  Settings, 
  Plus, 
  BarChart3, 
  Activity, 
  LineChart,
  Maximize2,
  ChevronDown,
  Play,
  Pause,
  RotateCcw,
  Save,
  Download,
  Upload,
  Eye,
  EyeOff
} from 'lucide-react';
import { Line as RechartsLine, LineChart as RechartsLineChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceLine, Area, AreaChart } from 'recharts';

type CandlestickDatum = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  sma20: number;
  sma50: number;
  rsi: number;
  macd: number;
  signal: number;
};

// Mock candlestick data
const generateCandlestickData = (symbol: string): CandlestickDatum[] => {
  const data: CandlestickDatum[] = [];
  let price = 4500 + Math.random() * 500;
  
  for (let i = 0; i < 100; i++) {
    const open = price;
    const close = open + (Math.random() - 0.5) * 100;
    const high = Math.max(open, close) + Math.random() * 50;
    const low = Math.min(open, close) - Math.random() * 50;
    const volume = Math.floor(Math.random() * 10000000) + 1000000;
    
    data.push({
      time: new Date(Date.now() - (99 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      open: Math.round(open),
      high: Math.round(high),
      low: Math.round(low),
      close: Math.round(close),
      volume,
      sma20: Math.round(price + Math.sin(i * 0.1) * 20),
      sma50: Math.round(price + Math.sin(i * 0.05) * 40),
      rsi: 30 + Math.random() * 40,
      macd: Math.random() * 20 - 10,
      signal: Math.random() * 15 - 7.5
    });
    
    price = close;
  }
  
  return data;
};

// Technical Indicators Library
const technicalIndicators = [
  { id: 'sma', name: 'Simple Moving Average', category: 'Trend', active: false },
  { id: 'ema', name: 'Exponential Moving Average', category: 'Trend', active: false },
  { id: 'bollinger', name: 'Bollinger Bands', category: 'Volatility', active: false },
  { id: 'rsi', name: 'RSI', category: 'Momentum', active: true },
  { id: 'macd', name: 'MACD', category: 'Momentum', active: true },
  { id: 'stochastic', name: 'Stochastic', category: 'Momentum', active: false },
  { id: 'atr', name: 'Average True Range', category: 'Volatility', active: false },
  { id: 'volume', name: 'Volume', category: 'Volume', active: true },
  { id: 'obv', name: 'On Balance Volume', category: 'Volume', active: false },
  { id: 'fibonacci', name: 'Fibonacci Retracement', category: 'Support/Resistance', active: false }
];

// Drawing Tools
const drawingTools = [
  { id: 'cursor', name: 'Cursor', icon: MousePointer },
  { id: 'trendline', name: 'Trend Line', icon: TrendingUp },
  { id: 'horizontal', name: 'Horizontal Line', icon: Minus },
  { id: 'vertical', name: 'Vertical Line', icon: Minus },
  { id: 'rectangle', name: 'Rectangle', icon: Square },
  { id: 'circle', name: 'Circle', icon: CircleDot },
  { id: 'fibonacci', name: 'Fibonacci', icon: TrendingDown },
  { id: 'text', name: 'Text', icon: PenTool }
];

// Sample PineScript
const samplePineScript = `//@version=5
indicator("Custom RSI Strategy", overlay=false)

// Input parameters
rsi_length = input.int(14, "RSI Length", minval=1)
rsi_overbought = input.int(70, "Overbought Level", minval=50, maxval=100)
rsi_oversold = input.int(30, "Oversold Level", minval=0, maxval=50)

// Calculate RSI
rsi_value = ta.rsi(close, rsi_length)

// Plot RSI
plot(rsi_value, "RSI", color=color.blue, linewidth=2)

// Plot overbought and oversold levels
hline(rsi_overbought, "Overbought", color=color.red, linestyle=hline.style_dashed)
hline(rsi_oversold, "Oversold", color=color.green, linestyle=hline.style_dashed)
hline(50, "Midline", color=color.gray, linestyle=hline.style_dotted)

// Background colors for extreme levels
bgcolor(rsi_value > rsi_overbought ? color.new(color.red, 90) : na)
bgcolor(rsi_value < rsi_oversold ? color.new(color.green, 90) : na)

// Alert conditions
alertcondition(ta.crossover(rsi_value, rsi_overbought), "RSI Overbought", "RSI crossed above overbought level")
alertcondition(ta.crossunder(rsi_value, rsi_oversold), "RSI Oversold", "RSI crossed below oversold level")`;

export function TechnicalAnalysis() {
  const [selectedSymbol, setSelectedSymbol] = useState('BBRI');
  const [timeframe, setTimeframe] = useState('1D');
  const [selectedTool, setSelectedTool] = useState('cursor');
  const [showIndicators, setShowIndicators] = useState(true);
  const [showPineScript, setShowPineScript] = useState(false);
  const [showSnippets, setShowSnippets] = useState(false);
  const [indicators, setIndicators] = useState(technicalIndicators);
  const [pineScript, setPineScript] = useState(samplePineScript);
  const [isPlaying, setIsPlaying] = useState(false);
  const [chartData, setChartData] = useState<CandlestickDatum[]>([]);
  const [dataSource, setDataSource] = useState<'remote' | 'mock' | 'loading'>('loading');
  const [chartMode, setChartMode] = useState<'line' | 'ohlc' | 'footprint'>('line');
  const [yMinOverride, setYMinOverride] = useState<number | null>(null);
  const [yMaxOverride, setYMaxOverride] = useState<number | null>(null);
  const [xStartOverride, setXStartOverride] = useState<number | null>(null);
  const [xEndOverride, setXEndOverride] = useState<number | null>(null);
  const [dragState, setDragState] = useState<
    | { mode: null }
    | {
        mode: 'x' | 'y' | 'pan';
        startX: number;
        startY: number;
        initYMin: number;
        initYMax: number;
        initXStart: number;
        initXEnd: number;
      }
  >({ mode: null });
  
  const chartRef = useRef(null);
  
  const symbols = ['BBRI', 'BBCA', 'BMRI', 'BBNI', 'TLKM', 'ASII', 'UNVR', 'GGRM', 'ICBP', 'KLBF'];
  const timeframes = ['1m', '5m', '15m', '30m', '1H', '2H', '4H', '1D', '1W', '1M'];
  
  useEffect(() => {
    let isCancelled = false;
    const load = async () => {
      setDataSource('loading');
      try {
        const res = await fetch(`/data/ohlc/${selectedSymbol}.json`, { cache: 'no-store' });
        if (!res.ok) throw new Error('not ok');
        const data = await res.json();
        if (!isCancelled && Array.isArray(data) && data.length > 0) {
          setChartData(data);
          setDataSource('remote');
          return;
        }
      } catch (_) {
        // fallthrough to mock
      }
      if (!isCancelled) {
        const mock = generateCandlestickData(selectedSymbol);
        setChartData(mock);
        setDataSource('mock');
      }
    };
    load();
    return () => { isCancelled = true; };
  }, [selectedSymbol]);

  const latestPrice = chartData.length > 1 ? chartData[chartData.length - 1] : { close: 0 } as any;
  const priceChangeBase = chartData.length > 1 ? chartData[chartData.length - 2].close : 1;
  const priceChange = chartData.length > 1 ? latestPrice.close - priceChangeBase : 0;
  const priceChangePercent = chartData.length > 1 ? (priceChange / priceChangeBase) * 100 : 0;

  const toggleIndicator = (id: string) => {
    setIndicators(prev => prev.map(ind => 
      ind.id === id ? { ...ind, active: !ind.active } : ind
    ));
  };

  const activeIndicators = indicators.filter(ind => ind.active);

  const handleScriptRun = () => {
    // Simulate running PineScript
    console.log('Running PineScript:', pineScript);
    // In real implementation, this would compile and apply the script
  };

  const handleInsertSnippet = (code: string) => {
    setPineScript(code);
    setShowSnippets(false);
  };

  return (
    <div className="h-full flex flex-col space-y-2">
      {/* Top Toolbar */}
      <Card className="p-3">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            {/* Symbol Selector */}
            <div className="flex items-center gap-2">
              <label className="font-medium">Symbol:</label>
              <select
                value={selectedSymbol}
                onChange={(e) => setSelectedSymbol(e.target.value)}
                className="px-3 py-1 border border-border rounded-md bg-background text-foreground font-mono"
              >
                {symbols.map(symbol => (
                  <option key={symbol} value={symbol}>{symbol}</option>
                ))}
              </select>
            </div>

            {/* Timeframe Selector */}
            <div className="flex items-center gap-1">
              <label className="font-medium mr-2">Timeframe:</label>
              {timeframes.map(tf => (
                <Button
                  key={tf}
                  variant={timeframe === tf ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTimeframe(tf)}
                  className="px-2 py-1 text-xs"
                >
                  {tf}
                </Button>
              ))}
              {/* Chart style selector */}
              <div className="flex items-center gap-1 ml-3">
                <span className="font-medium mr-2">Chart Style :</span>
                <Button size="sm" variant={chartMode === 'line' ? 'default' : 'outline'} onClick={() => setChartMode('line')} className="px-2 py-1 text-xs">Line</Button>
                <Button size="sm" variant={chartMode === 'ohlc' ? 'default' : 'outline'} onClick={() => setChartMode('ohlc')} className="px-2 py-1 text-xs">OHLC</Button>
                <Button size="sm" variant={chartMode === 'footprint' ? 'default' : 'outline'} onClick={() => setChartMode('footprint')} className="px-2 py-1 text-xs">Footprint</Button>
              </div>
              {/* Axis interaction: drag on axes in chart, double-click reset */}
            </div>
          </div>

          {/* Price Display */}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="font-mono text-lg font-medium">
                {latestPrice.close.toLocaleString()}
              </div>
              <div className={`text-sm font-medium ${priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(0)} ({priceChangePercent.toFixed(2)}%)
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              {dataSource === 'loading' ? 'Loading…' : dataSource === 'remote' ? 'Data: file' : 'Data: mock'}
            </div>
            
          </div>
        </div>
      </Card>

      {/* Main Content Area */}
      <div className="flex-1 flex gap-2 relative">
        {/* Left Sidebar - Drawing Tools */}
        <Card className="w-12 p-2">
          <div className="space-y-1">
            {drawingTools.map(tool => (
              <Button
                key={tool.id}
                variant={selectedTool === tool.id ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setSelectedTool(tool.id)}
                className="w-8 h-8 p-0"
                title={tool.name}
              >
                <tool.icon className="w-4 h-4" />
              </Button>
            ))}
            <div className="border-t border-border my-2"></div>
            <Button
              variant={showIndicators ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setShowIndicators(!showIndicators)}
              className="w-8 h-8 p-0"
              title="Indicators"
            >
              <BarChart3 className="w-4 h-4" />
            </Button>
            <Button
              variant={showPineScript ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setShowPineScript(!showPineScript)}
              className="w-8 h-8 p-0"
              title="PineScript Editor"
            >
              <Code className="w-4 h-4" />
            </Button>
            <Button
              variant={showSnippets ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setShowSnippets(!showSnippets)}
              className="w-8 h-8 p-0"
              title="Script Library"
            >
              <Zap className="w-4 h-4" />
            </Button>
          </div>
        </Card>

        {/* Main Chart Area */}
        <div className="flex-1 flex flex-col gap-2">
          {/* Chart */}
          <Card className="flex-1 p-4">
            <div className="h-full">
              {chartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  No data loaded.
                </div>
              ) : (
                chartMode === 'line' ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsLineChart data={chartData} ref={chartRef}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis 
                        dataKey="time" 
                        stroke="#6b7280"
                        fontSize={12}
                        tickFormatter={(value) => new Date(value).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' })}
                      />
                      <YAxis 
                        stroke="#6b7280"
                        fontSize={12}
                        orientation="right"
                        tickFormatter={(value) => value.toLocaleString()}
                      />
                      <RechartsLine 
                        type="monotone" 
                        dataKey="close" 
                        stroke="#2563eb" 
                        strokeWidth={2}
                        dot={false}
                        name="Close Price"
                      />
                      {indicators.find(ind => ind.id === 'sma' && ind.active) && (
                        <>
                          <RechartsLine type="monotone" dataKey="sma20" stroke="#f59e0b" strokeWidth={1} dot={false} name="SMA 20" strokeDasharray="5 5" />
                          <RechartsLine type="monotone" dataKey="sma50" stroke="#10b981" strokeWidth={1} dot={false} name="SMA 50" strokeDasharray="10 5" />
                        </>
                      )}
                    </RechartsLineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-full"
                    onMouseMove={(e) => {
                      if (dragState.mode === null) return;
                      const n = chartData.length;
                      const dataMin = Math.min(...chartData.map(d => d.low));
                      const dataMax = Math.max(...chartData.map(d => d.high));
                      if (dragState.mode === 'y') {
                        const dy = (dragState.startY - e.clientY);
                        const factor = Math.max(0.2, Math.min(5, 1 + dy * 0.005));
                        const mid = (dragState.initYMin + dragState.initYMax) / 2;
                        const half = (dragState.initYMax - dragState.initYMin) / (2 * factor);
                        setYMinOverride(mid - half);
                        setYMaxOverride(mid + half);
                      } else if (dragState.mode === 'x') {
                        const dx = (dragState.startX - e.clientX);
                        const factor = Math.max(0.2, Math.min(5, 1 + dx * 0.005));
                        const mid = (dragState.initXStart + dragState.initXEnd) / 2;
                        const half = (dragState.initXEnd - dragState.initXStart) / (2 * factor);
                        let start = Math.round(mid - half);
                        let end = Math.round(mid + half);
                        start = Math.max(0, start);
                        end = Math.min(n - 1, end);
                        if (end <= start) { end = Math.min(n - 1, start + 1); }
                        setXStartOverride(start);
                        setXEndOverride(end);
                      } else if (dragState.mode === 'pan') {
                        const padLeft = 40; const padRight = 60; const padTop = 20; const padBottom = 20;
                        const innerW = 1000 - padLeft - padRight;
                        const dx = (e.clientX - dragState.startX);
                        const span = Math.max(1, dragState.initXEnd - dragState.initXStart);
                        const pixelsPerIndex = innerW / span;
                        const deltaIdx = Math.round(-dx / Math.max(1, pixelsPerIndex));
                        let start = dragState.initXStart + deltaIdx;
                        let end = dragState.initXEnd + deltaIdx;
                        if (start < 0) { end += -start; start = 0; }
                        if (end > n - 1) { start -= (end - (n - 1)); end = n - 1; }
                        if (end <= start) { end = Math.min(n - 1, start + span); }
                        setXStartOverride(Math.max(0, start));
                        setXEndOverride(Math.min(n - 1, end));
                      }
                    }}
                    onMouseUp={() => setDragState({ mode: null })}
                    onMouseLeave={() => setDragState({ mode: null })}
                  >
                    <svg viewBox="0 0 1000 400" width="100%" height="100%" preserveAspectRatio="none"
                      onDoubleClick={() => { setYMinOverride(null); setYMaxOverride(null); setXStartOverride(null); setXEndOverride(null); }}
                    >
                      {/* grid bg */}
                      <rect x="0" y="0" width="1000" height="400" fill="white" fillOpacity="0" />
                      {(() => {
                        const n = chartData.length;
                        const dataMin = Math.min(...chartData.map(d => d.low));
                        const dataMax = Math.max(...chartData.map(d => d.high));
                        const minY = yMinOverride ?? dataMin;
                        const maxY = yMaxOverride ?? dataMax;
                        const padLeft = 40; // y-axis labels space
                        const padRight = 60; // y-axis labels space
                        const padTop = 20;
                        const padBottom = 20;
                        const innerW = 1000 - padLeft - padRight;
                        const innerH = 400 - padTop - padBottom;
                        // add 5% vertical padding to avoid touching top/bottom
                        const yRange = Math.max(1e-6, maxY - minY);
                        const yMinP = minY - yRange * 0.05;
                        const yMaxP = maxY + yRange * 0.05;
                        const y = (v: number) => padTop + innerH - ((v - yMinP) / Math.max(1e-6, yMaxP - yMinP)) * innerH;
                        const xStart = xStartOverride ?? 0;
                        const xEnd = xEndOverride ?? (n - 1);
                        const visible = Math.max(1, xEnd - xStart);
                        const x = (i: number) => padLeft + (((i - xStart) + 0.5) / visible) * innerW;
                        const bandW = innerW / visible;
                        const bodyW = Math.max(2, Math.min(12, bandW * 0.8));

                        // Axes and ticks
                        const ticksY = 5;
                        const yTicks = Array.from({ length: ticksY + 1 }, (_, i) => minY + (i * (maxY - minY)) / ticksY);
                        const xTickEvery = Math.max(1, Math.ceil(visible / 8));

                        const axis = [
                          <line key="y-axis" x1={1000 - padRight + 0.5} x2={1000 - padRight + 0.5} y1={padTop} y2={padTop + innerH} stroke="#cbd5e1" />,
                          <line key="x-axis" x1={padLeft} x2={padLeft + innerW} y1={padTop + innerH + 0.5} y2={padTop + innerH + 0.5} stroke="#cbd5e1" />,
                          ...yTicks.map((tv, idx) => (
                            <g key={`yt-${idx}`}>
                              <line x1={padLeft} x2={padLeft + innerW} y1={y(tv)} y2={y(tv)} stroke="#f1f5f9" />
                              <text x={1000 - padRight + 6} y={y(tv)} fontSize="10" fill="#64748b" dominantBaseline="middle">{Math.round(tv).toLocaleString()}</text>
                            </g>
                          )),
                          ...chartData.map((d, i) => (i >= xStart && i <= xEnd && ((i - xStart) % xTickEvery === 0) ? (
                            <g key={`xt-${i}`}>
                              <line x1={x(i)} x2={x(i)} y1={padTop + innerH} y2={padTop + innerH + 4} stroke="#cbd5e1" />
                              <text x={x(i)} y={padTop + innerH + 12} fontSize="10" textAnchor="middle" fill="#64748b">{new Date(d.time).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' })}</text>
                            </g>
                          ) : null)),
                          // Interactive hit areas for axis dragging
                          <rect key="y-hit" x={1000 - padRight} y={padTop} width={padRight - 4} height={innerH} fill="transparent" style={{ cursor: 'ns-resize' }}
                            onMouseDown={(e) => {
                              const initYMin = yMinOverride ?? dataMin;
                              const initYMax = yMaxOverride ?? dataMax;
                              const initXStart = xStartOverride ?? 0;
                              const initXEnd = xEndOverride ?? (n - 1);
                              setDragState({ mode: 'y', startX: e.clientX, startY: e.clientY, initYMin, initYMax, initXStart, initXEnd });
                            }}
                          />,
                          <rect key="x-hit" x={padLeft} y={padTop + innerH} width={innerW} height={Math.max(8, padBottom)} fill="transparent" style={{ cursor: 'ew-resize' }}
                            onMouseDown={(e) => {
                              const initYMin = yMinOverride ?? dataMin;
                              const initYMax = yMaxOverride ?? dataMax;
                              const initXStart = xStartOverride ?? 0;
                              const initXEnd = xEndOverride ?? (n - 1);
                              setDragState({ mode: 'x', startX: e.clientX, startY: e.clientY, initYMin, initYMax, initXStart, initXEnd });
                            }}
                          />,
                          <rect key="pan-hit" x={padLeft} y={padTop} width={innerW} height={innerH} fill="transparent" style={{ cursor: 'grab' }}
                            onMouseDown={(e) => {
                              const initYMin = yMinOverride ?? dataMin;
                              const initYMax = yMaxOverride ?? dataMax;
                              const initXStart = xStartOverride ?? 0;
                              const initXEnd = xEndOverride ?? (n - 1);
                              setDragState({ mode: 'pan', startX: e.clientX, startY: e.clientY, initYMin, initYMax, initXStart, initXEnd });
                            }}
                          />,
                        ];

                        const series = chartData.map((d, i) => {
                          if (i < xStart || i > xEnd) return null;
                          const xC = x(i);
                          if (chartMode === 'ohlc') {
                            const color = d.close >= d.open ? '#16a34a' : '#dc2626';
                            const yHigh = y(d.high);
                            const yLow = y(d.low);
                            const yOpen = y(d.open);
                            const yClose = y(d.close);
                            const top = Math.min(yOpen, yClose);
                            const height = Math.max(1, Math.abs(yClose - yOpen));
                            return (
                              <g key={i}>
                                <line x1={xC} x2={xC} y1={yHigh} y2={yLow} stroke={color} strokeWidth={1} />
                                <rect x={xC - bodyW / 2} y={top} width={bodyW} height={height} fill={color} opacity={0.9} />
                              </g>
                            );
                          } else {
                            const vol = d.volume;
                            const maxVol = Math.max(...chartData.map(dd => dd.volume));
                            const opacity = Math.min(0.9, Math.max(0.15, vol / maxVol));
                            const yHigh = y(d.high);
                            const yLow = y(d.low);
                            const color = '#0ea5e9';
                            return (
                              <g key={i}>
                                <line x1={xC} x2={xC} y1={yHigh} y2={yLow} stroke="#94a3b8" strokeWidth={1} />
                                <rect x={xC - bodyW / 2} y={y(d.close)} width={bodyW} height={Math.max(2, Math.abs(y(d.open) - y(d.close)))} fill={color} opacity={opacity} />
                              </g>
                            );
                          }
                        });

                        return [
                          ...axis,
                          ...series,
                        ];
                      })()}
                    </svg>
                  </div>
                )
              )}
            </div>
          </Card>

          {/* Sub Charts for Indicators */}
          {activeIndicators.some(ind => ['rsi', 'macd', 'volume'].includes(ind.id)) && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 h-32">
              {/* RSI */}
              {indicators.find(ind => ind.id === 'rsi' && ind.active) && (
                <Card className="p-3">
                  <div className="text-xs font-medium mb-2">RSI (14)</div>
                  <ResponsiveContainer width="100%" height={80}>
                    <RechartsLineChart data={chartData}>
                      <RechartsLine 
                        type="monotone" 
                        dataKey="rsi" 
                        stroke="#8b5cf6" 
                        strokeWidth={2}
                        dot={false}
                      />
                      <ReferenceLine y={70} stroke="red" strokeDasharray="2 2" />
                      <ReferenceLine y={30} stroke="green" strokeDasharray="2 2" />
                      <YAxis hide domain={[0, 100]} />
                    </RechartsLineChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {/* MACD */}
              {indicators.find(ind => ind.id === 'macd' && ind.active) && (
                <Card className="p-3">
                  <div className="text-xs font-medium mb-2">MACD</div>
                  <ResponsiveContainer width="100%" height={80}>
                    <RechartsLineChart data={chartData}>
                      <RechartsLine 
                        type="monotone" 
                        dataKey="macd" 
                        stroke="#ef4444" 
                        strokeWidth={2}
                        dot={false}
                      />
                      <RechartsLine 
                        type="monotone" 
                        dataKey="signal" 
                        stroke="#2563eb" 
                        strokeWidth={1}
                        dot={false}
                      />
                      <ReferenceLine y={0} stroke="#e5e7eb" />
                      <YAxis hide />
                    </RechartsLineChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {/* Volume */}
              {indicators.find(ind => ind.id === 'volume' && ind.active) && (
                <Card className="p-3">
                  <div className="text-xs font-medium mb-2">Volume</div>
                  <ResponsiveContainer width="100%" height={80}>
                    <AreaChart data={chartData}>
                      <Area 
                        type="monotone" 
                        dataKey="volume" 
                        stroke="#f59e0b" 
                        fill="#f59e0b"
                        fillOpacity={0.25}
                      />
                      <YAxis hide tickFormatter={(value) => (value / 1000000).toFixed(1) + 'M'} />
                    </AreaChart>
                  </ResponsiveContainer>
                </Card>
              )}
            </div>
          )}
        </div>

        {/* Right Sidebar - Indicators Panel */}
        {showIndicators && (
          <Card className="w-80 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">Technical Indicators</h3>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setShowIndicators(false)}
              >
                <EyeOff className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="space-y-3">
              {['Trend', 'Momentum', 'Volatility', 'Volume', 'Support/Resistance'].map(category => (
                <div key={category}>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">{category}</h4>
                  <div className="space-y-1">
                    {indicators.filter(ind => ind.category === category).map(indicator => (
                      <div key={indicator.id} className="flex items-center justify-between p-2 rounded hover:bg-muted/50">
                        <span className="text-sm">{indicator.name}</span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant={indicator.active ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => toggleIndicator(indicator.id)}
                            className="px-2 py-1 text-xs"
                          >
                            {indicator.active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          </Button>
                          <Button variant="ghost" size="sm" className="px-2 py-1">
                            <Settings className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              
              <div className="pt-4 border-t border-border">
                <Button variant="outline" className="w-full" size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Custom Indicator
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* PineScript Snippets Panel */}
        {showSnippets && (
          <div className="absolute top-0 right-0 bottom-0 z-10">
            <PineScriptSnippets onInsertSnippet={handleInsertSnippet} />
          </div>
        )}
      </div>

      {/* PineScript Editor Panel */}
      {showPineScript && (
        <Card className="h-80 p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <h3 className="font-medium">PineScript Editor</h3>
              <div className="flex items-center gap-2">
                <Button 
                  variant={isPlaying ? 'destructive' : 'default'} 
                  size="sm"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="px-3"
                >
                  {isPlaying ? <Pause className="w-4 h-4 mr-1" /> : <Play className="w-4 h-4 mr-1" />}
                  {isPlaying ? 'Stop' : 'Run'}
                </Button>
                <Button variant="outline" size="sm" onClick={handleScriptRun}>
                  <RotateCcw className="w-4 h-4 mr-1" />
                  Reset
                </Button>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowSnippets(!showSnippets)}
              >
                <Zap className="w-4 h-4 mr-1" />
                Library
              </Button>
              <Button variant="outline" size="sm">
                <Upload className="w-4 h-4 mr-1" />
                Load
              </Button>
              <Button variant="outline" size="sm">
                <Save className="w-4 h-4 mr-1" />
                Save
              </Button>
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-1" />
                Export
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setShowPineScript(false)}
              >
                <EyeOff className="w-4 h-4" />
              </Button>
            </div>
          </div>
          
          <div className="h-64 border border-border rounded-md">
            <textarea
              value={pineScript}
              onChange={(e) => setPineScript(e.target.value)}
              className="w-full h-full p-3 bg-muted/20 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring rounded-md"
              placeholder="// Write your PineScript code here..."
              spellCheck={false}
            />
          </div>
          
          <div className="mt-2 text-xs text-muted-foreground">
            PineScript v5 | Lines: {pineScript.split('\n').length} | 
            <span className="ml-2">Status: {isPlaying ? 'Running' : 'Stopped'}</span>
          </div>
        </Card>
      )}
    </div>
  );
}
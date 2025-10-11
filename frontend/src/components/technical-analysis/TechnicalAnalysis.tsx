import { useState, useRef } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
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
  Play,
  Pause,
  RotateCcw,
  Save,
  Download,
  Upload,
  Eye,
  EyeOff
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceLine, Area, AreaChart } from 'recharts';

// Mock candlestick data
interface CandlestickData {
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
}

const generateCandlestickData = (_symbol: string): CandlestickData[] => {
  const data: CandlestickData[] = [];
  let price = 4500 + Math.random() * 500;
  
  for (let i = 0; i < 100; i++) {
    const open = price;
    const close = open + (Math.random() - 0.5) * 100;
    const high = Math.max(open, close) + Math.random() * 50;
    const low = Math.min(open, close) - Math.random() * 50;
    const volume = Math.floor(Math.random() * 10000000) + 1000000;
    
    data.push({
      time: new Date(Date.now() - (99 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0] ?? '',
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
bgcolor(rsi_value &gt; rsi_overbought ? color.new(color.red, 90) : na)
bgcolor(rsi_value &lt; rsi_oversold ? color.new(color.green, 90) : na)

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
  
  const chartRef = useRef(null);
  
  const symbols = ['BBRI', 'BBCA', 'BMRI', 'BBNI', 'TLKM', 'ASII', 'UNVR', 'GGRM', 'ICBP', 'KLBF'];
  const timeframes = ['1m', '5m', '15m', '30m', '1H', '2H', '4H', '1D', '1W', '1M'];
  
  const chartData = generateCandlestickData(selectedSymbol);
  const latestPrice = chartData[chartData.length - 1];
  const previousPrice = chartData[chartData.length - 2];
  const priceChange = latestPrice?.close && previousPrice?.close ? latestPrice.close - previousPrice.close : 0;
  const priceChangePercent = previousPrice?.close ? (priceChange / previousPrice.close) * 100 : 0;

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
                className="px-3 py-1 border border-border rounded-md bg-background text-foreground font-mono hover:border-primary/50 transition-colors"
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
                  className="px-2 py-1 text-xs hover:bg-primary/10 hover:text-primary transition-colors"
                >
                  {tf}
                </Button>
              ))}
            </div>
          </div>

          {/* Price Display */}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="font-mono text-lg font-medium">
                {latestPrice?.close?.toLocaleString() ?? '0'}
              </div>
              <div className={`text-sm font-medium ${priceChange >= 0 ? 'text-chart-2' : 'text-destructive'}`}>
                {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(0)} ({priceChangePercent.toFixed(2)}%)
              </div>
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
                className="w-8 h-8 p-0 hover:bg-primary/10 hover:text-primary transition-colors"
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
              className="w-8 h-8 p-0 hover:bg-primary/10 hover:text-primary transition-colors"
              title="Indicators"
            >
              <BarChart3 className="w-4 h-4" />
            </Button>
            <Button
              variant={showPineScript ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setShowPineScript(!showPineScript)}
              className="w-8 h-8 p-0 hover:bg-primary/10 hover:text-primary transition-colors"
              title="PineScript Editor"
            >
              <Code className="w-4 h-4" />
            </Button>
            <Button
              variant={showSnippets ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setShowSnippets(!showSnippets)}
              className="w-8 h-8 p-0 hover:bg-primary/10 hover:text-primary transition-colors"
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
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} ref={chartRef}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="time" 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickFormatter={(value) => new Date(value).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    orientation="right"
                    tickFormatter={(value) => value.toLocaleString()}
                  />
                  
                  {/* Main Price Line */}
                  <Line 
                    type="monotone" 
                    dataKey="close" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={false}
                    name="Close Price"
                  />
                  
                  {/* Moving Averages */}
                  {indicators.find(ind => ind.id === 'sma' && ind.active) && (
                    <>
                      <Line 
                        type="monotone" 
                        dataKey="sma20" 
                        stroke="hsl(var(--chart-2))" 
                        strokeWidth={1}
                        dot={false}
                        name="SMA 20"
                        strokeDasharray="5 5"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="sma50" 
                        stroke="hsl(var(--chart-3))" 
                        strokeWidth={1}
                        dot={false}
                        name="SMA 50"
                        strokeDasharray="10 5"
                      />
                    </>
                  )}
                </LineChart>
              </ResponsiveContainer>
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
                    <LineChart data={chartData}>
                      <Line 
                        type="monotone" 
                        dataKey="rsi" 
                        stroke="hsl(var(--chart-4))" 
                        strokeWidth={2}
                        dot={false}
                      />
                      <ReferenceLine y={70} stroke="hsl(var(--destructive))" strokeDasharray="2 2" />
                      <ReferenceLine y={30} stroke="hsl(var(--chart-2))" strokeDasharray="2 2" />
                      <YAxis hide domain={[0, 100]} />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {/* MACD */}
              {indicators.find(ind => ind.id === 'macd' && ind.active) && (
                <Card className="p-3">
                  <div className="text-xs font-medium mb-2">MACD</div>
                  <ResponsiveContainer width="100%" height={80}>
                    <LineChart data={chartData}>
                      <Line 
                        type="monotone" 
                        dataKey="macd" 
                        stroke="hsl(var(--chart-5))" 
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="signal" 
                        stroke="hsl(var(--chart-3))" 
                        strokeWidth={1}
                        dot={false}
                      />
                      <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
                      <YAxis hide />
                    </LineChart>
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
                        stroke="hsl(var(--chart-2))" 
                        fill="hsl(var(--chart-2))"
                        fillOpacity={0.2}
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
                className="hover:bg-primary/10 hover:text-primary transition-colors"
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
                      <div key={indicator.id} className="flex items-center justify-between p-2 rounded hover:bg-muted/50 transition-colors">
                        <span className="text-sm">{indicator.name}</span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant={indicator.active ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => toggleIndicator(indicator.id)}
                            className="px-2 py-1 text-xs hover:bg-primary/10 hover:text-primary transition-colors"
                          >
                            {indicator.active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          </Button>
                          <Button variant="ghost" size="sm" className="px-2 py-1 hover:bg-primary/10 hover:text-primary transition-colors">
                            <Settings className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              
              <div className="pt-4 border-t border-border">
                <Button variant="outline" className="w-full hover:bg-primary/10 hover:text-primary transition-colors" size="sm">
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
            <Card className="w-80 h-full p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium">PineScript Library</h3>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setShowSnippets(false)}
                  className="hover:bg-primary/10 hover:text-primary transition-colors"
                >
                  <EyeOff className="w-4 h-4" />
                </Button>
              </div>
              
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground mb-3">Popular Scripts</div>
                {[
                  { name: 'RSI Strategy', description: 'RSI-based trading signals' },
                  { name: 'MACD Crossover', description: 'MACD line crossovers' },
                  { name: 'Bollinger Bands', description: 'Price channel analysis' },
                  { name: 'Moving Average', description: 'SMA/EMA crossovers' },
                  { name: 'Volume Profile', description: 'Volume-based analysis' }
                ].map((script, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    className="w-full justify-start text-left p-3 h-auto hover:bg-primary/10 hover:text-primary transition-colors"
                    onClick={() => handleInsertSnippet(`// ${script.name}\n// ${script.description}\n\n// Your code here...`)}
                  >
                    <div>
                      <div className="font-medium text-sm">{script.name}</div>
                      <div className="text-xs text-muted-foreground">{script.description}</div>
                    </div>
                  </Button>
                ))}
              </div>
            </Card>
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
                  className="px-3 hover:bg-primary/10 hover:text-primary transition-colors"
                >
                  {isPlaying ? <Pause className="w-4 h-4 mr-1" /> : <Play className="w-4 h-4 mr-1" />}
                  {isPlaying ? 'Stop' : 'Run'}
                </Button>
                <Button variant="outline" size="sm" onClick={handleScriptRun} className="hover:bg-primary/10 hover:text-primary transition-colors">
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
                className="hover:bg-primary/10 hover:text-primary transition-colors"
              >
                <Zap className="w-4 h-4 mr-1" />
                Library
              </Button>
              <Button variant="outline" size="sm" className="hover:bg-primary/10 hover:text-primary transition-colors">
                <Upload className="w-4 h-4 mr-1" />
                Load
              </Button>
              <Button variant="outline" size="sm" className="hover:bg-primary/10 hover:text-primary transition-colors">
                <Save className="w-4 h-4 mr-1" />
                Save
              </Button>
              <Button variant="outline" size="sm" className="hover:bg-primary/10 hover:text-primary transition-colors">
                <Download className="w-4 h-4 mr-1" />
                Export
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setShowPineScript(false)}
                className="hover:bg-primary/10 hover:text-primary transition-colors"
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
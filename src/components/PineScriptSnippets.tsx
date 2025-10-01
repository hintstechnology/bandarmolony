import React, { useState } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Copy, Code, Zap, TrendingUp, Activity, BarChart3, Search } from 'lucide-react';

// Template PineScript snippets
const pineScriptSnippets = [
  {
    id: 'basic-indicator',
    title: 'Basic Indicator Template',
    category: 'Templates',
    icon: Code,
    description: 'Simple indicator template with input parameters',
    code: `//@version=5
indicator("My Custom Indicator", overlay=true)

// Input parameters
length = input.int(20, "Length", minval=1)
source = input.source(close, "Source")

// Calculation
result = ta.sma(source, length)

// Plot
plot(result, "SMA", color=color.blue, linewidth=2)`
  },
  {
    id: 'rsi-strategy',
    title: 'RSI Trading Strategy',
    category: 'Strategies',
    icon: TrendingUp,
    description: 'RSI-based trading strategy with alerts',
    code: `//@version=5
strategy("RSI Strategy", overlay=true)

// RSI parameters
rsi_length = input.int(14, "RSI Length")
rsi_oversold = input.int(30, "Oversold Level")
rsi_overbought = input.int(70, "Overbought Level")

// Calculate RSI
rsi = ta.rsi(close, rsi_length)

// Entry conditions
long_condition = ta.crossover(rsi, rsi_oversold)
short_condition = ta.crossunder(rsi, rsi_overbought)

// Execute trades
if long_condition
    strategy.entry("Long", strategy.long)
if short_condition
    strategy.entry("Short", strategy.short)

// Plot signals
plotshape(long_condition, style=shape.triangleup, location=location.belowbar, color=color.green, size=size.small)
plotshape(short_condition, style=shape.triangledown, location=location.abovebar, color=color.red, size=size.small)`
  },
  {
    id: 'multi-timeframe',
    title: 'Multi-Timeframe Analysis',
    category: 'Advanced',
    icon: Activity,
    description: 'Analyze multiple timeframes in one indicator',
    code: `//@version=5
indicator("Multi-Timeframe SMA", overlay=true)

// Input parameters
sma_length = input.int(20, "SMA Length")
higher_tf = input.timeframe("1D", "Higher Timeframe")

// Current timeframe SMA
current_sma = ta.sma(close, sma_length)

// Higher timeframe SMA
htf_sma = request.security(syminfo.tickerid, higher_tf, ta.sma(close, sma_length))

// Plot both SMAs
plot(current_sma, "Current TF SMA", color=color.blue, linewidth=1)
plot(htf_sma, "HTF SMA", color=color.red, linewidth=2)

// Background color based on trend alignment
bgcolor(close > current_sma and current_sma > htf_sma ? color.new(color.green, 90) : 
        close < current_sma and current_sma < htf_sma ? color.new(color.red, 90) : na)`
  },
  {
    id: 'volume-profile',
    title: 'Volume Profile',
    category: 'Volume',
    icon: BarChart3,
    description: 'Volume profile analysis with POC',
    code: `//@version=5
indicator("Simple Volume Profile", overlay=true)

// Input parameters
lookback = input.int(100, "Lookback Period", minval=10)
price_levels = input.int(20, "Price Levels", minval=5, maxval=50)

// Calculate price range
highest_price = ta.highest(high, lookback)
lowest_price = ta.lowest(low, lookback)
price_range = highest_price - lowest_price
level_size = price_range / price_levels

// Variables to store volume at each level
var volume_at_price = array.new<float>(price_levels, 0.0)

// Calculate volume for current bar
if barstate.isconfirmed
    for i = 0 to price_levels - 1
        level_low = lowest_price + i * level_size
        level_high = level_low + level_size
        
        if low <= level_high and high >= level_low
            current_volume = array.get(volume_at_price, i)
            array.set(volume_at_price, i, current_volume + volume)

// Find POC (Point of Control - highest volume level)
max_volume = 0.0
poc_level = 0
if barstate.islast
    for i = 0 to price_levels - 1
        vol = array.get(volume_at_price, i)
        if vol > max_volume
            max_volume := vol
            poc_level := i

// Plot POC
poc_price = lowest_price + poc_level * level_size
plot(poc_price, "POC", color=color.yellow, linewidth=3, style=plot.style_line)`
  },
  {
    id: 'bollinger-squeeze',
    title: 'Bollinger Band Squeeze',
    category: 'Volatility',
    icon: Zap,
    description: 'Detect low volatility squeeze conditions',
    code: `//@version=5
indicator("Bollinger Squeeze", overlay=false)

// Input parameters
bb_length = input.int(20, "Bollinger Length")
bb_mult = input.float(2.0, "Bollinger Multiplier")
kc_length = input.int(20, "Keltner Length")
kc_mult = input.float(1.5, "Keltner Multiplier")

// Bollinger Bands
bb_basis = ta.sma(close, bb_length)
bb_dev = bb_mult * ta.stdev(close, bb_length)
bb_upper = bb_basis + bb_dev
bb_lower = bb_basis - bb_dev

// Keltner Channels
kc_ma = ta.sma(close, kc_length)
kc_range = ta.atr(kc_length) * kc_mult
kc_upper = kc_ma + kc_range
kc_lower = kc_ma - kc_range

// Squeeze condition
squeeze = bb_lower > kc_lower and bb_upper < kc_upper
no_squeeze = bb_lower <= kc_lower or bb_upper >= kc_upper

// Momentum
momentum = ta.linreg(close - math.avg(math.avg(ta.highest(high, kc_length), ta.lowest(low, kc_length)), ta.sma(close, kc_length)), kc_length, 0)

// Plot
plot(momentum, "Momentum", color=momentum > 0 ? color.lime : color.red, style=plot.style_histogram, linewidth=3)
plot(0, "Zero Line", color=color.gray, style=plot.style_line)

// Background color for squeeze
bgcolor(squeeze ? color.new(color.red, 90) : na, title="Squeeze Background")`
  },
  {
    id: 'support-resistance',
    title: 'Dynamic Support/Resistance',
    category: 'Support/Resistance',
    icon: TrendingUp,
    description: 'Automatically detect support and resistance levels',
    code: `//@version=5
indicator("Dynamic S/R", overlay=true)

// Input parameters
pivot_length = input.int(5, "Pivot Length", minval=2)
max_levels = input.int(10, "Max S/R Levels", minval=5, maxval=20)

// Variables to store S/R levels
var support_levels = array.new<float>()
var resistance_levels = array.new<float>()

// Detect pivot highs and lows
pivot_high = ta.pivothigh(high, pivot_length, pivot_length)
pivot_low = ta.pivotlow(low, pivot_length, pivot_length)

// Add new resistance level
if not na(pivot_high)
    array.push(resistance_levels, pivot_high)
    if array.size(resistance_levels) > max_levels
        array.shift(resistance_levels)

// Add new support level  
if not na(pivot_low)
    array.push(support_levels, pivot_low)
    if array.size(support_levels) > max_levels
        array.shift(support_levels)

// Plot support levels
if barstate.islast and array.size(support_levels) > 0
    for i = 0 to array.size(support_levels) - 1
        level = array.get(support_levels, i)
        line.new(bar_index - 50, level, bar_index, level, color=color.green, width=1, style=line.style_dashed)

// Plot resistance levels
if barstate.islast and array.size(resistance_levels) > 0
    for i = 0 to array.size(resistance_levels) - 1
        level = array.get(resistance_levels, i)
        line.new(bar_index - 50, level, bar_index, level, color=color.red, width=1, style=line.style_dashed)`
  }
];

interface PineScriptSnippetsProps {
  onInsertSnippet: (code: string) => void;
}

export function PineScriptSnippets({ onInsertSnippet }: PineScriptSnippetsProps) {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');

  const categories = ['All', 'Templates', 'Strategies', 'Advanced', 'Volume', 'Volatility', 'Support/Resistance'];

  const filteredSnippets = pineScriptSnippets.filter(snippet => {
    const matchesCategory = selectedCategory === 'All' || snippet.category === selectedCategory;
    const matchesSearch = snippet.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         snippet.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
  };

  return (
    <Card className="w-80 p-4 h-full overflow-hidden flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium">PineScript Library</h3>
        <div className="flex items-center gap-2">
          <Code className="w-4 h-4" />
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search snippets..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-1 mb-4">
        {categories.map(category => (
          <Button
            key={category}
            variant={selectedCategory === category ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedCategory(category)}
            className="text-xs px-2 py-1"
          >
            {category}
          </Button>
        ))}
      </div>

      {/* Snippets List */}
      <div className="flex-1 overflow-y-auto space-y-3">
        {filteredSnippets.map(snippet => (
          <Card key={snippet.id} className="p-3 hover:bg-muted/50 transition-colors">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <snippet.icon className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium text-sm">{snippet.title}</span>
              </div>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                {snippet.category}
              </span>
            </div>
            
            <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
              {snippet.description}
            </p>

            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                {snippet.code.split('\n').length} lines
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(snippet.code)}
                  className="px-2 py-1 text-xs"
                  title="Copy to clipboard"
                >
                  <Copy className="w-3 h-3" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onInsertSnippet(snippet.code)}
                  className="px-2 py-1 text-xs"
                >
                  Insert
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filteredSnippets.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Code className="w-8 h-8 mb-2" />
          <p className="text-sm">No snippets found</p>
          <p className="text-xs">Try adjusting your search or category filter</p>
        </div>
      )}
    </Card>
  );
}
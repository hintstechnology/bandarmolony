import React from 'react';
import { 
  SMASettings, 
  RSISettings, 
  MACDSettings, 
  VolumeHistogramSettings, 
  BuySellFrequencySettings, 
  StochasticSettings 
} from './settings';
import { SHIO_INFO } from './DailyShio';
import { ELEMENT_INFO } from './DailyElement';

export interface IndicatorEditorProps {
  indicator: any;
  onSave: (indicator: any) => void;
  onCancel: () => void;
  volumeHistogramSettings: any;
  setVolumeHistogramSettings: any;
}

export function IndicatorEditor({ 
  indicator, 
  onSave, 
  onCancel,
  volumeHistogramSettings,
  setVolumeHistogramSettings
}: IndicatorEditorProps) {
  const [editedIndicator, setEditedIndicator] = React.useState<any>(indicator);

  const handleSave = () => {
    onSave(editedIndicator);
  };

  const renderIndicatorSettings = () => {
    switch (editedIndicator.type) {
      case 'ma':
        return <SMASettings editedIndicator={editedIndicator} setEditedIndicator={setEditedIndicator} />;

      case 'rsi':
        return <RSISettings editedIndicator={editedIndicator} setEditedIndicator={setEditedIndicator} />;

      case 'macd':
        return <MACDSettings editedIndicator={editedIndicator} setEditedIndicator={setEditedIndicator} />;

      case 'volume_histogram':
        return (
          <VolumeHistogramSettings 
            editedIndicator={editedIndicator} 
            setEditedIndicator={setEditedIndicator}
            volumeHistogramSettings={volumeHistogramSettings}
            setVolumeHistogramSettings={setVolumeHistogramSettings}
          />
        );

      case 'buy_sell_frequency':
        return <BuySellFrequencySettings editedIndicator={editedIndicator} setEditedIndicator={setEditedIndicator} />;

      case 'stochastic':
        return <StochasticSettings editedIndicator={editedIndicator} setEditedIndicator={setEditedIndicator} />;

      case 'daily_shio':
      case 'daily_element':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-2">Day Limit</label>
              <input
                type="number"
                min="1"
                max="365"
                value={editedIndicator.dayLimit || 30}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  setEditedIndicator(prev => ({ 
                    ...prev, 
                    dayLimit: isNaN(value) ? 30 : Math.max(1, Math.min(365, value))
                  }));
                }}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Number of emoji/shape markers to display (1-365). Default: 30 markers
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Display Mode</label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="displayMode"
                    value="emoji"
                    checked={(editedIndicator.displayMode || 'emoji') === 'emoji'}
                    onChange={(e) => {
                      setEditedIndicator(prev => ({ 
                        ...prev, 
                        displayMode: 'emoji' as const
                      }));
                    }}
                    className="w-4 h-4 text-primary"
                  />
                  <span className="text-sm">Emoji</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="displayMode"
                    value="shape"
                    checked={editedIndicator.displayMode === 'shape'}
                    onChange={(e) => {
                      setEditedIndicator(prev => ({ 
                        ...prev, 
                        displayMode: 'shape' as const,
                        shape: prev.shape || 'circle',
                        shapeColors: prev.shapeColors || {}
                      }));
                    }}
                    className="w-4 h-4 text-primary"
                  />
                  <span className="text-sm">Shape</span>
                </label>
              </div>
            </div>

            {editedIndicator.displayMode === 'shape' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2">Shape</label>
                  <select
                    value={editedIndicator.shape || 'circle'}
                    onChange={(e) => {
                      setEditedIndicator(prev => ({ 
                        ...prev, 
                        shape: e.target.value as 'circle' | 'square' | 'arrowUp' | 'arrowDown'
                      }));
                    }}
                    className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
                  >
                    <option value="circle">Circle</option>
                    <option value="square">Square</option>
                    <option value="arrowUp">Arrow Up</option>
                    <option value="arrowDown">Arrow Down</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">
                    {editedIndicator.type === 'daily_shio' ? 'Shio Colors' : 'Element Colors'}
                  </label>
                  <div className="space-y-2 max-h-60 overflow-y-auto border border-border rounded-md p-2">
                    {(editedIndicator.type === 'daily_shio' ? SHIO_INFO : ELEMENT_INFO).map((item) => {
                      const currentColor = editedIndicator.shapeColors?.[item.name] || item.color;
                      return (
                        <div key={item.name} className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1">
                            <span style={{ fontSize: '16px' }}>{item.emoji}</span>
                            <span className="text-sm text-foreground">{item.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={currentColor}
                              onChange={(e) => {
                                setEditedIndicator(prev => ({ 
                                  ...prev, 
                                  shapeColors: {
                                    ...(prev.shapeColors || {}),
                                    [item.name]: e.target.value
                                  }
                                }));
                              }}
                              className="h-8 w-16 border border-border rounded-md cursor-pointer"
                            />
                            <input
                              type="text"
                              value={currentColor}
                              onChange={(e) => {
                                setEditedIndicator(prev => ({ 
                                  ...prev, 
                                  shapeColors: {
                                    ...(prev.shapeColors || {}),
                                    [item.name]: e.target.value
                                  }
                                }));
                              }}
                              placeholder={item.color}
                              className="w-20 px-2 py-1 text-xs border border-border rounded-md bg-background text-foreground"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Custom colors for each {editedIndicator.type === 'daily_shio' ? 'shio' : 'element'} shape markers
                  </p>
                </div>
              </>
            )}
          </div>
        );

      default:
        return <div>Unknown indicator type</div>;
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Indicator Name</label>
        <input
          type="text"
          value={editedIndicator.name}
          onChange={(e) => setEditedIndicator(prev => ({ ...prev, name: e.target.value }))}
          className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
        />
      </div>

      {renderIndicatorSettings()}

      <div className="flex gap-2 pt-4">
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          Save Changes
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 border border-border rounded-md hover:bg-accent"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

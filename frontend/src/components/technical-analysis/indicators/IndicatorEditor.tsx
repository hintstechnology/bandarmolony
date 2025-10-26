import React from 'react';
import { 
  SMASettings, 
  RSISettings, 
  MACDSettings, 
  VolumeHistogramSettings, 
  BuySellFrequencySettings, 
  StochasticSettings 
} from './settings';

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
                Number of days to display (1-365). Default: 30 days
              </p>
            </div>
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

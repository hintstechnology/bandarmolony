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

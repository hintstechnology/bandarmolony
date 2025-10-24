import React from 'react';

export interface VolumeHistogramSettingsProps {
  editedIndicator: any;
  setEditedIndicator: (indicator: any) => void;
  volumeHistogramSettings: any;
  setVolumeHistogramSettings: (settings: any) => void;
}

export function VolumeHistogramSettings({ 
  editedIndicator, 
  setEditedIndicator, 
  volumeHistogramSettings, 
  setVolumeHistogramSettings 
}: VolumeHistogramSettingsProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Base Color</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={editedIndicator.color}
            onChange={(e) => setEditedIndicator(prev => ({ ...prev, color: e.target.value }))}
            className="w-8 h-8 border border-border rounded cursor-pointer"
          />
          <span className="text-sm text-muted-foreground">{editedIndicator.color}</span>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">Chart Type</label>
        <select
          value={editedIndicator.separateScale ? 'separate' : 'overlay'}
          onChange={(e) => setEditedIndicator(prev => ({ ...prev, separateScale: e.target.value === 'separate' }))}
          className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
        >
          <option value="overlay">Overlay on Main Chart</option>
          <option value="separate">Separate Chart Below</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">Volume Colors</label>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Up Color (Price Rising)</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={volumeHistogramSettings.upColor}
                onChange={(e) => setVolumeHistogramSettings((prev: any) => ({ ...prev, upColor: e.target.value }))}
                className="w-8 h-6 border border-border rounded cursor-pointer"
              />
              <span className="text-xs text-muted-foreground font-mono">{volumeHistogramSettings.upColor}</span>
            </div>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Down Color (Price Falling)</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={volumeHistogramSettings.downColor}
                onChange={(e) => setVolumeHistogramSettings((prev: any) => ({ ...prev, downColor: e.target.value }))}
                className="w-8 h-6 border border-border rounded cursor-pointer"
              />
              <span className="text-xs text-muted-foreground font-mono">{volumeHistogramSettings.downColor}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

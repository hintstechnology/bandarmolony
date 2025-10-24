import React from 'react';

export interface SMASettingsProps {
  editedIndicator: any;
  setEditedIndicator: (indicator: any) => void;
}

export function SMASettings({ editedIndicator, setEditedIndicator }: SMASettingsProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Period</label>
        <input
          type="number"
          value={editedIndicator.period}
          onChange={(e) => setEditedIndicator(prev => ({ ...prev, period: parseInt(e.target.value) || (prev.period || 20) }))}
          className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
          min="1"
          max="200"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">Mode</label>
        <select
          value={editedIndicator.maMode || 'simple'}
          onChange={(e) => setEditedIndicator(prev => ({ 
            ...prev, 
            type: 'ma',
            maMode: (e.target.value as 'simple' | 'exponential'),
            name: `MA (${e.target.value === 'exponential' ? 'Exponential' : 'Simple'})`
          }))}
          className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
        >
          <option value="simple">Simple</option>
          <option value="exponential">Exponential</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">Color</label>
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
    </div>
  );
}

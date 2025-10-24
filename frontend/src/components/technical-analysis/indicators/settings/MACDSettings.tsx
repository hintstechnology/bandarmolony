import React from 'react';

export interface MACDSettingsProps {
  editedIndicator: any;
  setEditedIndicator: (indicator: any) => void;
}

export function MACDSettings({ editedIndicator, setEditedIndicator }: MACDSettingsProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Fast Period</label>
        <input
          type="number"
          value={12}
          className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
          disabled
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">Slow Period</label>
        <input
          type="number"
          value={26}
          className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
          disabled
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">Signal Period</label>
        <input
          type="number"
          value={9}
          className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
          disabled
        />
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
    </div>
  );
}

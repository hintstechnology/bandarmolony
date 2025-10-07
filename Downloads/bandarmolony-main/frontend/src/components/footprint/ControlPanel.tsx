import React from 'react';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { ZoomIn, ZoomOut, Download, Settings, Moon, Sun, X } from 'lucide-react';

interface ControlPanelProps {
  showCrosshair: boolean;
  showPOC: boolean;
  showDelta: boolean;
  timeframe: string;
  zoom: number;
  isOpen: boolean;
  onClose: () => void;
  onToggleCrosshair: () => void;
  onTogglePOC: () => void;
  onToggleDelta: () => void;
  onTimeframeChange: (value: string) => void;
  onZoom: (delta: number) => void;
  onExport: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  showCrosshair,
  showPOC,
  showDelta,
  timeframe,
  zoom,
  isOpen,
  onClose,
  onToggleCrosshair,
  onTogglePOC,
  onToggleDelta,
  onTimeframeChange,
  onZoom,
  onExport
}) => {
  if (!isOpen) return null;

  // Get theme colors
  const getThemeColors = () => {
    const isDark = document.documentElement.classList.contains('dark');
    return {
      backgroundColor: isDark ? '#1E222D' : '#FFFFFF',
      textColor: isDark ? '#f9fafb' : '#111827',
      borderColor: isDark ? '#2A2E39' : '#E1E3E6',
      mutedTextColor: isDark ? '#9ca3af' : '#6b7280'
    };
  };

  const themeColors = getThemeColors();

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="relative w-80 max-w-sm max-h-[70vh] rounded-lg shadow-xl" style={{ 
          width: '320px', 
          maxWidth: '90vw',
          backgroundColor: themeColors.backgroundColor,
          color: themeColors.textColor
        }}>
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: themeColors.borderColor }}>
            <h2 className="text-lg font-semibold" style={{ color: themeColors.textColor }}>
              Chart Settings
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Content */}
          <div className="p-3 max-h-[calc(70vh-70px)] overflow-y-auto">
            <div className="space-y-4">
              {/* Display Controls */}
              <div>
                <h3 className="font-medium mb-2 flex items-center gap-2" style={{ color: themeColors.textColor }}>
                  <Settings className="w-4 h-4" />
                  Display
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm" style={{ color: themeColors.mutedTextColor }}>Show Crosshair</label>
                    <input
                      type="checkbox"
                      checked={showCrosshair}
                      onChange={onToggleCrosshair}
                      className="w-4 h-4"
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <label className="text-sm" style={{ color: themeColors.mutedTextColor }}>Point of Control</label>
                    <input
                      type="checkbox"
                      checked={showPOC}
                      onChange={onTogglePOC}
                      className="w-4 h-4"
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <label className="text-sm" style={{ color: themeColors.mutedTextColor }}>Delta Mapping</label>
                    <input
                      type="checkbox"
                      checked={showDelta}
                      onChange={onToggleDelta}
                      className="w-4 h-4"
                    />
                  </div>
                </div>
              </div>
              
              <hr style={{ borderColor: themeColors.borderColor }} />
              
              {/* Timeframe */}
              <div>
                <h3 className="font-medium mb-2" style={{ color: themeColors.textColor }}>Timeframe</h3>
                <Select value={timeframe} onValueChange={onTimeframeChange}>
                  <SelectTrigger style={{ 
                    backgroundColor: themeColors.backgroundColor,
                    borderColor: themeColors.borderColor,
                    color: themeColors.textColor
                  }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent style={{ 
                    backgroundColor: themeColors.backgroundColor,
                    borderColor: themeColors.borderColor
                  }}>
                    <SelectItem value="1m">1 Minute</SelectItem>
                    <SelectItem value="5m">5 Minutes</SelectItem>
                    <SelectItem value="15m">15 Minutes</SelectItem>
                    <SelectItem value="1h">1 Hour</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <hr style={{ borderColor: themeColors.borderColor }} />
              
              {/* Export */}
              <div>
                <h3 className="font-medium mb-2" style={{ color: themeColors.textColor }}>Export</h3>
                <Button 
                  className="w-full" 
                  variant="outline"
                  onClick={onExport}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export Chart
                </Button>
              </div>
              
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

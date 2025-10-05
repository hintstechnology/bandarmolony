import React from 'react';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Separator } from './ui/separator';
import { Switch } from './ui/switch';
import { ZoomIn, ZoomOut, Download, Settings, Moon, Sun, X } from 'lucide-react';

interface ControlPanelProps {
  showCrosshair: boolean;
  showPOC: boolean;
  showDelta: boolean;
  timeframe: string;
  zoom: number;
  darkMode: boolean;
  isOpen: boolean;
  onClose: () => void;
  onToggleCrosshair: () => void;
  onTogglePOC: () => void;
  onToggleDelta: () => void;
  onTimeframeChange: (value: string) => void;
  onZoom: (delta: number) => void;
  onExport: () => void;
  onToggleDarkMode: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  showCrosshair,
  showPOC,
  showDelta,
  timeframe,
  zoom,
  darkMode,
  isOpen,
  onClose,
  onToggleCrosshair,
  onTogglePOC,
  onToggleDelta,
  onTimeframeChange,
  onZoom,
  onExport,
  onToggleDarkMode
}) => {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className={`relative w-80 max-w-sm max-h-[70vh] rounded-lg shadow-xl ${darkMode ? 'bg-gray-800' : 'bg-white'}`} style={{ width: '320px', maxWidth: '90vw' }}>
          {/* Header */}
          <div className={`flex items-center justify-between p-3 border-b ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
            <h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
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
              {/* Theme Toggle */}
              <div>
                <h3 className={`font-medium mb-2 flex items-center gap-2 ${darkMode ? 'text-white' : 'text-[#2E2E2E]'}`}>
                  {darkMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                  Theme
                </h3>
                <div className="flex items-center justify-between">
                  <label className={`text-sm ${darkMode ? 'text-gray-300' : 'text-[#666666]'}`}>Dark Mode</label>
                  <Switch
                    checked={darkMode}
                    onCheckedChange={onToggleDarkMode}
                  />
                </div>
              </div>

              <Separator className={darkMode ? 'bg-gray-600' : ''} />

              {/* Display Controls */}
              <div>
                <h3 className={`font-medium mb-2 flex items-center gap-2 ${darkMode ? 'text-white' : 'text-[#2E2E2E]'}`}>
                  <Settings className="w-4 h-4" />
                  Display
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className={`text-sm ${darkMode ? 'text-gray-300' : 'text-[#666666]'}`}>Show Crosshair</label>
                    <Switch
                      checked={showCrosshair}
                      onCheckedChange={onToggleCrosshair}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <label className={`text-sm ${darkMode ? 'text-gray-300' : 'text-[#666666]'}`}>Point of Control</label>
                    <Switch
                      checked={showPOC}
                      onCheckedChange={onTogglePOC}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <label className={`text-sm ${darkMode ? 'text-gray-300' : 'text-[#666666]'}`}>Delta Mapping</label>
                    <Switch
                      checked={showDelta}
                      onCheckedChange={onToggleDelta}
                    />
                  </div>
                </div>
              </div>
              
              <Separator className={darkMode ? 'bg-gray-600' : ''} />
              
              {/* Timeframe */}
              <div>
                <h3 className={`font-medium mb-2 ${darkMode ? 'text-white' : 'text-[#2E2E2E]'}`}>Timeframe</h3>
                <Select value={timeframe} onValueChange={onTimeframeChange}>
                  <SelectTrigger className={darkMode ? 'bg-gray-700 border-gray-600 text-white' : ''}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={darkMode ? 'bg-gray-700 border-gray-600' : ''}>
                    <SelectItem value="1m">1 Minute</SelectItem>
                    <SelectItem value="5m">5 Minutes</SelectItem>
                    <SelectItem value="15m">15 Minutes</SelectItem>
                    <SelectItem value="1h">1 Hour</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <Separator className={darkMode ? 'bg-gray-600' : ''} />
              
              
              {/* Export */}
              <div>
                <h3 className={`font-medium mb-2 ${darkMode ? 'text-white' : 'text-[#2E2E2E]'}`}>Export</h3>
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
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { Play, Square, Loader2, CheckCircle, Database, RefreshCw } from "lucide-react";
import { useToast } from "../../../contexts/ToastContext";
import { api } from "../../../services/api";

const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';

export function DataSchedulerControl() {
  const { showToast } = useToast();
  
  // Data Scheduler States
  const [rrcStatus, setRrcStatus] = useState<any>(null);
  const [rrgStatus, setRrgStatus] = useState<any>(null);
  const [seasonalStatus, setSeasonalStatus] = useState<any>(null);
  const [trendFilterStatus, setTrendFilterStatus] = useState<any>(null);
  const [generationStatus, setGenerationStatus] = useState<any>(null);
  const [debugMessage, setDebugMessage] = useState<string>('');
  const [triggering, setTriggering] = useState<{[key: string]: boolean}>({});

  // Data Scheduler Functions
  const loadStatus = async () => {
    try {
      const [rrcResult, rrgResult, seasonalResult, trendFilterResult, generationResult] = await Promise.all([
        api.getRRCStatus(),
        api.getRRGStatus(),
        api.getSeasonalityStatus(),
        api.getTrendFilterStatus(),
        api.getGenerationStatus()
      ]);
      
      if (rrcResult.success) setRrcStatus(rrcResult.data);
      if (rrgResult.success) setRrgStatus(rrgResult.data);
      if (seasonalResult.success) setSeasonalStatus(seasonalResult.data);
      if (trendFilterResult.success) setTrendFilterStatus(trendFilterResult.data);
      if (generationResult.success) setGenerationStatus(generationResult.data);
    } catch (error) {
      console.error('Error loading status:', error);
    }
  };

  const handleTriggerDataUpdate = async (type: string) => {
    setTriggering(prev => ({ ...prev, [type]: true }));
    
    try {
      const response = await fetch(`${API_URL}/api/trigger/${type}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      const result = await response.json();
      
      if (result.success) {
        showToast({ type: 'success', title: 'Success', message: `${type} data update triggered successfully` });
      } else {
        showToast({ type: 'error', title: 'Error', message: `Failed to trigger ${type} update: ${result.message}` });
      }
    } catch (error) {
      console.error(`Error triggering ${type} update:`, error);
      showToast({ type: 'error', title: 'Error', message: `Error triggering ${type} update` });
    } finally {
      setTriggering(prev => ({ ...prev, [type]: false }));
    }
  };

  const handleStopGeneration = async () => {
    setDebugMessage('Stopping all generation processes...');
    
    try {
      const [rrcResult, rrgResult] = await Promise.all([
        api.stopRRCGeneration(),
        api.stopRRGGeneration()
      ]);
      
      const rrcSuccess = rrcResult.success;
      const rrgSuccess = rrgResult.success;
      
      if (rrcSuccess && rrgSuccess) {
        setDebugMessage('✅ All generation stopped successfully');
        showToast({
          type: 'success',
          title: 'Generation Stopped',
          message: 'All data generation has been stopped'
        });
      } else if (rrcSuccess || rrgSuccess) {
        const stopped = [];
        if (rrcSuccess) stopped.push('RRC');
        if (rrgSuccess) stopped.push('RRG');
        
        setDebugMessage(`⚠️ Partially stopped: ${stopped.join(', ')}`);
        showToast({
          type: 'warning',
          title: 'Partially Stopped',
          message: `Stopped: ${stopped.join(', ')}`
        });
      } else {
        const errors = [];
        if (rrcResult.error) errors.push(`RRC: ${rrcResult.error}`);
        if (rrgResult.error) errors.push(`RRG: ${rrgResult.error}`);
        
        setDebugMessage(`❌ Failed to stop: ${errors.join(', ')}`);
        showToast({
          type: 'error',
          title: 'Stop Failed',
          message: 'Failed to stop generation'
        });
      }
      
      setTimeout(() => {
        loadStatus();
      }, 1000);
    } catch (error) {
      const errorMsg = `❌ Error: ${error}`;
      setDebugMessage(errorMsg);
      showToast({
        type: 'error',
        title: 'Stop Error',
        message: 'Failed to stop generation'
      });
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const getStatusIcon = (isGenerating: boolean) => {
    if (isGenerating) {
      return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
    }
    return <CheckCircle className="w-4 h-4 text-green-500" />;
  };

  const getStatusBadge = (isGenerating: boolean) => {
    return (
      <Badge variant={isGenerating ? "default" : "secondary"}>
        {isGenerating ? "Generating" : "Idle"}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="w-5 h-5" />
          Data Scheduler Control
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status Overview */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              {getStatusIcon(rrcStatus?.isGenerating || false)}
              <div>
                <h3 className="font-medium">RRC Generation</h3>
                <p className="text-sm text-muted-foreground">
                  {rrcStatus?.progress?.current || 'Ready'}
                </p>
              </div>
            </div>
            {getStatusBadge(rrcStatus?.isGenerating || false)}
          </div>
          
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              {getStatusIcon(rrgStatus?.isGenerating || false)}
              <div>
                <h3 className="font-medium">RRG Generation</h3>
                <p className="text-sm text-muted-foreground">
                  {rrgStatus?.progress?.current || 'Ready'}
                </p>
              </div>
            </div>
            {getStatusBadge(rrgStatus?.isGenerating || false)}
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              {getStatusIcon(seasonalStatus?.isGenerating || false)}
              <div>
                <h3 className="font-medium">Seasonal Calculation</h3>
                <p className="text-sm text-muted-foreground">
                  {seasonalStatus?.progress?.current || 'Ready'}
                </p>
              </div>
            </div>
            {getStatusBadge(seasonalStatus?.isGenerating || false)}
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              {getStatusIcon(trendFilterStatus?.isGenerating || false)}
              <div>
                <h3 className="font-medium">Trend Filter</h3>
                <p className="text-sm text-muted-foreground">
                  {trendFilterStatus?.progress?.current || 'Ready'}
                </p>
              </div>
            </div>
            {getStatusBadge(trendFilterStatus?.isGenerating || false)}
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              {getStatusIcon(generationStatus?.isGenerating || false)}
              <div>
                <h3 className="font-medium">Phase 1 Calculations</h3>
                <p className="text-sm text-muted-foreground">
                  {generationStatus?.progress?.current || 'Ready'}
                </p>
              </div>
            </div>
            {getStatusBadge(generationStatus?.isGenerating || false)}
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              {getStatusIcon(generationStatus?.phase2Generating || false)}
              <div>
                <h3 className="font-medium">Phase 2 Calculations</h3>
                <p className="text-sm text-muted-foreground">
                  {generationStatus?.phase2Progress?.current || 'Ready'}
                </p>
              </div>
            </div>
            {getStatusBadge(generationStatus?.phase2Generating || false)}
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleStopGeneration}
            disabled={!rrcStatus?.isGenerating && !rrgStatus?.isGenerating && !seasonalStatus?.isGenerating && !trendFilterStatus?.isGenerating && !generationStatus?.isGenerating && !generationStatus?.phase2Generating}
            variant="destructive"
            size="sm"
          >
            <Square className="w-3 h-3 mr-1" />
            Stop All
          </Button>
          
          <Button
            onClick={loadStatus}
            variant="outline"
            size="sm"
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Refresh Status
          </Button>
        </div>

        {/* Debug Message */}
        {debugMessage && (
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm font-mono">{debugMessage}</p>
          </div>
        )}

        {/* Data Input Controls */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Data Input Updates</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Stock Data */}
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold mb-2">Stock Data</h4>
              <p className="text-sm text-muted-foreground mb-3">Update stock data from TICMI API</p>
              <Button
                onClick={() => handleTriggerDataUpdate('stock')}
                disabled={triggering['stock']}
                className="w-full"
                size="sm"
              >
                {triggering['stock'] ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                {triggering['stock'] ? 'Updating...' : 'Trigger Update'}
              </Button>
            </div>

            {/* Index Data */}
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold mb-2">Index Data</h4>
              <p className="text-sm text-muted-foreground mb-3">Update index data from TICMI API</p>
              <Button
                onClick={() => handleTriggerDataUpdate('index')}
                disabled={triggering['index']}
                className="w-full"
                size="sm"
              >
                {triggering['index'] ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                {triggering['index'] ? 'Updating...' : 'Trigger Update'}
              </Button>
            </div>

            {/* Done Summary Data */}
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold mb-2">Done Summary Data</h4>
              <p className="text-sm text-muted-foreground mb-3">Update done summary from GCS</p>
              <Button
                onClick={() => handleTriggerDataUpdate('done-summary')}
                disabled={triggering['done-summary']}
                className="w-full"
                size="sm"
              >
                {triggering['done-summary'] ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                {triggering['done-summary'] ? 'Updating...' : 'Trigger Update'}
              </Button>
            </div>

            {/* Shareholders Data */}
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold mb-2">Shareholders Data</h4>
              <p className="text-sm text-muted-foreground mb-3">Update shareholders data (Monthly)</p>
              <Button
                onClick={() => handleTriggerDataUpdate('shareholders')}
                disabled={triggering['shareholders']}
                className="w-full"
                size="sm"
              >
                {triggering['shareholders'] ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                {triggering['shareholders'] ? 'Updating...' : 'Trigger Update'}
              </Button>
            </div>

            {/* Holding Data */}
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold mb-2">Holding Data</h4>
              <p className="text-sm text-muted-foreground mb-3">Update holding data (Monthly)</p>
              <Button
                onClick={() => handleTriggerDataUpdate('holding')}
                disabled={triggering['holding']}
                className="w-full"
                size="sm"
              >
                {triggering['holding'] ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                {triggering['holding'] ? 'Updating...' : 'Trigger Update'}
              </Button>
            </div>
          </div>
        </div>

        {/* Calculation Controls */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Data Calculations</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* RRC Calculation */}
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold mb-2">RRC Calculation</h4>
              <p className="text-sm text-muted-foreground mb-3">Calculate Relative Rotation Chart data</p>
              <Button
                onClick={() => handleTriggerDataUpdate('rrc')}
                disabled={triggering['rrc']}
                className="w-full"
                size="sm"
              >
                {triggering['rrc'] ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                {triggering['rrc'] ? 'Calculating...' : 'Trigger Calculation'}
              </Button>
            </div>

            {/* RRG Calculation */}
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold mb-2">RRG Calculation</h4>
              <p className="text-sm text-muted-foreground mb-3">Calculate Relative Rotation Graph data</p>
              <Button
                onClick={() => handleTriggerDataUpdate('rrg')}
                disabled={triggering['rrg']}
                className="w-full"
                size="sm"
              >
                {triggering['rrg'] ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                {triggering['rrg'] ? 'Calculating...' : 'Trigger Calculation'}
              </Button>
            </div>

            {/* Seasonal Calculation */}
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold mb-2">Seasonal Calculation</h4>
              <p className="text-sm text-muted-foreground mb-3">Calculate seasonal analysis data</p>
              <Button
                onClick={() => handleTriggerDataUpdate('seasonal')}
                disabled={triggering['seasonal']}
                className="w-full"
                size="sm"
              >
                {triggering['seasonal'] ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                {triggering['seasonal'] ? 'Calculating...' : 'Trigger Calculation'}
              </Button>
            </div>

            {/* Trend Filter Calculation */}
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold mb-2">Trend Filter Calculation</h4>
              <p className="text-sm text-muted-foreground mb-3">Calculate trend filter data</p>
              <Button
                onClick={() => handleTriggerDataUpdate('trend-filter')}
                disabled={triggering['trend-filter']}
                className="w-full"
                size="sm"
              >
                {triggering['trend-filter'] ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                {triggering['trend-filter'] ? 'Calculating...' : 'Trigger Calculation'}
              </Button>
            </div>

            {/* Accumulation Distribution */}
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold mb-2">Accumulation Distribution</h4>
              <p className="text-sm text-muted-foreground mb-3">Calculate accumulation distribution data</p>
              <Button
                onClick={() => handleTriggerDataUpdate('accumulation')}
                disabled={triggering['accumulation']}
                className="w-full"
                size="sm"
              >
                {triggering['accumulation'] ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                {triggering['accumulation'] ? 'Calculating...' : 'Trigger Calculation'}
              </Button>
            </div>

            {/* Bid/Ask Footprint */}
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold mb-2">Bid/Ask Footprint</h4>
              <p className="text-sm text-muted-foreground mb-3">Calculate bid/ask footprint data</p>
              <Button
                onClick={() => handleTriggerDataUpdate('bidask')}
                disabled={triggering['bidask']}
                className="w-full"
                size="sm"
              >
                {triggering['bidask'] ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                {triggering['bidask'] ? 'Calculating...' : 'Trigger Calculation'}
              </Button>
            </div>

            {/* Broker Data */}
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold mb-2">Broker Data</h4>
              <p className="text-sm text-muted-foreground mb-3">Calculate broker data analysis</p>
              <Button
                onClick={() => handleTriggerDataUpdate('broker-data')}
                disabled={triggering['broker-data']}
                className="w-full"
                size="sm"
              >
                {triggering['broker-data'] ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                {triggering['broker-data'] ? 'Calculating...' : 'Trigger Calculation'}
              </Button>
            </div>

            {/* Broker Inventory */}
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold mb-2">Broker Inventory</h4>
              <p className="text-sm text-muted-foreground mb-3">Calculate broker inventory data</p>
              <Button
                onClick={() => handleTriggerDataUpdate('broker-inventory')}
                disabled={triggering['broker-inventory']}
                className="w-full"
                size="sm"
              >
                {triggering['broker-inventory'] ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                {triggering['broker-inventory'] ? 'Calculating...' : 'Trigger Calculation'}
              </Button>
            </div>

            {/* Foreign Flow */}
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold mb-2">Foreign Flow</h4>
              <p className="text-sm text-muted-foreground mb-3">Calculate foreign flow data</p>
              <Button
                onClick={() => handleTriggerDataUpdate('foreign-flow')}
                disabled={triggering['foreign-flow']}
                className="w-full"
                size="sm"
              >
                {triggering['foreign-flow'] ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                {triggering['foreign-flow'] ? 'Calculating...' : 'Trigger Calculation'}
              </Button>
            </div>

            {/* Money Flow */}
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold mb-2">Money Flow</h4>
              <p className="text-sm text-muted-foreground mb-3">Calculate money flow index data</p>
              <Button
                onClick={() => handleTriggerDataUpdate('money-flow')}
                disabled={triggering['money-flow']}
                className="w-full"
                size="sm"
              >
                {triggering['money-flow'] ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                {triggering['money-flow'] ? 'Calculating...' : 'Trigger Calculation'}
              </Button>
            </div>
          </div>
        </div>

        {/* Info Note */}
        <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            <strong>Note:</strong> All data operations run in the background and won't affect the server performance. 
            Users can continue using charts while data is being updated. Stock, Index, and Done Summary run daily at 19:00. 
            Shareholders and Holding run monthly on the last day at 00:00. The 6 new calculations run in 2 phases: 
            Phase 1 (19:00) - Broker Data, Bid/Ask, Money Flow, Foreign Flow; Phase 2 (Auto-triggered) - Broker Inventory, Accumulation Distribution.
            RRC, RRG, Seasonal, and Trend Filter calculations run daily at 19:00.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}


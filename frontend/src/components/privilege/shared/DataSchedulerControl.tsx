import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { Progress } from "../../ui/progress";
import { Play, Square, Loader2, CheckCircle, RefreshCw, X, Clock } from "lucide-react";
import { useToast } from "../../../contexts/ToastContext";
import { api } from "../../../services/api";

const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';

interface ScheduledTask {
  logId: string;
  featureName: string;
  triggerType: string;
  status: string;
  progress?: number;
  currentProcessing?: string;
  startedAt: string;
  triggeredBy?: string;
}

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
  const [activeLogs, setActiveLogs] = useState<{[key: string]: { logId: string; progress: number; status: string } | null}>({});
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(false);

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
        
        // Store log_id if provided for progress tracking (no auto polling)
        if (result.log_id) {
          setActiveLogs(prev => ({
            ...prev,
            [type]: { logId: result.log_id, progress: 0, status: 'running' }
          }));
        }
      } else {
        showToast({ type: 'error', title: 'Error', message: `Failed to trigger ${type} update: ${result.message}` });
      }
    } catch (error) {
      console.error(`Error triggering ${type} update:`, error);
      showToast({ type: 'error', title: 'Error', message: `Error triggering ${type} update` });
    } finally {
      // Don't reset triggering immediately if we have a log_id (task is running in background)
      if (!activeLogs[type]?.logId) {
        setTriggering(prev => ({ ...prev, [type]: false }));
      }
    }
  };

  // No auto polling - user needs to refresh manually

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

  // Load scheduled tasks (status = 'running' and trigger_type = 'scheduled')
  const loadScheduledTasks = async () => {
    setLoading(true);
    try {
      const result = await api.getSchedulerLogs({
        limit: 50,
        offset: 0,
        status: 'running'
      });

      if (result.success && result.data) {
        // Filter only scheduled tasks (not manual)
        const tasks: ScheduledTask[] = result.data
          .filter((log: any) => log.trigger_type === 'scheduled')
          .map((log: any) => ({
            logId: log.id,
            featureName: log.feature_name,
            triggerType: log.trigger_type,
            status: log.status,
            progress: log.progress_percentage || 0,
            currentProcessing: log.current_processing,
            startedAt: log.started_at,
            triggeredBy: log.triggered_by
          }));
        setScheduledTasks(tasks);
      }
    } catch (error) {
      console.error('Error loading scheduled tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load on mount and manual refresh only (no auto refresh)
  useEffect(() => {
    loadStatus();
    loadScheduledTasks();
  }, []);

  const formatTime = (dateString: string): string => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    // Format time only: HH:MM:SS using toLocaleString with Jakarta timezone
    const formatted = date.toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    // Replace dots with colons in time format (HH.MM.SS -> HH:MM:SS)
    return formatted.replace(/\./g, ':');
  };

  const getStatusIcon = (isRunning: boolean) => {
    if (isRunning) {
      return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
    }
    return <CheckCircle className="w-4 h-4 text-green-500" />;
  };

  const getStatusBadge = (isRunning: boolean) => {
    return (
      <Badge variant={isRunning ? "secondary" : "outline"}>
        {isRunning ? "Running" : "Idle"}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Scheduler Data Progress
          </div>
          <Button
            onClick={() => {
              loadStatus();
              loadScheduledTasks();
            }}
            disabled={loading}
            variant="outline"
            size="sm"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Refresh
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Scheduled Tasks Progress */}
        {scheduledTasks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No scheduled tasks running
          </div>
        ) : (
          <div className="space-y-4">
            {scheduledTasks.map((task) => (
              <div
                key={task.logId}
                className="p-4 border rounded-lg space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(task.status === 'running')}
                    <div>
                      <h4 className="font-semibold">{task.featureName}</h4>
                      <p className="text-xs text-muted-foreground">
                        {task.triggerType} • Started: {formatTime(task.startedAt)}
                        {task.triggeredBy && ` • By: ${task.triggeredBy}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(task.status === 'running')}
                  </div>
                </div>

                {task.status === 'running' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium">{task.progress || 0}%</span>
                    </div>
                    <Progress value={task.progress || 0} className="h-2" />
                    {task.currentProcessing && (
                      <p className="text-xs text-muted-foreground truncate">
                        {task.currentProcessing}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

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
              {activeLogs['stock'] && activeLogs['stock'].status === 'running' && (
                <div className="mb-2 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium">{activeLogs['stock'].progress}%</span>
                  </div>
                  <Progress value={activeLogs['stock'].progress} className="h-1.5" />
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  onClick={() => handleTriggerDataUpdate('stock')}
                  disabled={triggering['stock']}
                  className="flex-1"
                  size="sm"
                >
                  {triggering['stock'] ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 mr-2" />
                  )}
                  {triggering['stock'] ? 'Updating...' : 'Trigger Update'}
                </Button>
                {activeLogs['stock'] && activeLogs['stock'].status === 'running' && (
                  <Button
                    onClick={async () => {
                      const result = await api.cancelSchedulerLog(activeLogs['stock']!.logId);
                      if (result.success) {
                        showToast({ type: 'success', title: 'Cancelled', message: 'Stock data update cancelled' });
                        setActiveLogs(prev => {
                          const updated = { ...prev };
                          delete updated['stock'];
                          return updated;
                        });
                        setTriggering(prev => ({ ...prev, stock: false }));
                      }
                    }}
                    variant="destructive"
                    size="sm"
                    className="px-2"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
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

            {/* Broker Breakdown */}
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold mb-2">Broker Breakdown</h4>
              <p className="text-sm text-muted-foreground mb-3">Calculate broker breakdown by stock, broker, and price level</p>
              <Button
                onClick={() => handleTriggerDataUpdate('broker-breakdown')}
                disabled={triggering['broker-breakdown']}
                className="w-full"
                size="sm"
              >
                {triggering['broker-breakdown'] ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                {triggering['broker-breakdown'] ? 'Calculating...' : 'Trigger Calculation'}
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

            {/* Broker Summary by Type (RK/TN/NG) */}
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold mb-2">Broker Summary by Type</h4>
              <p className="text-sm text-muted-foreground mb-3">Generate broker summary split by RK / TN / NG</p>
              <Button
                onClick={() => handleTriggerDataUpdate('broker-summary-type')}
                disabled={triggering['broker-summary-type']}
                className="w-full"
                size="sm"
              >
                {triggering['broker-summary-type'] ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                {triggering['broker-summary-type'] ? 'Calculating...' : 'Trigger Calculation'}
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

            {/* Watchlist Snapshot */}
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold mb-2">Watchlist Snapshot</h4>
              <p className="text-sm text-muted-foreground mb-3">Generate watchlist snapshot for all stocks</p>
              <Button
                onClick={() => handleTriggerDataUpdate('watchlist-snapshot')}
                disabled={triggering['watchlist-snapshot']}
                className="w-full"
                size="sm"
              >
                {triggering['watchlist-snapshot'] ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                {triggering['watchlist-snapshot'] ? 'Generating...' : 'Trigger Generation'}
              </Button>
            </div>

            {/* Broker Summary IDX */}
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold mb-2">Broker Summary IDX</h4>
              <p className="text-sm text-muted-foreground mb-3">Generate aggregated IDX.csv for all dates and market types</p>
              <Button
                onClick={() => handleTriggerDataUpdate('broker-summary-idx')}
                disabled={triggering['broker-summary-idx']}
                className="w-full"
                size="sm"
              >
                {triggering['broker-summary-idx'] ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                {triggering['broker-summary-idx'] ? 'Calculating...' : 'Trigger Calculation'}
              </Button>
            </div>

            {/* Broker Transaction */}
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold mb-2">Broker Transaction</h4>
              <p className="text-sm text-muted-foreground mb-3">Calculate broker transaction data per broker (all transaction types)</p>
              <Button
                onClick={() => handleTriggerDataUpdate('broker-transaction')}
                disabled={triggering['broker-transaction']}
                className="w-full"
                size="sm"
              >
                {triggering['broker-transaction'] ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                {triggering['broker-transaction'] ? 'Calculating...' : 'Trigger Calculation'}
              </Button>
            </div>

            {/* Broker Transaction RG/TN/NG */}
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold mb-2">Broker Transaction RG/TN/NG</h4>
              <p className="text-sm text-muted-foreground mb-3">Calculate broker transaction data per broker split by transaction type (RG, TN, NG)</p>
              <Button
                onClick={() => handleTriggerDataUpdate('broker-transaction-rgtnng')}
                disabled={triggering['broker-transaction-rgtnng']}
                className="w-full"
                size="sm"
              >
                {triggering['broker-transaction-rgtnng'] ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                {triggering['broker-transaction-rgtnng'] ? 'Calculating...' : 'Trigger Calculation'}
              </Button>
            </div>

            {/* Break Done Trade */}
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold mb-2">Break Done Trade</h4>
              <p className="text-sm text-muted-foreground mb-3">Break down done trade data by stock code</p>
              <Button
                onClick={() => handleTriggerDataUpdate('break-done-trade')}
                disabled={triggering['break-done-trade']}
                className="w-full"
                size="sm"
              >
                {triggering['break-done-trade'] ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                {triggering['break-done-trade'] ? 'Calculating...' : 'Trigger Calculation'}
              </Button>
            </div>
          </div>
        </div>

        {/* Info Note */}
        <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            <strong>Note:</strong> All data operations run in the background and won't affect the server performance. 
            Users can continue using charts while data is being updated. 
            <br/><br/>
            <strong>Scheduled (Phase 1):</strong> Stock, Index, and Done Summary run daily at 19:00. Shareholders and Holding run monthly on the 1st at 00:01.
            <br/><br/>
            <strong>Auto-triggered Phases:</strong>
            <br/>• Phase 2 (Market Rotation): RRC, RRG, Seasonal, Trend Filter, Watchlist Snapshot
            <br/>• Phase 3 (Light): Money Flow, Foreign Flow, Break Done Trade
            <br/>• Phase 4 (Medium): Bid/Ask Footprint, Broker Breakdown
            <br/>• Phase 5 (Heavy): Broker Data (Broker Summary + Top Broker), Broker Summary by Type, Broker Summary IDX, Broker Transaction, Broker Transaction RG/TN/NG
            <br/>• Phase 6 (Very Heavy): Broker Inventory, Accumulation Distribution
          </p>
        </div>
      </CardContent>
    </Card>
  );
}


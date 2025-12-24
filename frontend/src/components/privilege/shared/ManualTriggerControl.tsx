import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { Progress } from "../../ui/progress";
import { Loader2, CheckCircle, AlertCircle, X, RefreshCw, Play } from "lucide-react";
import { useToast } from "../../../contexts/ToastContext";
import { api } from "../../../services/api";
import { ConfirmationDialog } from "../../ui/confirmation-dialog";
import { supabase } from "../../../lib/supabase";
import { Checkbox } from "../../ui/checkbox";

const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';

interface RunningTask {
  logId: string;
  featureName: string;
  triggerType: string;
  status: string;
  progress?: number;
  currentProcessing?: string;
  startedAt: string;
  triggeredBy?: string;
}

interface ManualTriggerItem {
  name: string;
  type: string;
  description?: string;
}

interface PhaseGroup {
  phaseName: string;
  items: ManualTriggerItem[];
}

// Define all manual triggers organized by phase
const MANUAL_TRIGGERS_BY_PHASE: PhaseGroup[] = [
  {
    phaseName: "Phase 1a - Input Daily",
    items: [
      { name: "Emiten List", type: "emiten-list", description: "Update emiten list from TICMI API" },
      { name: "Stock Data", type: "stock", description: "Update stock data from TICMI API" },
      { name: "Index Data", type: "index", description: "Update index data from TICMI API" },
      { name: "Done Summary Data", type: "done-summary", description: "Update done summary from GCS" },
    ]
  },
  {
    phaseName: "Phase 1b - Input Monthly",
    items: [
      { name: "Shareholders Data", type: "shareholders", description: "Update shareholders data (Monthly)" },
      { name: "Holding Data", type: "holding", description: "Update holding data (Monthly)" },
    ]
  },
  {
    phaseName: "Phase 2 - Market Rotation",
    items: [
      { name: "RRC Calculation", type: "rrc", description: "Calculate Relative Rotation Chart data" },
      { name: "RRG Calculation", type: "rrg", description: "Calculate Relative Rotation Graph data" },
      { name: "Seasonal Calculation", type: "seasonal", description: "Calculate seasonal analysis data" },
      { name: "Trend Filter Calculation", type: "trend-filter", description: "Calculate trend filter data" },
      { name: "Watchlist Snapshot", type: "watchlist-snapshot", description: "Generate watchlist snapshot for all stocks" },
    ]
  },
  {
    phaseName: "Phase 3 - Flow Trade",
    items: [
      { name: "Money Flow", type: "money-flow", description: "Calculate money flow index data" },
      { name: "Foreign Flow", type: "foreign-flow", description: "Calculate foreign flow data" },
      { name: "Break Done Trade", type: "break-done-trade", description: "Break down done trade data by stock code" },
    ]
  },
  {
    phaseName: "Phase 4 - Broker Summary",
    items: [
      { name: "Top Broker", type: "top-broker", description: "Calculate top broker analysis (comprehensive + by stock)" },
      { name: "Broker Summary", type: "broker-summary", description: "Calculate broker summary per emiten and ALLSUM" },
      { name: "Broker Summary IDX", type: "broker-summary-idx", description: "Generate aggregated IDX.csv for all dates and market types" },
      { name: "Broker Summary by Type", type: "broker-summary-type", description: "Generate broker summary split by RK / TN / NG" },
      { name: "Broker Summary Sector", type: "broker-summary-sector", description: "Generate broker summary aggregated by sector for all dates and market types" },
    ]
  },
  {
    phaseName: "Phase 5 - Broktrans Broker",
    items: [
      { name: "Broker Transaction", type: "broker-transaction", description: "Calculate broker transaction data per broker (all transaction types)" },
      { name: "Broker Transaction RG/TN/NG", type: "broker-transaction-rgtnng", description: "Calculate broker transaction data per broker split by transaction type (RG, TN, NG)" },
      { name: "Broker Transaction F/D", type: "broker-transaction-fd", description: "Calculate broker transaction data per broker filtered by Investor Type (F/D)" },
      { name: "Broker Transaction F/D RG/TN/NG", type: "broker-transaction-fd-rgtnng", description: "Calculate broker transaction data per broker filtered by Investor Type (F/D) and Board Type (RG, TN, NG)" },
      { name: "Broker Transaction ALL", type: "broker-transaction-all", description: "Generate broker transaction ALL.csv aggregated by sector (all emitens) for all dates, investor types, and market types" },
    ]
  },
  {
    phaseName: "Phase 6 - Broktrans Stock",
    items: [
      { name: "Broker Transaction Stock", type: "broker-transaction-stock", description: "Calculate broker transaction data pivoted by stock (all transaction types)" },
      { name: "Broker Transaction Stock F/D", type: "broker-transaction-stock-fd", description: "Calculate broker transaction data pivoted by stock, filtered by Investor Type (F/D)" },
      { name: "Broker Transaction Stock RG/TN/NG", type: "broker-transaction-stock-rgtnng", description: "Calculate broker transaction data pivoted by stock, filtered by Board Type (RG, TN, NG)" },
      { name: "Broker Transaction Stock F/D RG/TN/NG", type: "broker-transaction-stock-fd-rgtnng", description: "Calculate broker transaction data pivoted by stock, filtered by Investor Type (F/D) and Board Type (RG, TN, NG)" },
      { name: "Broker Transaction Stock IDX", type: "broker-transaction-stock-idx", description: "Generate aggregated IDX.csv for broker transaction stock (all dates and combinations)" },
      { name: "Broker Transaction Stock Sector", type: "broker-transaction-stock-sector", description: "Generate broker transaction stock aggregated by sector for all dates, investor types, and market types" },
    ]
  },
  {
    phaseName: "Phase 7 - Bid Breakdown",
    items: [
      { name: "Bid/Ask Footprint", type: "bidask", description: "Calculate bid/ask footprint data" },
      { name: "Broker Breakdown", type: "broker-breakdown", description: "Calculate broker breakdown by stock, broker, and price level" },
    ]
  },
  {
    phaseName: "Phase 8 - Additional",
    items: [
      { name: "Broker Inventory", type: "broker-inventory", description: "Calculate broker inventory data" },
      { name: "Accumulation Distribution", type: "accumulation", description: "Calculate accumulation distribution data" },
    ]
  },
];

export function ManualTriggerControl() {
  const { showToast } = useToast();
  const [runningTasks, setRunningTasks] = useState<RunningTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [triggering, setTriggering] = useState<{[key: string]: boolean}>({});
  const [activeLogs, setActiveLogs] = useState<{[key: string]: { logId: string; progress: number; status: string } | null}>({});
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [bulkCancelDialogOpen, setBulkCancelDialogOpen] = useState(false);
  const [cancellingBulk, setCancellingBulk] = useState(false);
  const [confirmationDialog, setConfirmationDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({
    open: false,
    title: '',
    description: '',
    onConfirm: () => {},
  });

  // Normalize feature name to match type (convert underscore to dash and handle special cases)
  const normalizeFeatureName = useCallback((featureName: string): string => {
    // Map backend feature_name to frontend type
    const nameMap: Record<string, string> = {
      'accumulation_distribution': 'accumulation',
      'bidask_footprint': 'bidask',
      'broker_breakdown': 'broker-breakdown',
      'broker_inventory': 'broker-inventory',
      'broker_summary_type': 'broker-summary-type',
      'broker_summary_idx': 'broker-summary-idx',
      'broker_summary_sector': 'broker-summary-sector',
      'foreign_flow': 'foreign-flow',
      'money_flow': 'money-flow',
      'seasonality': 'seasonal',
      'trend_filter': 'trend-filter',
      'watchlist_snapshot': 'watchlist-snapshot',
      'broker_transaction': 'broker-transaction',
      'broker_transaction_rgtnng': 'broker-transaction-rgtnng',
      'broker_transaction_fd': 'broker-transaction-fd',
      'broker_transaction_fd_rgtnng': 'broker-transaction-fd-rgtnng',
      'broker_transaction_stock': 'broker-transaction-stock',
      'broker_transaction_stock_fd': 'broker-transaction-stock-fd',
      'broker_transaction_stock_rgtnng': 'broker-transaction-stock-rgtnng',
      'broker_transaction_stock_fd_rgtnng': 'broker-transaction-stock-fd-rgtnng',
      'broker_transaction_stock_idx': 'broker-transaction-stock-idx',
      'broker_transaction_stock_sector': 'broker-transaction-stock-sector',
      'broker_transaction_all': 'broker-transaction-all',
      'break_done_trade': 'break-done-trade',
      'emiten_list': 'emiten-list',
    };
    
    // Check if there's a direct mapping
    if (nameMap[featureName]) {
      return nameMap[featureName];
    }
    
    // Otherwise, convert underscore to dash
    return featureName.replace(/_/g, '-');
  }, []);

  // Load running tasks - only manual triggers from Data Input Updates or Data Calculations (not from SchedulerConfigControl)
  const loadRunningTasks = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getSchedulerLogs({
        limit: 50,
        offset: 0,
        status: 'running'
      });

      if (result.success && result.data) {
        // Filter: only manual triggers that are NOT phase triggers (phase triggers go to Scheduler Data Progress)
        const tasks: RunningTask[] = result.data
          .filter((log: any) => 
            log.trigger_type === 'manual' && 
            !log.feature_name.startsWith('phase')
          )
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
        setRunningTasks(tasks);
        
        // Clear activeLogs and triggering for tasks that are no longer running
        setActiveLogs(prev => {
          const updated = { ...prev };
          const currentRunningTypes = new Set(
            tasks.map(task => normalizeFeatureName(task.featureName))
          );
          
          // Remove activeLogs for types that are no longer running
          Object.keys(updated).forEach(type => {
            if (!currentRunningTypes.has(type)) {
              delete updated[type];
            }
          });
          
          return updated;
        });
        
        setTriggering(prev => {
          const updated = { ...prev };
          const currentRunningTypes = new Set(
            tasks.map(task => normalizeFeatureName(task.featureName))
          );
          
          // Remove triggering for types that are no longer running
          Object.keys(updated).forEach(type => {
            if (!currentRunningTypes.has(type)) {
              delete updated[type];
            }
          });
          
          return updated;
        });
        
        // Reset selected tasks when data changes
        setSelectedTaskIds(new Set());
      } else {
        // No running tasks - clear all activeLogs and triggering
        setActiveLogs({});
        setTriggering({});
      }
    } catch (error) {
      console.error('Error loading running tasks:', error);
    } finally {
      setLoading(false);
    }
  }, [normalizeFeatureName]);

  // Load on mount and listen for status changes via Supabase realtime
  useEffect(() => {
    loadRunningTasks();
    
    // Subscribe to scheduler_logs table changes
    const channel = supabase
      .channel('scheduler_logs_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'scheduler_logs',
          filter: 'status=eq.completed'
        },
        (payload: any) => {
          // Only refresh if the completed task is a manual trigger (not phase)
          const featureName = payload.new?.feature_name || payload.new?.['feature_name'];
          if (featureName && !featureName.startsWith('phase')) {
            // Refresh this section when a manual trigger completes
            loadRunningTasks();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'scheduler_logs',
          filter: 'status=eq.running'
        },
        (payload: any) => {
          // Refresh when a new task starts running
          const featureName = payload.new?.feature_name || payload.new?.['feature_name'];
          if (featureName && !featureName.startsWith('phase')) {
            loadRunningTasks();
          }
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadRunningTasks]);

  // Handle manual trigger
  const handleTriggerDataUpdate = async (type: string) => {
    const item = MANUAL_TRIGGERS_BY_PHASE.flatMap(p => p.items).find(i => i.type === type);
    setConfirmationDialog({
      open: true,
      title: 'Trigger Data Update',
      description: `Are you sure you want to trigger ${item?.name || type}?`,
      onConfirm: async () => {
        setTriggering(prev => ({ ...prev, [type]: true }));
    
    try {
      // Get session and add Authorization header
      const { data: { session } } = await supabase.auth.getSession();
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      
      const response = await fetch(`${API_URL}/api/trigger/${type}`, {
        method: 'POST',
        headers,
      });
      
      const result = await response.json();
      
      if (result.success) {
        showToast({ type: 'success', title: 'Success', message: `${type} data update triggered successfully` });
        
        // Store log_id if provided for progress tracking (handle both log_id and logId)
        const logId = result.log_id || result.logId;
        if (logId) {
          setActiveLogs(prev => ({
            ...prev,
            [type]: { logId: logId, progress: 0, status: 'running' }
          }));
        }
        
        // Reload running tasks to show the new task
        await loadRunningTasks();
      } else {
        showToast({ type: 'error', title: 'Error', message: `Failed to trigger ${type} update: ${result.message}` });
      }
    } catch (error) {
      console.error(`Error triggering ${type} update:`, error);
      showToast({ type: 'error', title: 'Error', message: `Error triggering ${type} update` });
      } finally {
        // Don't reset triggering immediately if we have a log_id (task is running in background)
        const logId = activeLogs[type]?.logId;
        if (!logId) {
          setTriggering(prev => ({ ...prev, [type]: false }));
        }
      }
    },
    });
  };

  // Cancel a running task
  const handleCancelTask = async (logId: string, featureName: string) => {
    setConfirmationDialog({
      open: true,
      title: 'Cancel Task',
      description: `Are you sure you want to cancel ${featureName}?`,
      onConfirm: async () => {
        try {
      const result = await api.cancelSchedulerLog(logId, 'Cancelled by user from Manual Trigger Control');
      
      if (result.success) {
        showToast({
          type: 'success',
          title: 'Task Cancelled',
          message: `${featureName} task has been cancelled`
        });
        // Reload tasks to reflect cancellation
        await loadRunningTasks();
        // Clear from activeLogs
        const type = Object.keys(activeLogs).find(key => activeLogs[key]?.logId === logId);
        if (type) {
          setActiveLogs(prev => {
            const updated = { ...prev };
            delete updated[type];
            return updated;
          });
          setTriggering(prev => ({ ...prev, [type]: false }));
        }
      } else {
        showToast({
          type: 'error',
          title: 'Cancel Failed',
          message: result.error || 'Failed to cancel task'
        });
      }
        } catch (error: any) {
          showToast({
            type: 'error',
            title: 'Cancel Error',
            message: error.message || 'Failed to cancel task'
          });
        }
      },
    });
  };

  // Bulk cancel selected tasks
  const handleBulkCancelConfirm = async () => {
    if (selectedTaskIds.size === 0) return;
    
    setCancellingBulk(true);
    try {
      const idsArray = Array.from(selectedTaskIds);
      let successCount = 0;
      let failCount = 0;
      
      // Cancel each task one by one
      for (const logId of idsArray) {
        try {
          const result = await api.cancelSchedulerLog(logId, 'Cancelled by user from Manual Trigger Control (bulk)');
          
          if (result.success) {
            successCount++;
            // Clear from activeLogs if exists
            const type = Object.keys(activeLogs).find(key => activeLogs[key]?.logId === logId);
            if (type) {
              setActiveLogs(prev => {
                const updated = { ...prev };
                delete updated[type];
                return updated;
              });
              setTriggering(prev => ({ ...prev, [type]: false }));
            }
          } else {
            failCount++;
          }
        } catch (error) {
          failCount++;
          console.error(`Error cancelling task ${logId}:`, error);
        }
      }
      
      if (successCount > 0) {
        showToast({
          type: 'success',
          title: 'Tasks Cancelled',
          message: `Successfully cancelled ${successCount} task(s)${failCount > 0 ? `, ${failCount} failed` : ''}`
        });
        setSelectedTaskIds(new Set());
        await loadRunningTasks();
      } else {
        showToast({
          type: 'error',
          title: 'Cancel Failed',
          message: `Failed to cancel ${failCount} task(s)`
        });
      }
    } catch (error: any) {
      console.error('Error cancelling tasks:', error);
      showToast({
        type: 'error',
        title: 'Cancel Error',
        message: error.message || 'Failed to cancel tasks'
      });
    } finally {
      setCancellingBulk(false);
      setBulkCancelDialogOpen(false);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      // Only select running tasks
      const runningTaskIds = new Set(
        runningTasks.filter(task => task.status === 'running').map(task => task.logId)
      );
      setSelectedTaskIds(runningTaskIds);
    } else {
      setSelectedTaskIds(new Set());
    }
  };

  const handleSelectTask = (logId: string, checked: boolean) => {
    const newSelected = new Set(selectedTaskIds);
    if (checked) {
      newSelected.add(logId);
    } else {
      newSelected.delete(logId);
    }
    setSelectedTaskIds(newSelected);
  };

  const runningTasksList = runningTasks.filter(task => task.status === 'running');
  const isAllSelected = runningTasksList.length > 0 && selectedTaskIds.size === runningTasksList.length;
  const isIndeterminate = selectedTaskIds.size > 0 && selectedTaskIds.size < runningTasksList.length;
  const selectAllCheckboxRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      const input = selectAllCheckboxRef.current.querySelector('input[type="checkbox"]') as HTMLInputElement;
      if (input) {
        input.indeterminate = isIndeterminate;
      }
    }
  }, [isIndeterminate, runningTasksList.length]);

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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'cancelled':
        return <X className="w-4 h-4 text-orange-500" />;
      case 'running':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      completed: 'default',
      failed: 'destructive',
      cancelled: 'outline',
      running: 'secondary'
    };

    return (
      <Badge variant={variants[status] || 'secondary'}>
        {status}
      </Badge>
    );
  };


  // Get running task for a specific type
  const getRunningTask = (type: string) => {
    return runningTasks.find(task => {
      const normalizedFeatureName = normalizeFeatureName(task.featureName);
      return normalizedFeatureName === type || task.featureName === type;
    });
  };

  return (
    <>
      {/* Manual Data Trigger - Grid by Phase */}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <Play className="w-5 h-5" />
              <span className="text-lg sm:text-xl">Manual Data Trigger</span>
            </div>
            <Button
              onClick={loadRunningTasks}
              disabled={loading}
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
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
        <CardContent>
          <div className="max-h-[600px] overflow-y-auto pr-2 space-y-6">
            {MANUAL_TRIGGERS_BY_PHASE.map((phase, phaseIndex) => (
              <div key={phaseIndex} className="space-y-4">
                {/* Phase Name Header */}
                <h3 className="text-lg font-semibold pb-2 border-b sticky top-0 bg-background z-10">
                  {phase.phaseName}
                </h3>
                
                {/* Grid of trigger cards for this phase */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  {phase.items.map((item, itemIndex) => {
                  const runningTask = getRunningTask(item.type);
                  const isTriggering = triggering[item.type];
                  const activeLog = activeLogs[item.type];
                  const isRunning = runningTask?.status === 'running' || activeLog?.status === 'running';
                  
                  return (
                    <div key={itemIndex} className="p-3 border rounded-lg flex flex-col">
                      <h4 className="font-semibold mb-3 text-sm">{item.name}</h4>
                      
                      {/* Progress indicator if running */}
                      {isRunning && (
                        <div className="mb-2 space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Progress</span>
                            <span className="font-medium">
                              {runningTask?.progress || activeLog?.progress || 0}%
                            </span>
                          </div>
                          <Progress 
                            value={runningTask?.progress || activeLog?.progress || 0} 
                            className="h-1.5" 
                          />
                        </div>
                      )}
                      
                      {/* Action buttons */}
                      <div className="flex gap-2 mt-auto">
                        <Button
                          onClick={() => handleTriggerDataUpdate(item.type)}
                          disabled={isTriggering || isRunning}
                          className="flex-1"
                          size="sm"
                        >
                          {isTriggering ? (
                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                          ) : (
                            <Play className="w-4 h-4 mr-1" />
                          )}
                          {isTriggering ? 'Triggering...' : isRunning ? 'Running' : 'Trigger'}
                        </Button>
                        {isRunning && (
                          <Button
                            onClick={() => handleCancelTask(
                              runningTask?.logId || activeLog?.logId || '', 
                              item.name
                            )}
                            variant="destructive"
                            size="sm"
                            className="px-2"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Manual Data Trigger Progress - Running Tasks */}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5" />
              <span className="text-lg sm:text-xl">Manual Data Trigger Progress</span>
            </div>
            <div className="flex items-center gap-2">
              {selectedTaskIds.size > 0 && (
                <Button
                  onClick={() => setBulkCancelDialogOpen(true)}
                  disabled={cancellingBulk}
                  variant="destructive"
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  {cancellingBulk ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <X className="w-4 h-4 mr-2" />
                  )}
                  Cancel Selected ({selectedTaskIds.size})
                </Button>
              )}
              <Button
                onClick={loadRunningTasks}
                disabled={loading}
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Refresh
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {runningTasks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No running tasks
            </div>
          ) : (
            <div className="space-y-4">
              {/* Select All Checkbox */}
              {runningTasksList.length > 0 && (
                <div className="flex items-center gap-2 pb-2 border-b">
                  <Checkbox
                    ref={selectAllCheckboxRef}
                    checked={isAllSelected}
                    onCheckedChange={handleSelectAll}
                  />
                  <span className="text-sm text-muted-foreground">
                    Select all running tasks ({runningTasksList.length})
                  </span>
                </div>
              )}
              {runningTasks.map((task) => (
                <div
                  key={task.logId}
                  className="p-4 border rounded-lg space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {task.status === 'running' && (
                        <Checkbox
                          checked={selectedTaskIds.has(task.logId)}
                          onCheckedChange={(checked) => handleSelectTask(task.logId, checked as boolean)}
                          className="flex-shrink-0"
                        />
                      )}
                      {getStatusIcon(task.status)}
                      <div className="min-w-0 flex-1">
                        <h4 className="font-semibold truncate">{task.featureName}</h4>
                        <p className="text-xs text-muted-foreground break-words">
                          {task.triggerType} • Started: {formatTime(task.startedAt)}
                          {task.triggeredBy && ` • By: ${task.triggeredBy}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 sm:ml-auto">
                      {getStatusBadge(task.status)}
                      {task.status === 'running' && (
                        <Button
                          onClick={() => handleCancelTask(task.logId, task.featureName)}
                          variant="destructive"
                          size="sm"
                          className="flex-shrink-0"
                        >
                          Cancel
                        </Button>
                      )}
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
        </CardContent>
      </Card>

      <ConfirmationDialog
        open={confirmationDialog.open}
        onOpenChange={(open) => setConfirmationDialog({ ...confirmationDialog, open })}
        title={confirmationDialog.title}
        description={confirmationDialog.description}
        onConfirm={confirmationDialog.onConfirm}
        confirmText="Yes"
        cancelText="No"
      />

      <ConfirmationDialog
        open={bulkCancelDialogOpen}
        onOpenChange={setBulkCancelDialogOpen}
        title="Cancel Selected Tasks"
        description={`Are you sure you want to cancel ${selectedTaskIds.size} selected task(s)?`}
        onConfirm={handleBulkCancelConfirm}
        confirmText="Yes, Cancel"
        cancelText="No"
        isLoading={cancellingBulk}
      />
    </>
  );
}

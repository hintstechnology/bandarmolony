import { useState, useEffect } from "react";
import { UserStats } from "./UserStats";
import { UserManagement } from "./UserManagement";
import { RecentUsers } from "./RecentUsers";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { RefreshCw, Play, Square, Loader2, AlertCircle, CheckCircle, Database, Clock, User } from "lucide-react";
import { api } from "../../services/api";

const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';
import { useToast } from "../../contexts/ToastContext";

// Format time function with Asia/Jakarta timezone
function formatJakartaTime(dateString: string): string {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

export function AdminDashboard() {
  const { showToast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  
  // Debug section states
  const [rrcStatus, setRrcStatus] = useState<any>(null);
  const [rrgStatus, setRrgStatus] = useState<any>(null);
  const [debugMessage, setDebugMessage] = useState<string>('');
  
  // Data scheduler states
  const [schedulerLogs, setSchedulerLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [triggering, setTriggering] = useState<{[key: string]: boolean}>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  // Load status on mount
  useEffect(() => {
    loadStatus();
    loadSchedulerLogs(1, 10);
  }, []);

  const loadStatus = async () => {
    try {
      const [rrcResult, rrgResult] = await Promise.all([
        api.getRRCStatus(),
        api.getRRGStatus()
      ]);
      
      if (rrcResult.success) setRrcStatus(rrcResult.data);
      if (rrgResult.success) setRrgStatus(rrgResult.data);
    } catch (error) {
      console.error('Error loading status:', error);
    }
  };

  const loadSchedulerLogs = async (page: number = 1, limit: number = 10) => {
    setLoadingLogs(true);
    try {
      const offset = (page - 1) * limit;
      const response = await fetch(`${API_URL}/api/trigger/logs?limit=${limit}&offset=${offset}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        setSchedulerLogs(result.data);
        // Calculate total pages (assuming we get total count from API)
        const total = result.total || result.data.length;
        const totalPages = Math.ceil(total / limit);
        setTotalLogs(total);
        setTotalPages(totalPages);
        setCurrentPage(page);
      } else {
        showToast({ type: 'error', title: 'Error', message: 'Failed to load scheduler logs' });
      }
    } catch (error) {
      console.error('Error loading scheduler logs:', error);
      showToast({ type: 'error', title: 'Error', message: 'Error loading scheduler logs' });
    } finally {
      setLoadingLogs(false);
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    loadSchedulerLogs(page, 10);
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
        loadSchedulerLogs(); // Refresh logs
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

  const handleTriggerUpdate = async (feature: 'rrc' | 'rrg' | 'all') => {
    setDebugMessage(`Triggering ${feature.toUpperCase()} update...`);
    
    try {
      const result = await api.triggerGeneration(feature);
      
      if (result.success) {
        setDebugMessage(`✅ ${result.data?.message || `${feature.toUpperCase()} update triggered successfully`}`);
        showToast({
          type: 'success',
          title: 'Update Triggered',
          message: `${feature.toUpperCase()} data generation started`
        });
        
        // Refresh status after a delay
        setTimeout(() => {
          loadStatus();
        }, 2000);
      } else {
        setDebugMessage(`❌ ${result.error || `Failed to trigger ${feature.toUpperCase()} update`}`);
        showToast({
          type: 'error',
          title: 'Update Failed',
          message: result.error || 'Failed to trigger update'
        });
      }
    } catch (error) {
      const errorMsg = `❌ Error: ${error}`;
      setDebugMessage(errorMsg);
      showToast({
        type: 'error',
        title: 'Update Error',
        message: 'Failed to trigger update'
      });
    }
  };

  const handleStopGeneration = async () => {
    setDebugMessage('Stopping generation...');
    
    try {
      // Stop both RRC and RRG generation
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
      
      // Refresh status
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Admin Dashboard</h1>
          <p className="text-muted-foreground">User management and platform overview</p>
        </div>
        <Button onClick={handleRefresh} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh Data
        </Button>
      </div>

      {/* User Statistics */}
      <UserStats key={`stats-${refreshKey}`} />

      {/* Data Generation Debug Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Data Generation Control
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status Overview */}
          <div className="grid gap-4 md:grid-cols-2">
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
          </div>

          {/* Progress Bars */}
          {(rrcStatus?.isGenerating || rrgStatus?.isGenerating) && (
            <div className="space-y-3">
              {rrcStatus?.isGenerating && rrcStatus?.progress && (
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>RRC Progress</span>
                    <span>{rrcStatus.progress.completed}/{rrcStatus.progress.total}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300" 
                      style={{ 
                        width: `${(rrcStatus.progress.completed / rrcStatus.progress.total) * 100}%` 
                      }} 
                    />
                  </div>
                </div>
              )}
              
              {rrgStatus?.isGenerating && rrgStatus?.progress && (
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>RRG Progress</span>
                    <span>{rrgStatus.progress.completed}/{rrgStatus.progress.total}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div 
                      className="bg-green-500 h-2 rounded-full transition-all duration-300" 
                      style={{ 
                        width: `${(rrgStatus.progress.completed / rrgStatus.progress.total) * 100}%` 
                      }} 
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Control Buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => handleTriggerUpdate('rrc')}
              disabled={rrcStatus?.isGenerating}
              variant="outline"
              size="sm"
            >
              <Play className="w-3 h-3 mr-1" />
              Trigger RRC
            </Button>
            
            <Button
              onClick={() => handleTriggerUpdate('rrg')}
              disabled={rrgStatus?.isGenerating}
              variant="outline"
              size="sm"
            >
              <Play className="w-3 h-3 mr-1" />
              Trigger RRG
            </Button>
            
            <Button
              onClick={() => handleTriggerUpdate('all')}
              disabled={rrcStatus?.isGenerating || rrgStatus?.isGenerating}
              variant="outline"
              size="sm"
            >
              <Play className="w-3 h-3 mr-1" />
              Trigger Both
            </Button>
            
            <Button
              onClick={handleStopGeneration}
              disabled={!rrcStatus?.isGenerating && !rrgStatus?.isGenerating}
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

          {/* Info Note */}
          <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              <strong>Note:</strong> Data generation runs in the background and won't affect the server performance. 
              Users can continue using RRC and RRG charts while data is being updated.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* User Management and Recent Users */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <UserManagement key={`management-${refreshKey}`} />
        </div>
        <div>
          <RecentUsers key={`recent-${refreshKey}`} />
        </div>
      </div>

      {/* Data Scheduler Manual Trigger */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Data Scheduler Manual Trigger
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Stock Data */}
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold mb-2">Stock Data</h3>
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
              <h3 className="font-semibold mb-2">Index Data</h3>
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

            {/* Shareholders Data */}
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold mb-2">Shareholders Data</h3>
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
              <h3 className="font-semibold mb-2">Holding Data</h3>
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

            {/* Done Summary Data */}
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold mb-2">Done Summary Data</h3>
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

            {/* Accumulation Distribution */}
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold mb-2">Accumulation Distribution</h3>
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
              <h3 className="font-semibold mb-2">Bid/Ask Footprint</h3>
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
              <h3 className="font-semibold mb-2">Broker Data</h3>
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
              <h3 className="font-semibold mb-2">Broker Inventory</h3>
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
              <h3 className="font-semibold mb-2">Foreign Flow</h3>
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
              <h3 className="font-semibold mb-2">Money Flow</h3>
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

          <div className="p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg">
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              <strong>Note:</strong> Manual triggers run in background. Stock, Index, and Done Summary run daily at 19:00. 
              Shareholders and Holding run monthly on the last day at 00:01. The 6 new calculations run in 2 phases: 
              Phase 1 (19:00) - Broker Data, Bid/Ask, Money Flow, Foreign Flow; Phase 2 (19:02) - Broker Inventory, Accumulation Distribution.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Scheduler Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Scheduler Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-muted-foreground">
              Recent scheduler execution logs ({totalLogs} total)
            </p>
            <Button
              onClick={() => loadSchedulerLogs(currentPage, 10)}
              disabled={loadingLogs}
              variant="outline"
              size="sm"
            >
              {loadingLogs ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Refresh
            </Button>
          </div>

          {loadingLogs ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              <span>Loading logs...</span>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Feature</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead>Files Processed</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Completed</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Triggered By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schedulerLogs.length === 0 ? (
                      <TableRow>
                        <TableCell className="text-center py-8 text-muted-foreground">
                          No logs found
                        </TableCell>
                        <TableCell>{null}</TableCell>
                        <TableCell>{null}</TableCell>
                        <TableCell>{null}</TableCell>
                        <TableCell>{null}</TableCell>
                        <TableCell>{null}</TableCell>
                        <TableCell>{null}</TableCell>
                        <TableCell>{null}</TableCell>
                        <TableCell>{null}</TableCell>
                      </TableRow>
                    ) : (
                      schedulerLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell>
                            <Badge variant="outline">{log.feature_name}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={log.trigger_type === 'manual' ? 'default' : 'secondary'}>
                              {log.trigger_type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {log.status === 'completed' && <CheckCircle className="w-4 h-4 text-green-500" />}
                              {log.status === 'failed' && <AlertCircle className="w-4 h-4 text-red-500" />}
                              {log.status === 'running' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                              <Badge 
                                variant={
                                  log.status === 'completed' ? 'default' : 
                                  log.status === 'failed' ? 'destructive' : 
                                  'secondary'
                                }
                              >
                                {log.status}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {log.progress_percentage ? `${log.progress_percentage}%` : '-'}
                              {log.current_processing && (
                                <span className="text-xs text-muted-foreground truncate max-w-20">
                                  {log.current_processing}
                                </span>
                              )}
                              {log.error_message && (
                                <div className="text-xs text-red-600 truncate max-w-20" title={log.error_message}>
                                  Error
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>Total: {log.total_files_processed || 0}</div>
                              <div className="text-green-600">✓ {log.files_created || 0}</div>
                              <div className="text-yellow-600">~ {log.files_updated || 0}</div>
                              <div className="text-gray-500">- {log.files_skipped || 0}</div>
                              <div className="text-red-600">✗ {log.files_failed || 0}</div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatJakartaTime(log.started_at)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatJakartaTime(log.completed_at)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {log.duration_seconds ? `${log.duration_seconds}s` : '-'}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              <span className="text-sm">{log.triggered_by}</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {((currentPage - 1) * 10) + 1} to {Math.min(currentPage * 10, totalLogs)} of {totalLogs} logs
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        const page = i + 1;
                        return (
                          <Button
                            key={page}
                            variant={currentPage === page ? "default" : "outline"}
                            size="sm"
                            onClick={() => handlePageChange(page)}
                            className="w-8 h-8 p-0"
                          >
                            {page}
                          </Button>
                        );
                      })}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

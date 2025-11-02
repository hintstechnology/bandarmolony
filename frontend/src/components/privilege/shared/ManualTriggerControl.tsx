import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { Progress } from "../../ui/progress";
import { Loader2, Square, CheckCircle, AlertCircle, X, RefreshCw } from "lucide-react";
import { useToast } from "../../../contexts/ToastContext";
import { api } from "../../../services/api";

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

export function ManualTriggerControl() {
  const { showToast } = useToast();
  const [runningTasks, setRunningTasks] = useState<RunningTask[]>([]);
  const [loading, setLoading] = useState(false);

  // Load running tasks
  const loadRunningTasks = async () => {
    setLoading(true);
    try {
      const result = await api.getSchedulerLogs({
        limit: 50,
        offset: 0,
        status: 'running'
      });

      if (result.success && result.data) {
        const tasks: RunningTask[] = result.data.map((log: any) => ({
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
      }
    } catch (error) {
      console.error('Error loading running tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load on mount and manual refresh only (no auto refresh)
  useEffect(() => {
    loadRunningTasks();
  }, []);

  // Cancel a running task
  const handleCancelTask = async (logId: string, featureName: string) => {
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
  };

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            Manual Data Trigger Progress
          </div>
          <Button
            onClick={loadRunningTasks}
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
      <CardContent>
        {runningTasks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No running tasks
          </div>
        ) : (
          <div className="space-y-4">
            {runningTasks.map((task) => (
              <div
                key={task.logId}
                className="p-4 border rounded-lg space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(task.status)}
                    <div>
                      <h4 className="font-semibold">{task.featureName}</h4>
                      <p className="text-xs text-muted-foreground">
                        {task.triggerType} • Started: {formatTime(task.startedAt)}
                        {task.triggeredBy && ` • By: ${task.triggeredBy}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(task.status)}
                    {task.status === 'running' && (
                      <Button
                        onClick={() => handleCancelTask(task.logId, task.featureName)}
                        variant="destructive"
                        size="sm"
                      >
                        <Square className="w-3 h-3 mr-1" />
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
  );
}


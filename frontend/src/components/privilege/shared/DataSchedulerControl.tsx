import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { Progress } from "../../ui/progress";
import { Clock, Loader2, RefreshCw } from "lucide-react";
import { useToast } from "../../../contexts/ToastContext";
import { api } from "../../../services/api";
import { ConfirmationDialog } from "../../ui/confirmation-dialog";

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
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(false);
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

  // Load scheduled tasks (status = 'running' and trigger_type = 'scheduled' OR manual phase triggers from SchedulerConfigControl)
  const loadScheduledTasks = async () => {
    setLoading(true);
    try {
      const result = await api.getSchedulerLogs({
        limit: 50,
        offset: 0,
        status: 'running'
      });

      if (result.success && result.data) {
        // Filter: scheduled tasks OR manual phase triggers (from SchedulerConfigControl trigger button)
        const tasks: ScheduledTask[] = result.data
          .filter((log: any) => 
            log.trigger_type === 'scheduled' || 
            (log.trigger_type === 'manual' && log.feature_name.startsWith('phase'))
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
    loadScheduledTasks();
  }, []);

  // Cancel a running scheduled task
  const handleCancelTask = async (logId: string, featureName: string) => {
    setConfirmationDialog({
      open: true,
      title: 'Cancel Task',
      description: `Are you sure you want to cancel ${featureName}?`,
      onConfirm: async () => {
        try {
      const result = await api.cancelSchedulerLog(logId, 'Cancelled by user from Scheduler Data Progress');
      
      if (result.success) {
        showToast({
          type: 'success',
          title: 'Task Cancelled',
          message: `${featureName} task has been cancelled`
        });
        // Reload tasks to reflect cancellation
        await loadScheduledTasks();
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
    return null;
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
        <CardTitle className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            <span className="text-lg sm:text-xl">Scheduler Data Progress</span>
          </div>
          <Button
            onClick={loadScheduledTasks}
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
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {getStatusIcon(task.status === 'running')}
                    <div className="min-w-0 flex-1">
                      <h4 className="font-semibold truncate">{task.featureName}</h4>
                      <p className="text-xs text-muted-foreground break-words">
                        {task.triggerType} • Started: {formatTime(task.startedAt)}
                        {task.triggeredBy && ` • By: ${task.triggeredBy}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 sm:ml-auto">
                    {getStatusBadge(task.status === 'running')}
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

      <ConfirmationDialog
        open={confirmationDialog.open}
        onOpenChange={(open) => setConfirmationDialog({ ...confirmationDialog, open })}
        title={confirmationDialog.title}
        description={confirmationDialog.description}
        onConfirm={confirmationDialog.onConfirm}
        confirmText="Yes"
        cancelText="No"
      />
    </Card>
  );
}

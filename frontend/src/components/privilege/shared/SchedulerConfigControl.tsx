import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Badge } from "../../ui/badge";
import { Loader2, Clock, Save, Play, RefreshCw, AlertCircle, Edit2, X } from "lucide-react";
import { useToast } from "../../../contexts/ToastContext";
import { api } from "../../../services/api";

interface Phase {
  id: string;
  name: string;
  description: string;
  status: 'idle' | 'running' | 'stopped';
  trigger: {
    type: 'scheduled' | 'auto';
    schedule?: string;
    condition: string;
  };
  tasks: string[];
  mode: string;
}

export function SchedulerConfigControl() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [scheduler, setScheduler] = useState<any>(null);
  const [editingPhase, setEditingPhase] = useState<string | null>(null);
  const [editTime, setEditTime] = useState<string>('');
  const [triggering, setTriggering] = useState<Record<string, boolean>>({});

  // Load phases on mount (no auto refresh - manual refresh only)
  useEffect(() => {
    loadPhases();
  }, []);

  const loadPhases = async () => {
    setLoading(true);
    try {
      const result = await api.getAllPhasesStatus();
      if (result.success && result.data) {
        setPhases(result.data.phases || []);
        setScheduler(result.data.scheduler);
      } else {
        showToast({
          type: 'error',
          title: 'Load Failed',
          message: result.error || 'Failed to load phases status'
        });
      }
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'Load Error',
        message: error.message || 'Failed to load phases status'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerPhase = async (phaseId: string) => {
    setTriggering(prev => ({ ...prev, [phaseId]: true }));
    try {
      const result = await api.triggerPhase(phaseId);
      if (result.success) {
        showToast({
          type: 'success',
          title: 'Phase Triggered',
          message: result.message || `Phase ${phaseId} triggered successfully`
        });
        // Reload phases after a short delay
        setTimeout(() => loadPhases(), 1000);
      } else {
        showToast({
          type: 'error',
          title: 'Trigger Failed',
          message: result.error || `Failed to trigger phase ${phaseId}`
        });
      }
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'Trigger Error',
        message: error.message || 'Failed to trigger phase'
      });
    } finally {
      setTriggering(prev => ({ ...prev, [phaseId]: false }));
    }
  };

  const handleEditTime = (phase: Phase) => {
    if (phase.trigger.type === 'scheduled' && phase.trigger.schedule) {
      // Convert HH:MM to time input format
      const parts = phase.trigger.schedule.split(':');
      const hours = parts[0] || '00';
      const minutes = parts[1] || '00';
      setEditTime(`${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`);
      setEditingPhase(phase.id);
    }
  };

  const handleSaveTime = async (phaseId: string) => {
    if (!editTime) return;
    
    try {
      const config: any = {};
      
      if (phaseId === 'phase1_data_collection') {
        config.PHASE1_DATA_COLLECTION_TIME = editTime;
      } else if (phaseId === 'phase1_shareholders') {
        config.PHASE1_SHAREHOLDERS_TIME = editTime;
      }
      
      const result = await api.updateSchedulerConfig(config);
      if (result.success) {
        showToast({
          type: 'success',
          title: 'Time Updated',
          message: 'Scheduler time updated and scheduler restarted'
        });
        setEditingPhase(null);
        setEditTime('');
        setTimeout(() => loadPhases(), 1000);
      } else {
        showToast({
          type: 'error',
          title: 'Update Failed',
          message: result.error || 'Failed to update time'
        });
      }
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'Update Error',
        message: error.message || 'Failed to update time'
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <Badge variant="default" className="bg-blue-500">Running</Badge>;
      case 'idle':
        return <Badge variant="secondary">Idle</Badge>;
      case 'stopped':
        return <Badge variant="destructive">Stopped</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      case 'idle':
        return <Clock className="w-4 h-4 text-gray-500" />;
      case 'stopped':
        return <X className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  if (loading && phases.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Scheduler Phases Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading phases...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Scheduler Phases Configuration
          </div>
          <div className="flex items-center gap-2">
            {scheduler && (
              <Badge variant={scheduler.running ? "default" : "secondary"}>
                {scheduler.running ? "Scheduler Running" : "Scheduler Stopped"}
              </Badge>
            )}
            <Button
              onClick={loadPhases}
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
          </div>
        </CardTitle>
        <CardDescription>
          Monitor and control all scheduler phases. Edit schedule times and trigger phases manually.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Scheduler Info */}
        {scheduler && (
          <div className="p-4 bg-muted rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Timezone:</span>
              <span className="text-sm text-muted-foreground">{scheduler.timezone}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Memory Threshold:</span>
              <span className="text-sm text-muted-foreground">{scheduler.memoryThreshold}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Weekend Skip:</span>
              <Badge variant={scheduler.weekendSkip ? "default" : "secondary"}>
                {scheduler.weekendSkip ? "Enabled" : "Disabled"}
              </Badge>
            </div>
          </div>
        )}

        {/* Phases List */}
        <div className="space-y-4">
          {phases.map((phase) => (
            <div
              key={phase.id}
              className="p-4 border rounded-lg space-y-3"
            >
              {/* Phase Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  {getStatusIcon(phase.status)}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">{phase.name}</h4>
                      {getStatusBadge(phase.status)}
                      <Badge variant="outline">{phase.mode}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{phase.description}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {phase.tasks.map((task, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {task}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Trigger Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t">
                <div>
                  <Label className="text-xs text-muted-foreground">Trigger</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={phase.trigger.type === 'scheduled' ? "default" : "secondary"}>
                      {phase.trigger.type === 'scheduled' ? 'Scheduled' : 'Auto'}
                    </Badge>
                    <span className="text-sm text-muted-foreground">{phase.trigger.condition}</span>
                  </div>
                </div>

                {/* Edit Time for Scheduled Phases */}
                {phase.trigger.type === 'scheduled' && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Schedule Time</Label>
                    <div className="flex items-center gap-2 mt-1">
                      {editingPhase === phase.id ? (
                        <>
                          <Input
                            type="time"
                            value={editTime}
                            onChange={(e) => setEditTime(e.target.value)}
                            className="w-32"
                          />
                          <Button
                            onClick={() => handleSaveTime(phase.id)}
                            size="sm"
                            variant="default"
                          >
                            <Save className="w-3 h-3 mr-1" />
                            Save
                          </Button>
                          <Button
                            onClick={() => {
                              setEditingPhase(null);
                              setEditTime('');
                            }}
                            size="sm"
                            variant="outline"
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="text-sm font-medium">{phase.trigger.schedule}</span>
                          <Button
                            onClick={() => handleEditTime(phase)}
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2"
                          >
                            <Edit2 className="w-3 h-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Button */}
              <div className="flex justify-end pt-2 border-t">
                <Button
                  onClick={() => handleTriggerPhase(phase.id)}
                  disabled={triggering[phase.id] || phase.status === 'running'}
                  size="sm"
                  variant={phase.status === 'running' ? "secondary" : "default"}
                >
                  {triggering[phase.id] ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 mr-2" />
                  )}
                  {phase.status === 'running' ? 'Running...' : triggering[phase.id] ? 'Triggering...' : 'Trigger Phase'}
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Info Note */}
        <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
          <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-700 dark:text-blue-300">
            <strong>Note:</strong> Phase 1 phases are scheduled (can edit time). Phase 2-6 are auto-triggered sequentially. 
            You can trigger any phase manually at any time. Click "Refresh" button to update status.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { Loader2, Clock, Save, Play, RefreshCw, AlertCircle, Edit2, X, Info } from "lucide-react";
import { useToast } from "../../../contexts/ToastContext";
import { api } from "../../../services/api";

interface Phase {
  id: string;
  name: string;
  description: string;
  status: 'idle' | 'running' | 'stopped';
  enabled?: boolean;
  trigger: {
    type: 'scheduled' | 'auto';
    schedule?: string;
    triggerAfterPhase?: string;
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
  const [editTriggerType, setEditTriggerType] = useState<'scheduled' | 'auto'>('scheduled');
  const [editTriggerAfterPhase, setEditTriggerAfterPhase] = useState<string>('');
  const [triggering, setTriggering] = useState<Record<string, boolean>>({});
  const [toggling, setToggling] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [togglingScheduler, setTogglingScheduler] = useState(false);
  const [editingConfig, setEditingConfig] = useState<{
    timezone?: boolean;
    memoryThreshold?: boolean;
    weekendSkip?: boolean;
  }>({});
  const [editTimezone, setEditTimezone] = useState<string>('');
  const [editMemoryThreshold, setEditMemoryThreshold] = useState<string>('');
  const timeInputRef = useRef<HTMLInputElement>(null);

  // Helper function to trigger time picker
  const triggerTimePicker = (inputRef: React.RefObject<HTMLInputElement>) => {
    if (inputRef.current) {
      inputRef.current.showPicker();
    }
  };

  // Helper function to format time for display (HH:MM)
  const formatTimeForDisplay = (time: string) => {
    if (!time) return '';
    const parts = time.split(':');
    if (parts.length >= 2) {
      return `${parts[0]}:${parts[1]}`;
    }
    return time;
  };

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

  const handleToggleEnabled = async (phaseId: string, enabled: boolean) => {
    setToggling(prev => ({ ...prev, [phaseId]: true }));
    try {
      const result = await api.togglePhaseEnabled(phaseId, enabled);
      if (result.success) {
        showToast({
          type: 'success',
          title: enabled ? 'Phase Enabled' : 'Phase Disabled',
          message: result.message || `Phase ${phaseId} ${enabled ? 'enabled' : 'disabled'} successfully`
        });
        // Reload phases after a short delay
        setTimeout(() => loadPhases(), 500);
      } else {
        showToast({
          type: 'error',
          title: 'Toggle Failed',
          message: result.error || `Failed to toggle phase ${phaseId}`
        });
      }
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'Toggle Error',
        message: error.message || 'Failed to toggle phase'
      });
    } finally {
      setToggling(prev => ({ ...prev, [phaseId]: false }));
    }
  };

  const handleEditTrigger = (phase: Phase) => {
    setEditTriggerType(phase.trigger.type);
    if (phase.trigger.type === 'scheduled') {
      if (phase.trigger.schedule) {
        // Convert HH:MM to time input format (HH:MM:SS -> HH:MM)
        const parts = phase.trigger.schedule.split(':');
        const hours = parts[0] || '00';
        const minutes = parts[1] || '00';
        setEditTime(`${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`);
      } else {
        // If no schedule set, use default
        setEditTime('00:00');
      }
      setEditTriggerAfterPhase('');
    } else {
      // Auto trigger type
      setEditTime('');
      if (phase.trigger.triggerAfterPhase) {
        setEditTriggerAfterPhase(phase.trigger.triggerAfterPhase);
      } else {
        setEditTriggerAfterPhase('');
      }
    }
    setEditingPhase(phase.id);
  };

  const handleToggleScheduler = async (enabled: boolean) => {
    setTogglingScheduler(true);
    try {
      const result = enabled ? await api.startScheduler() : await api.stopScheduler();
      if (result.success) {
        showToast({
          type: 'success',
          title: enabled ? 'Scheduler Started' : 'Scheduler Stopped',
          message: `Scheduler ${enabled ? 'started' : 'stopped'} successfully`
        });
        setTimeout(() => loadPhases(), 500);
      } else {
        showToast({
          type: 'error',
          title: 'Toggle Failed',
          message: result.error || `Failed to ${enabled ? 'start' : 'stop'} scheduler`
        });
      }
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'Toggle Error',
        message: error.message || 'Failed to toggle scheduler'
      });
    } finally {
      setTogglingScheduler(false);
    }
  };

  const handleSaveTriggerConfig = async (phaseId: string) => {
    setSaving(prev => ({ ...prev, [phaseId]: true }));
    
    try {
      let schedule: string | undefined;
      let triggerAfterPhase: string | undefined;
      
      if (editTriggerType === 'scheduled') {
        if (!editTime) {
          showToast({
            type: 'error',
            title: 'Validation Error',
            message: 'Schedule time is required for scheduled trigger type'
          });
          setSaving(prev => ({ ...prev, [phaseId]: false }));
          return;
        }
        // Ensure time is in HH:MM format (remove seconds if present)
        const timeParts = editTime.split(':');
        if (timeParts.length >= 2) {
          schedule = `${(timeParts[0] ?? '00').padStart(2, '0')}:${(timeParts[1] ?? '00').padStart(2, '0')}`;
        } else {
          schedule = editTime;
        }
        
        // Validate that scheduler time is in the future (only for phase1a_input_daily)
        if (phaseId === 'phase1a_input_daily') {
          const [newHour, newMinute] = schedule.split(':').map(Number);
          const now = new Date();
          
          // Get current time in WIB (UTC+7)
          const utcHours = now.getUTCHours();
          const utcMinutes = now.getUTCMinutes();
          let currentHours = utcHours + 7; // WIB = UTC+7
          let currentMinutes = utcMinutes;
          if (currentHours >= 24) {
            currentHours -= 24;
          }
          
          // Compare times (handle same-day comparison)
          const newTimeMinutes = (newHour ?? 0) * 60 + (newMinute ?? 0);
          const currentTimeMinutes = currentHours * 60 + currentMinutes;
          
          // If new time is less than or equal to current time, it's in the past (same day)
          // Note: For daily scheduler, we only allow setting time for today that is in the future
          // If user wants to set for tomorrow, they should wait until after midnight
          if (newTimeMinutes <= currentTimeMinutes) {
            showToast({
              type: 'error',
              title: 'Validation Error',
              message: `Scheduler time must be in the future. Current time is ${String(currentHours).padStart(2, '0')}:${String(currentMinutes).padStart(2, '0')} WIB. Please set a time after the current time.`
            });
            setSaving(prev => ({ ...prev, [phaseId]: false }));
            return;
          }
        }
      } else {
        if (!editTriggerAfterPhase) {
          showToast({
            type: 'error',
            title: 'Validation Error',
            message: 'Trigger after phase is required for auto trigger type'
          });
          setSaving(prev => ({ ...prev, [phaseId]: false }));
          return;
        }
        triggerAfterPhase = editTriggerAfterPhase;
      }
      
      const result = await api.updatePhaseTriggerConfig(phaseId, editTriggerType, schedule, triggerAfterPhase);
      
      if (result.success) {
        showToast({
          type: 'success',
          title: 'Trigger Config Updated',
          message: result.message || 'Phase trigger configuration updated successfully'
        });
        setEditingPhase(null);
        setEditTime('');
        setEditTriggerType('scheduled');
        setEditTriggerAfterPhase('');
        setTimeout(() => loadPhases(), 1000);
      } else {
        showToast({
          type: 'error',
          title: 'Update Failed',
          message: result.error || 'Failed to update trigger configuration'
        });
      }
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'Update Error',
        message: error.message || 'Failed to update trigger configuration'
      });
    } finally {
      setSaving(prev => ({ ...prev, [phaseId]: false }));
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
        <CardTitle className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            <span className="text-lg sm:text-xl">Scheduler Phases Configuration</span>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            {scheduler && (
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={scheduler.running}
                  onChange={(e) => handleToggleScheduler(e.target.checked)}
                  disabled={togglingScheduler}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"></div>
                <span className="ml-3 text-xs sm:text-sm font-medium text-foreground whitespace-nowrap">
                  {scheduler.running ? 'Scheduler Running' : 'Scheduler Stopped'}
                </span>
              </label>
            )}
            <Button
              onClick={loadPhases}
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
        <CardDescription className="mt-2">
          Monitor and control all scheduler phases. Edit schedule times and trigger phases manually.
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-2 overflow-visible">
        {/* Scheduler Info */}
        {scheduler && (
          <div className="p-3 sm:p-4 bg-muted rounded-lg space-y-3 mb-6">
            {/* Timezone */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <span className="text-sm font-medium">Timezone:</span>
              {editingConfig.timezone ? (
                <div className="flex items-center gap-2 flex-1 sm:flex-initial">
                  <Input
                    type="text"
                    value={editTimezone}
                    onChange={(e) => setEditTimezone(e.target.value)}
                    className="flex-1 sm:w-48 h-8"
                    placeholder="e.g., Asia/Jakarta"
                  />
                  <Button
                    onClick={async () => {
                      try {
                        const result = await api.updateSchedulerConfig({ TIMEZONE: editTimezone });
                        if (result.success) {
                          showToast({
                            type: 'success',
                            title: 'Timezone Updated',
                            message: 'Timezone updated successfully'
                          });
                          setEditingConfig(prev => ({ ...prev, timezone: false }));
                          setTimeout(() => loadPhases(), 500);
                        } else {
                          showToast({
                            type: 'error',
                            title: 'Update Failed',
                            message: result.error || 'Failed to update timezone'
                          });
                        }
                      } catch (error: any) {
                        showToast({
                          type: 'error',
                          title: 'Update Error',
                          message: error.message || 'Failed to update timezone'
                        });
                      }
                    }}
                    size="sm"
                    variant="default"
                    className="h-8"
                  >
                    <Save className="w-3 h-3" />
                  </Button>
                  <Button
                    onClick={() => {
                      setEditingConfig(prev => ({ ...prev, timezone: false }));
                      setEditTimezone('');
                    }}
                    size="sm"
                    variant="outline"
                    className="h-8"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{scheduler.timezone}</span>
                  <Button
                    onClick={() => {
                      setEditTimezone(scheduler.timezone || '');
                      setEditingConfig(prev => ({ ...prev, timezone: true }));
                    }}
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2"
                  >
                    <Edit2 className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </div>

            {/* Memory Threshold */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <span className="text-sm font-medium">Memory Threshold:</span>
              {editingConfig.memoryThreshold ? (
                <div className="flex items-center gap-2 flex-1 sm:flex-initial">
                  <Input
                    type="text"
                    value={editMemoryThreshold}
                    onChange={(e) => setEditMemoryThreshold(e.target.value)}
                    className="flex-1 sm:w-32 h-8"
                    placeholder="e.g., 12GB"
                  />
                  <Button
                    onClick={async () => {
                      try {
                        // Extract number from string (e.g., "12GB" -> 12)
                        const match = editMemoryThreshold.match(/(\d+)/);
                        if (!match || !match[1]) {
                          showToast({
                            type: 'error',
                            title: 'Invalid Format',
                            message: 'Please enter a valid memory threshold (e.g., 12GB)'
                          });
                          return;
                        }
                        const memoryGB = parseInt(match[1], 10);
                        if (isNaN(memoryGB) || memoryGB < 1) {
                          showToast({
                            type: 'error',
                            title: 'Invalid Value',
                            message: 'Memory threshold must be at least 1GB'
                          });
                          return;
                        }
                        const result = await api.updateSchedulerConfig({ MEMORY_THRESHOLD_GB: memoryGB });
                        if (result.success) {
                          showToast({
                            type: 'success',
                            title: 'Memory Threshold Updated',
                            message: 'Memory threshold updated successfully'
                          });
                          setEditingConfig(prev => ({ ...prev, memoryThreshold: false }));
                          setTimeout(() => loadPhases(), 500);
                        } else {
                          showToast({
                            type: 'error',
                            title: 'Update Failed',
                            message: result.error || 'Failed to update memory threshold'
                          });
                        }
                      } catch (error: any) {
                        showToast({
                          type: 'error',
                          title: 'Update Error',
                          message: error.message || 'Failed to update memory threshold'
                        });
                      }
                    }}
                    size="sm"
                    variant="default"
                    className="h-8"
                  >
                    <Save className="w-3 h-3" />
                  </Button>
                  <Button
                    onClick={() => {
                      setEditingConfig(prev => ({ ...prev, memoryThreshold: false }));
                      setEditMemoryThreshold('');
                    }}
                    size="sm"
                    variant="outline"
                    className="h-8"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{scheduler.memoryThreshold}</span>
                  <Button
                    onClick={() => {
                      setEditMemoryThreshold(scheduler.memoryThreshold || '');
                      setEditingConfig(prev => ({ ...prev, memoryThreshold: true }));
                    }}
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2"
                  >
                    <Edit2 className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </div>

            {/* Weekend Skip */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <span className="text-sm font-medium">Weekend Skip:</span>
              <div className="flex items-center gap-2">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scheduler.weekendSkip}
                    onChange={async (e) => {
                      try {
                        const result = await api.updateSchedulerConfig({ WEEKEND_SKIP: e.target.checked });
                        if (result.success) {
                          showToast({
                            type: 'success',
                            title: 'Weekend Skip Updated',
                            message: `Weekend skip ${e.target.checked ? 'enabled' : 'disabled'} successfully`
                          });
                          setTimeout(() => loadPhases(), 500);
                        } else {
                          showToast({
                            type: 'error',
                            title: 'Update Failed',
                            message: result.error || 'Failed to update weekend skip'
                          });
                        }
                      } catch (error: any) {
                        showToast({
                          type: 'error',
                          title: 'Update Error',
                          message: error.message || 'Failed to update weekend skip'
                        });
                      }
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  <span className="ml-3 text-sm font-medium text-foreground">
                    {scheduler.weekendSkip ? 'Enabled' : 'Disabled'}
                  </span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Phases Table */}
        <div className="overflow-x-auto -mx-6 sm:mx-0 overflow-y-visible">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px] sm:min-w-[300px]">Phase</TableHead>
                <TableHead className="min-w-[100px] sm:min-w-[120px]">Status</TableHead>
                <TableHead className="min-w-[180px] sm:min-w-[200px]">Schedule Time</TableHead>
                <TableHead className="min-w-[120px] sm:min-w-[150px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {phases.map((phase, index) => (
                <TableRow key={phase.id} className={index === phases.length - 1 ? "!border-b-0" : ""}>
                  {/* Phase Name with Info Tooltip */}
                  <TableCell className="overflow-visible">
                    <div className="flex items-center gap-2 relative">
                      <span className="font-semibold text-sm sm:text-base break-words">{phase.name}</span>
                      <div className="relative group flex-shrink-0">
                        <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                        <div className="absolute left-0 bottom-full mb-2 w-[280px] sm:w-72 p-3 bg-popover border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[9999] pointer-events-none whitespace-normal">
                          <div className="text-sm font-semibold mb-2">{phase.name}</div>
                          <div className="text-xs text-muted-foreground mb-2">{phase.description}</div>
                          <div className="text-xs font-medium mb-1">Calculations:</div>
                          <ul className="text-xs text-muted-foreground space-y-1">
                            {phase.tasks.map((task, idx) => (
                              <li key={idx}>• {task}</li>
                            ))}
                          </ul>
                          <div className="text-xs mt-2">
                            <span className="font-medium">Mode:</span> {phase.mode}
                          </div>
                        </div>
                      </div>
                    </div>
                  </TableCell>

                  {/* Status Switch */}
                  <TableCell>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={phase.enabled !== false}
                        onChange={(e) => handleToggleEnabled(phase.id, e.target.checked)}
                        disabled={toggling[phase.id] || phase.status === 'running'}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"></div>
                      <span className="ml-3 text-sm font-medium text-gray-700">
                        {phase.enabled !== false ? 'On' : 'Off'}
                      </span>
                    </label>
                  </TableCell>

                  {/* Schedule Time / Trigger Config */}
                  <TableCell>
                    {editingPhase === phase.id ? (
                      <div className="space-y-2 sm:space-y-3 py-1">
                        {/* Trigger Type Selector */}
                        <div className="flex justify-start">
                          <Select
                            value={editTriggerType}
                            onValueChange={(value: 'scheduled' | 'auto') => {
                              setEditTriggerType(value);
                              // Initialize values when switching trigger type
                              if (value === 'scheduled') {
                                // If switching to scheduled and editTime is empty, set default time
                                if (!editTime) {
                                  setEditTime('00:00');
                                }
                                // Clear triggerAfterPhase when switching to scheduled
                                setEditTriggerAfterPhase('');
                              } else {
                                // If switching to auto, clear editTime
                                setEditTime('');
                                // If triggerAfterPhase is empty, try to get from current phase config
                                const currentPhase = phases.find(p => p.id === phase.id);
                                if (!editTriggerAfterPhase && currentPhase?.trigger.triggerAfterPhase) {
                                  setEditTriggerAfterPhase(currentPhase.trigger.triggerAfterPhase);
                                }
                              }
                            }}
                          >
                            <SelectTrigger className="w-full sm:w-48">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="scheduled">Scheduled (Time)</SelectItem>
                              <SelectItem value="auto">Auto (After Phase)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        {/* Conditional Inputs */}
                        {editTriggerType === 'scheduled' ? (
                          <div className="flex justify-start">
                            <div 
                              className="relative w-full sm:w-40 h-9 rounded-md border border-input bg-background cursor-pointer hover:bg-accent/50 transition-colors"
                              onClick={() => triggerTimePicker(timeInputRef)}
                            >
                              <input
                                ref={timeInputRef}
                                type="time"
                                value={editTime}
                                onChange={(e) => setEditTime(e.target.value)}
                                onKeyDown={(e) => {
                                  // Prevent all keyboard input except navigation
                                  if (e.key !== 'Tab' && e.key !== 'Enter' && e.key !== 'Escape') {
                                    e.preventDefault();
                                  }
                                }}
                                onPaste={(e) => e.preventDefault()}
                                onInput={(e) => e.preventDefault()}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                style={{ caretColor: 'transparent' }}
                              />
                              <div className="flex items-center justify-between h-full px-3">
                                <span className="text-sm text-foreground">
                                  {formatTimeForDisplay(editTime) || '00:00'}
                                </span>
                                <Clock className="w-4 h-4 text-foreground" />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex justify-start">
                            <Select
                              value={editTriggerAfterPhase}
                              onValueChange={setEditTriggerAfterPhase}
                            >
                              <SelectTrigger className="w-full sm:w-64">
                                <SelectValue placeholder="Select phase to trigger after" />
                              </SelectTrigger>
                              <SelectContent>
                                {phases
                                  .filter(p => p.id !== phase.id)
                                  .map(p => (
                                    <SelectItem key={p.id} value={p.id}>
                                      {p.name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        
                        {/* Action Buttons */}
                        <div className="flex items-center justify-start gap-2 pt-1">
                          <Button
                            onClick={() => handleSaveTriggerConfig(phase.id)}
                            size="sm"
                            variant="default"
                            className="h-8 w-8 p-0"
                            disabled={saving[phase.id]}
                          >
                            {saving[phase.id] ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Save className="w-4 h-4" />
                            )}
                          </Button>
                          <Button
                            onClick={() => {
                              setEditingPhase(null);
                              setEditTime('');
                              setEditTriggerType('scheduled');
                              setEditTriggerAfterPhase('');
                            }}
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0"
                            disabled={saving[phase.id]}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                        {phase.trigger.type === 'scheduled' ? (
                          <span className="text-xs sm:text-sm font-medium break-words">{phase.trigger.schedule}</span>
                        ) : (
                          <span className="text-xs sm:text-sm text-muted-foreground break-words">{phase.trigger.condition}</span>
                        )}
                        <Button
                          onClick={() => handleEditTrigger(phase)}
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 flex-shrink-0"
                        >
                          <Edit2 className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </TableCell>

                  {/* Trigger Button */}
                  <TableCell>
                    <Button
                      onClick={() => handleTriggerPhase(phase.id)}
                      disabled={triggering[phase.id] || phase.status === 'running' || phase.enabled === false}
                      size="sm"
                      variant={phase.status === 'running' ? "secondary" : "default"}
                      className="w-full sm:w-auto"
                    >
                      {triggering[phase.id] ? (
                        <>
                          <Loader2 className="w-4 h-4 sm:mr-2 animate-spin" />
                          <span className="hidden sm:inline">Triggering...</span>
                        </>
                      ) : phase.status === 'running' ? (
                        <>
                          <Loader2 className="w-4 h-4 sm:mr-2 animate-spin" />
                          <span className="hidden sm:inline">Running...</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 sm:mr-2" />
                          <span className="hidden sm:inline">Trigger</span>
                        </>
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Info Note */}
        <div className="flex items-start gap-2 p-3 bg-blue-950/20 rounded-lg mt-0">
          <AlertCircle className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-300">
            <strong>Note:</strong> Phase 1 phases are scheduled (can edit time). Phase 2-6 are auto-triggered sequentially. 
            You can trigger any phase manually at any time. Hover over the info icon to see calculation details. Click "Refresh" button to update status.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

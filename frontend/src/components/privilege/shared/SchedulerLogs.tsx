import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { Loader2, CheckCircle, AlertCircle, RefreshCw, Clock, User, Trash2 } from "lucide-react";
import { useToast } from "../../../contexts/ToastContext";
import { ConfirmationDialog } from "../../ui/confirmation-dialog";

const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';

function formatJakartaTime(dateString: string): string {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  // Format: DD/MM/YYYY, HH.MM.SS
  const formatted = date.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  // Replace comma with space, and replace dots in time part (HH.MM.SS) with colons
  // Format is typically: DD/MM/YYYY, HH.MM.SS or DD/MM/YYYY HH.MM.SS
  return formatted
    .replace(/,/g, ' ')
    .replace(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2})\.(\d{2})\.(\d{2})/, '$1 $2:$3:$4')
    .replace(/(\s)(\d{2})\.(\d{2})\.(\d{2})$/, '$1$2:$3:$4'); // Fallback for any remaining time format
}

export function SchedulerLogs() {
  const { showToast } = useToast();
  
  // Scheduler Logs States
  const [schedulerLogs, setSchedulerLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logsCurrentPage, setLogsCurrentPage] = useState(1);
  const [logsTotalPages, setLogsTotalPages] = useState(1);
  const [logsTotal, setLogsTotal] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [logToDelete, setLogToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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
        const total = result.total || result.data.length;
        const totalPages = Math.ceil(total / limit);
        setLogsTotal(total);
        setLogsTotalPages(totalPages);
        setLogsCurrentPage(page);
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

  useEffect(() => {
    loadSchedulerLogs(1, 10);
  }, []);

  const handleDeleteClick = (logId: string) => {
    setLogToDelete(logId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!logToDelete) return;
    
    setDeleting(true);
    try {
      const response = await fetch(`${API_URL}/api/trigger/logs/${logToDelete}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        showToast({ type: 'success', title: 'Success', message: 'Log deleted successfully' });
        await loadSchedulerLogs(logsCurrentPage, 10);
      } else {
        showToast({ type: 'error', title: 'Error', message: result.error || 'Failed to delete log' });
      }
    } catch (error) {
      console.error('Error deleting log:', error);
      showToast({ type: 'error', title: 'Error', message: 'Error deleting log' });
    } finally {
      setDeleting(false);
      setLogToDelete(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5" />
          <span className="text-lg sm:text-xl">Scheduler Logs</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
          <p className="text-xs sm:text-sm text-muted-foreground">
            Recent scheduler execution logs ({logsTotal} total)
          </p>
          <Button
            onClick={() => loadSchedulerLogs(logsCurrentPage, 10)}
            disabled={loadingLogs}
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
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
                    <TableHead>Actions</TableHead>
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
                        <TableCell>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteClick(log.id)}
                            className="h-7 px-2 text-xs whitespace-nowrap min-h-[28px] bg-red-600 hover:bg-red-700 text-white border-red-600 hover:border-red-700"
                          >
                            <Trash2 className="w-3 h-3 mr-1" />
                            Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {logsTotalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
                <div className="text-xs sm:text-sm text-muted-foreground text-center sm:text-left">
                  Showing {((logsCurrentPage - 1) * 10) + 1} to {Math.min(logsCurrentPage * 10, logsTotal)} of {logsTotal} logs
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadSchedulerLogs(logsCurrentPage - 1, 10)}
                    disabled={logsCurrentPage === 1}
                  >
                    <span className="hidden sm:inline">Previous</span>
                    <span className="sm:hidden">Prev</span>
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, logsTotalPages) }, (_, i) => {
                      const page = i + 1;
                      return (
                        <Button
                          key={page}
                          variant={logsCurrentPage === page ? "default" : "outline"}
                          size="sm"
                          onClick={() => loadSchedulerLogs(page, 10)}
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
                    onClick={() => loadSchedulerLogs(logsCurrentPage + 1, 10)}
                    disabled={logsCurrentPage === logsTotalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>

      <ConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Log"
        description="Are you sure you want to delete this log? This action cannot be undone."
        onConfirm={handleDeleteConfirm}
        confirmText="Yes"
        cancelText="No"
        isLoading={deleting}
      />
    </Card>
  );
}


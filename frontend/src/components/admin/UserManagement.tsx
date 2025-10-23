import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { 
  Search, 
  UserCheck, 
  UserX, 
  Mail, 
  MailCheck,
  Calendar,
  Shield,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useTabFocus } from "../../hooks/useTabFocus";
import { useToast } from "../../contexts/ToastContext";

interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  email_verified: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}


export function UserManagement() {
  const { showToast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 5,
    total: 0,
    totalPages: 0
  });
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    // Only fetch on mount or if data is stale (older than 2 minutes)
    const now = Date.now();
    if (!isInitialized || (now - lastFetchTime) > 2 * 60 * 1000) {
      fetchUsers();
    } else {
      setLoading(false);
    }
  }, [isInitialized, lastFetchTime]);

  // Listen for auth changes to reset cache only on sign in/out
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        // Only fetch if we don't have data yet
        if (!isInitialized) {
          fetchUsers();
        }
      } else if (event === 'SIGNED_OUT') {
        setUsers([]);
        setIsInitialized(false);
        setLastFetchTime(0);
        setCurrentPage(1);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [isInitialized]); // Add isInitialized as dependency

  // Use tab focus hook to prevent unnecessary refreshes
  useTabFocus(() => {
    // Only refresh if data is stale (older than 5 minutes)
    const now = Date.now();
    if (isInitialized && (now - lastFetchTime) > 5 * 60 * 1000) {
      fetchUsers();
    }
  }, 5 * 60 * 1000, lastFetchTime); // 5 minutes stale time

  useEffect(() => {
    // Fetch on filter changes or page changes
    const now = Date.now();
    const isFilterChange = search || roleFilter || statusFilter;
    const isStale = (now - lastFetchTime) > 2 * 60 * 1000; // 2 minute cache
    
    if (isFilterChange || isStale) {
      // Reset to page 1 when filters change
      if (isFilterChange && currentPage !== 1) {
        setCurrentPage(1);
        return; // fetchUsers will be called in the next effect
      }
      fetchUsers();
    }
  }, [currentPage, search, roleFilter, statusFilter]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      
      // Get fresh session (this will refresh token if needed)
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        throw new Error(`Session error: ${sessionError.message}`);
      }
      
      if (!session) {
        throw new Error('No active session');
      }

      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '5'
      });

      if (search) params.append('search', search);
      if (roleFilter) params.append('role', roleFilter);
      if (statusFilter) params.append('status', statusFilter);

      const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${API_URL}/api/admin/users?${params}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }

      const result = await response.json();
      console.log('UserManagement: API Response:', result);
      if (result.ok) {
        setUsers(result.data.users);
        setPagination(result.data.pagination);
        setLastFetchTime(Date.now());
        setIsInitialized(true);
        console.log('UserManagement: Data fetched successfully, users:', result.data.users.length);
        console.log('UserManagement: Pagination:', result.data.pagination);
      } else {
        throw new Error(result.error || 'Failed to fetch users');
      }
    } catch (err: any) {
      console.error('Error fetching users:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSuspendUser = async (userId: string, currentStatus: boolean) => {
    try {
      setActionLoading(userId);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('No active session');
      }

      const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${API_URL}/api/admin/users/${userId}/suspend`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ suspended: currentStatus })
      });

      if (!response.ok) {
        throw new Error('Failed to update user status');
      }

      const result = await response.json();
      if (result.ok) {
        // Update local state
        setUsers(prev => prev.map(user => 
          user.id === userId 
            ? { ...user, is_active: !currentStatus, updated_at: new Date().toISOString() }
            : user
        ));
      } else {
        throw new Error(result.error || 'Failed to update user status');
      }
    } catch (err: any) {
      console.error('Error updating user status:', err);
      showToast({
        type: 'error',
        title: 'Error',
        message: err.message || 'Failed to update user status',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  if (loading && users.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <CardDescription>Manage user accounts and permissions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center space-x-4 p-4 border rounded-lg">
                <div className="h-10 w-10 bg-muted animate-pulse rounded-full"></div>
                <div className="space-y-2 flex-1">
                  <div className="h-4 w-32 bg-muted animate-pulse rounded"></div>
                  <div className="h-3 w-48 bg-muted animate-pulse rounded"></div>
                </div>
                <div className="h-8 w-20 bg-muted animate-pulse rounded"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>User Management</CardTitle>
        <CardDescription>Manage user accounts and permissions</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 border border-input rounded-md bg-background text-sm"
            >
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="user">User</option>
              <option value="moderator">Moderator</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-input rounded-md bg-background text-sm"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {/* Users List */}
        <div className="space-y-4 min-h-[500px]">
          {users.map((user) => (
            <div key={user.id} className="flex items-center space-x-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
              <Avatar className="h-10 w-10">
                <AvatarImage src="" />
                <AvatarFallback>{getInitials(user.full_name || user.email)}</AvatarFallback>
              </Avatar>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-medium truncate">{user.full_name}</p>
                  <Badge variant={user.role === 'admin' ? 'default' : 'secondary'} className="text-xs">
                    <Shield className="h-3 w-3 mr-1" />
                    {user.role}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    {user.email_verified ? (
                      <MailCheck className="h-3 w-3 text-green-600" />
                    ) : (
                      <Mail className="h-3 w-3 text-orange-600" />
                    )}
                    {user.email_verified ? 'Verified' : 'Unverified'}
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Joined {formatDate(user.created_at)}
                  </div>
                  {user.last_login_at && (
                    <div className="flex items-center gap-1">
                      <UserCheck className="h-3 w-3" />
                      Last login {formatDate(user.last_login_at)}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant={user.is_active ? 'default' : 'destructive'}>
                  {user.is_active ? 'Active' : 'Suspended'}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSuspendUser(user.id, user.is_active)}
                  disabled={actionLoading === user.id}
                  className={user.is_active ? 'text-destructive hover:text-destructive' : 'text-green-600 hover:text-green-600'}
                >
                  {actionLoading === user.id ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : user.is_active ? (
                    <>
                      <UserX className="h-4 w-4 mr-1" />
                      Suspend
                    </>
                  ) : (
                    <>
                      <UserCheck className="h-4 w-4 mr-1" />
                      Unsuspend
                    </>
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between mt-6">
            <p className="text-sm text-muted-foreground">
              Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} users
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                  const page = i + 1;
                  return (
                    <Button
                      key={page}
                      variant={currentPage === page ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(page)}
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
                onClick={() => setCurrentPage(prev => Math.min(pagination.totalPages, prev + 1))}
                disabled={currentPage === pagination.totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {error && (
          <div className="text-center text-destructive mt-4">
            <p>Error loading users: {error}</p>
            <Button variant="outline" onClick={fetchUsers} className="mt-2">
              Try again
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

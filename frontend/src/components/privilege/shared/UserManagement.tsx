import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Badge } from "../../ui/badge";
import { Avatar, AvatarFallback } from "../../ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { 
  Search, 
  UserCheck, 
  UserX, 
  Mail, 
  MailCheck,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle
} from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { getRoleDisplayName } from "../../../utils/role";

const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';

// Function to get initials from full name
function getInitials(fullName: string | null | undefined, email: string): string {
  if (fullName && fullName.trim()) {
    const words = fullName.trim().split(/\s+/).filter(w => w.length > 0);
    if (words.length >= 2) {
      // Get first letter of first and last word
      const first = words[0]?.charAt(0) || '';
      const last = words[words.length - 1]?.charAt(0) || '';
      return (first + last).toUpperCase();
    } else if (words.length === 1 && words[0]) {
      // Get first two letters if only one word
      return words[0].substring(0, 2).toUpperCase();
    }
  }
  // Fallback to email initials
  return email.substring(0, 2).toUpperCase();
}

// Format time function with Asia/Jakarta timezone, using colon for time separator
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

interface UserManagementProps {
  apiPrefix: 'admin' | 'developer';
  onUserStatusChange?: () => void;
}

export function UserManagement({ apiPrefix, onUserStatusChange }: UserManagementProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [recentUsers, setRecentUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0
  });

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${API_URL}/api/${apiPrefix}/users?page=${pagination.page}&limit=${pagination.limit}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to load users');
      }

      const json = await response.json();
      
      if (json.ok && json.data) {
        // Ensure role field is properly normalized
        const normalizedUsers = (json.data.users || []).map((user: User) => {
          // Normalize role: trim whitespace and ensure lowercase for consistency
          const normalizedRole = user.role && user.role.trim() 
            ? user.role.trim().toLowerCase() 
            : 'user';
          
          // Debug logging to help identify role display issues
          if (normalizedRole !== 'user' && normalizedRole !== 'admin' && normalizedRole !== 'developer') {
            console.warn('Unexpected role value:', { original: user.role, normalized: normalizedRole, email: user.email });
          }
          
          return {
            ...user,
            role: normalizedRole
          };
        });
        setUsers(normalizedUsers);
        setPagination(prev => ({
          ...prev,
          total: json.data.pagination?.total || 0,
          totalPages: json.data.pagination?.totalPages || 0
        }));
      }

    } catch (err) {
      console.error('Error loading users:', err);
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const loadRecentUsers = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`${API_URL}/api/${apiPrefix}/recent-users?limit=5`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to load recent users');
      }

      const json = await response.json();
      
      if (json.ok && json.data) {
        // Ensure role field is properly normalized
        const normalizedUsers = (json.data || []).map((user: User) => ({
          ...user,
          role: user.role ? user.role.trim().toLowerCase() : 'user'
        }));
        setRecentUsers(normalizedUsers);
      }
    } catch (err) {
      console.error('Error loading recent users:', err);
    }
  };

  const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`${API_URL}/api/${apiPrefix}/users/${userId}/suspend`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ suspended: currentStatus })
      });

      if (!response.ok) {
        throw new Error('Failed to update user status');
      }

      loadUsers();
      loadRecentUsers();
      onUserStatusChange?.();
    } catch (err) {
      console.error('Error updating user status:', err);
    }
  };

  const toggleEmailVerification = async (userId: string, currentStatus: boolean) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`${API_URL}/api/${apiPrefix}/users/${userId}/email-verification`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ email_verified: !currentStatus })
      });

      if (!response.ok) {
        throw new Error('Failed to update email verification status');
      }

      loadUsers();
      loadRecentUsers();
      onUserStatusChange?.();
    } catch (err) {
      console.error('Error updating email verification:', err);
    }
  };

  useEffect(() => {
    loadUsers();
    loadRecentUsers();
  }, [pagination.page]);

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.email.toLowerCase().includes(search.toLowerCase()) ||
                         user.full_name?.toLowerCase().includes(search.toLowerCase());
    
    // For admin dashboard, if filtering by "user", include both user and developer roles
    // (since developers are displayed as users in admin view)
    let matchesRole = true;
    if (roleFilter) {
      if (apiPrefix === 'admin' && roleFilter === 'user') {
        // For admin, user filter includes both user and developer roles
        matchesRole = user.role === 'user' || user.role === 'developer';
      } else {
        matchesRole = user.role === roleFilter;
      }
    }
    
    const matchesStatus = !statusFilter || 
                         (statusFilter === 'active' && user.is_active) ||
                         (statusFilter === 'inactive' && !user.is_active);
    
    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>User Management</CardTitle>
            <CardDescription>
              Manage user accounts and permissions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select value={roleFilter || "all"} onValueChange={(value) => setRoleFilter(value === "all" ? "" : value)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue>
                    {roleFilter === "" ? "All Roles" : roleFilter === "admin" ? "Admin" : roleFilter === "developer" ? (apiPrefix === 'admin' ? "User" : "Developer") : roleFilter === "user" ? "User" : "All Roles"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  {/* Hide developer filter option for admin dashboard - developers will appear as users */}
                  {apiPrefix !== 'admin' && <SelectItem value="developer">Developer</SelectItem>}
                  <SelectItem value="user">User</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter || "all"} onValueChange={(value) => setStatusFilter(value === "all" ? "" : value)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue>
                    {statusFilter === "" ? "All Status" : statusFilter === "active" ? "Active" : statusFilter === "inactive" ? "Inactive" : "All Status"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                <span>Loading users...</span>
              </div>
            ) : error ? (
              <div className="text-center py-8 text-red-600">
                <AlertCircle className="w-6 h-6 mx-auto mb-2" />
                <p>{error}</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Last Login</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback>
                                  {getInitials(user.full_name, user.email)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="font-medium">{user.full_name || 'No name'}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {apiPrefix === 'admin' && user.role === 'developer' 
                                ? getRoleDisplayName('user')
                                : getRoleDisplayName(user.role)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Badge variant={user.is_active ? "default" : "secondary"}>
                                {user.is_active ? "Active" : "Inactive"}
                              </Badge>
                              <Badge variant={user.email_verified ? "default" : "destructive"}>
                                {user.email_verified ? "Verified" : "Unverified"}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>
                            {user.last_login_at ? formatJakartaTime(user.last_login_at) : 'Never'}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => toggleUserStatus(user.id, user.is_active)}
                              >
                                {user.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => toggleEmailVerification(user.id, user.email_verified)}
                              >
                                {user.email_verified ? <Mail className="w-4 h-4" /> : <MailCheck className="w-4 h-4" />}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-muted-foreground">
                      Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} users
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setPagination(prev => ({ ...prev, page: prev.page - 1 }));
                        }}
                        disabled={pagination.page === 1}
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Previous
                      </Button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                          const page = i + 1;
                          return (
                            <Button
                              key={page}
                              variant={pagination.page === page ? "default" : "outline"}
                              size="sm"
                              onClick={() => {
                                setPagination(prev => ({ ...prev, page }));
                              }}
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
                        onClick={() => {
                          setPagination(prev => ({ ...prev, page: prev.page + 1 }));
                        }}
                        disabled={pagination.page === pagination.totalPages}
                      >
                        Next
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
      
      <div>
        <Card>
          <CardHeader>
            <CardTitle>Recent Users</CardTitle>
            <CardDescription>
              Latest registered users
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentUsers.map((user) => (
                <div key={user.id} className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      {getInitials(user.full_name, user.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{user.full_name || 'No name'}</div>
                    <div className="text-sm text-muted-foreground truncate">{user.email}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatJakartaTime(user.created_at)}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {apiPrefix === 'admin' && user.role === 'developer' 
                      ? getRoleDisplayName('user')
                      : getRoleDisplayName(user.role)}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

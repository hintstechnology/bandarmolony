import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { UserPlus, Mail, MailCheck, Calendar, Shield, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useTabFocus } from "../../hooks/useTabFocus";

interface RecentUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  email_verified: boolean;
  created_at: string;
}

export function RecentUsers() {
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 5,
    total: 0,
    totalPages: 0
  });

  useEffect(() => {
    // Only fetch on mount or if data is stale (older than 3 minutes)
    const now = Date.now();
    if (!isInitialized || (now - lastFetchTime) > 3 * 60 * 1000) {
      fetchRecentUsers();
    } else {
      setLoading(false);
    }
  }, [isInitialized, lastFetchTime, currentPage]);

  // Listen for auth changes to reset cache only on sign in/out
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        // Only fetch if we don't have data yet
        if (!isInitialized) {
          fetchRecentUsers();
        }
      } else if (event === 'SIGNED_OUT') {
        setRecentUsers([]);
        setIsInitialized(false);
        setLastFetchTime(0);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [isInitialized]); // Add isInitialized as dependency

  // Use tab focus hook to prevent unnecessary refreshes
  useTabFocus(() => {
    if (isInitialized) {
      fetchRecentUsers();
    }
  }, 3 * 60 * 1000, lastFetchTime); // 3 minutes stale time

  const fetchRecentUsers = async () => {
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

      const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${API_URL}/api/admin/recent-users?${params}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch recent users');
      }

      const result = await response.json();
      console.log('RecentUsers: API Response:', result);
      if (result.ok) {
        // Recent users endpoint returns data directly, not wrapped in users property
        const users = result.data || [];
        setRecentUsers(users);
        setPagination({
          page: 1,
          limit: 5,
          total: users.length,
          totalPages: 1
        });
        setLastFetchTime(Date.now());
        setIsInitialized(true);
        console.log('RecentUsers: Data fetched successfully, users:', users.length);
        console.log('RecentUsers: Users data:', users);
      } else {
        throw new Error(result.error || 'Failed to fetch recent users');
      }
    } catch (err: any) {
      console.error('Error fetching recent users:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) {
      return 'Just now';
    } else if (diffInHours < 24) {
      return `${diffInHours}h ago`;
    } else if (diffInHours < 48) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Registrations</CardTitle>
          <CardDescription>Latest users who joined the platform</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg">
                <div className="h-8 w-8 bg-muted animate-pulse rounded-full"></div>
                <div className="flex-1 min-w-0">
                  <div className="h-4 w-24 bg-muted animate-pulse rounded mb-1"></div>
                  <div className="h-3 w-32 bg-muted animate-pulse rounded"></div>
                </div>
                <div className="h-6 w-16 bg-muted animate-pulse rounded"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Registrations</CardTitle>
          <CardDescription>Latest users who joined the platform</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center text-destructive">
            <p>Error loading recent users: {error}</p>
            <button 
              onClick={fetchRecentUsers}
              className="mt-2 text-sm underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Registrations</CardTitle>
        <CardDescription>Latest users who joined the platform</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 min-h-[500px]">
          {recentUsers.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <UserPlus className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No recent registrations</p>
            </div>
          ) : (
            recentUsers.map((user) => (
              <div key={user.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                <Avatar className="h-8 w-8">
                  <AvatarImage src="" />
                  <AvatarFallback className="text-xs">{getInitials(user.full_name || user.email)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium truncate text-sm">{user.full_name}</p>
                    <Badge variant={user.role === 'admin' ? 'default' : 'secondary'} className="text-xs">
                      <Shield className="h-3 w-3 mr-1" />
                      {user.role}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    {user.email_verified ? (
                      <MailCheck className="h-3 w-3 text-green-600" />
                    ) : (
                      <Mail className="h-3 w-3 text-orange-600" />
                    )}
                    {user.email_verified ? 'Verified' : 'Unverified'}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {formatDate(user.created_at)}
                  </div>
                </div>
              </div>
            ))
          )}
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
      </CardContent>
    </Card>
  );
}

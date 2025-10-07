import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Users, UserCheck, UserPlus, Shield, Mail, MailCheck } from "lucide-react";
import { Badge } from "../ui/badge";
import { supabase } from "../../lib/supabase";
import { useTabFocus } from "../../hooks/useTabFocus";

interface UserStatsData {
  totalUsers: number;
  activeUsers: number;
  newUsers: number;
  roleDistribution: Record<string, number>;
  verificationStats: {
    verified: number;
    unverified: number;
  };
}

export function UserStats() {
  const [stats, setStats] = useState<UserStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Only fetch on mount or if data is stale (older than 5 minutes)
    const now = Date.now();
    if (!isInitialized || (now - lastFetchTime) > 5 * 60 * 1000) {
      fetchUserStats();
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
          fetchUserStats();
        }
      } else if (event === 'SIGNED_OUT') {
        setStats(null);
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
      fetchUserStats();
    }
  }, 5 * 60 * 1000, lastFetchTime); // 5 minutes stale time

  const fetchUserStats = async () => {
    try {
      setLoading(true);
      
      // Get fresh session (this will refresh token if needed)
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      console.log('UserStats - Session check:', {
        hasSession: !!session,
        hasToken: !!session?.access_token,
        userEmail: session?.user?.email,
        sessionError: sessionError?.message
      });
      
      if (sessionError) {
        throw new Error(`Session error: ${sessionError.message}`);
      }
      
      if (!session) {
        throw new Error('No active session');
      }

      const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${API_URL}/api/admin/stats`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user statistics');
      }

      const result = await response.json();
      if (result.ok) {
        setStats(result.data);
        setLastFetchTime(Date.now());
        setIsInitialized(true);
        console.log('UserStats: Data fetched successfully');
      } else {
        throw new Error(result.error || 'Failed to fetch statistics');
      }
    } catch (err: any) {
      console.error('Error fetching user stats:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 w-20 bg-muted animate-pulse rounded"></div>
              <div className="h-4 w-4 bg-muted animate-pulse rounded"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 bg-muted animate-pulse rounded mb-2"></div>
              <div className="h-3 w-24 bg-muted animate-pulse rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-destructive">
            <p>Error loading statistics: {error}</p>
            <button 
              onClick={fetchUserStats}
              className="mt-2 text-sm underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!stats) return null;

  const activePercentage = stats.totalUsers > 0 ? ((stats.activeUsers / stats.totalUsers) * 100).toFixed(1) : '0';
  const verifiedPercentage = stats.verificationStats.verified + stats.verificationStats.unverified > 0 
    ? ((stats.verificationStats.verified / (stats.verificationStats.verified + stats.verificationStats.unverified)) * 100).toFixed(1) 
    : '0';

  return (
    <div className="space-y-6">
      {/* Main Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              All registered users
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeUsers.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {activePercentage}% of total users
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New Users</CardTitle>
            <UserPlus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.newUsers.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              This month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Email Verified</CardTitle>
            <MailCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{verifiedPercentage}%</div>
            <p className="text-xs text-muted-foreground">
              {stats.verificationStats.verified} verified users
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Role Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>User Role Distribution</CardTitle>
          <CardDescription>Breakdown of users by role</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {Object.entries(stats.roleDistribution).map(([role, count]) => (
              <div key={role} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium capitalize">{role}</p>
                    <p className="text-sm text-muted-foreground">
                      {((count / stats.activeUsers) * 100).toFixed(1)}% of active users
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium">{count}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Email Verification Status */}
      <Card>
        <CardHeader>
          <CardTitle>Email Verification Status</CardTitle>
          <CardDescription>Verification status of active users</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-3">
                <MailCheck className="h-4 w-4 text-green-600" />
                <div>
                  <p className="font-medium">Verified</p>
                  <p className="text-sm text-muted-foreground">Email confirmed</p>
                </div>
              </div>
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                {stats.verificationStats.verified}
              </Badge>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-orange-600" />
                <div>
                  <p className="font-medium">Unverified</p>
                  <p className="text-sm text-muted-foreground">Email not confirmed</p>
                </div>
              </div>
              <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                {stats.verificationStats.unverified}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

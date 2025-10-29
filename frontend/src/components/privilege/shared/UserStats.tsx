import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { User, UserCheck, MailCheck, Shield } from "lucide-react";
import { supabase } from "../../../lib/supabase";

const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';

interface UserStatsProps {
  apiPrefix: 'admin' | 'developer';
  onStatsLoad?: (stats: any) => void;
}

export function UserStats({ apiPrefix, onStatsLoad }: UserStatsProps) {
  const [userStats, setUserStats] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    verified: 0,
    unverified: 0,
    admin: 0,
    developer: 0,
    user: 0
  });

  const loadUserStats = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`${API_URL}/api/${apiPrefix}/stats`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to load user stats');
      }

      const json = await response.json();
      
      if (json.ok && json.data) {
        const data = json.data;
        
        // For admin dashboard, developers should be counted as users
        const developerCount = data.roleDistribution?.developer || 0;
        const userCount = data.roleDistribution?.user || 0;
        
        const stats = {
          total: data.totalUsers || 0,
          active: data.activeUsers || 0,
          inactive: (data.totalUsers || 0) - (data.activeUsers || 0),
          verified: data.verificationStats?.verified || 0,
          unverified: data.verificationStats?.unverified || 0,
          admin: data.roleDistribution?.admin || 0,
          developer: apiPrefix === 'admin' ? 0 : developerCount, // Hide developer count for admin
          user: apiPrefix === 'admin' ? userCount + developerCount : userCount // Combine developer with user for admin
        };

        setUserStats(stats);
        onStatsLoad?.(stats);
      }
    } catch (err) {
      console.error('Error loading user stats:', err);
    }
  };

  useEffect(() => {
    loadUserStats();
  }, []);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Users</CardTitle>
          <User className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{userStats.total}</div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active Users</CardTitle>
          <UserCheck className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">{userStats.active}</div>
          <p className="text-xs text-muted-foreground">
            {userStats.total > 0 ? Math.round((userStats.active / userStats.total) * 100) : 0}% of total
          </p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Verified Users</CardTitle>
          <MailCheck className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-blue-600">{userStats.verified}</div>
          <p className="text-xs text-muted-foreground">
            {userStats.total > 0 ? Math.round((userStats.verified / userStats.total) * 100) : 0}% of total
          </p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{apiPrefix === 'admin' ? 'Admins' : 'Developers'}</CardTitle>
          <Shield className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-purple-600">
            {apiPrefix === 'admin' ? userStats.admin : userStats.developer}
          </div>
          <p className="text-xs text-muted-foreground">
            {apiPrefix === 'admin' ? `${userStats.user} users` : ''}
            {apiPrefix === 'developer' && userStats.admin > 0 && `${userStats.admin} admins`}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}


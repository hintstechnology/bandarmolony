import React, { useState, useEffect } from "react";
import { UserStats } from "./admin/UserStats";
import { UserManagement } from "./admin/UserManagement";
import { RecentUsers } from "./admin/RecentUsers";
import { Button } from "./ui/button";
import { RefreshCw } from "lucide-react";
import { supabase } from "../lib/supabase";

export function AdminDashboard() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Admin Dashboard</h1>
          <p className="text-muted-foreground">User management and platform overview</p>
        </div>
        <Button onClick={handleRefresh} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh Data
        </Button>
      </div>

      {/* User Statistics */}
      <UserStats key={`stats-${refreshKey}`} />

      {/* User Management and Recent Users */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <UserManagement key={`management-${refreshKey}`} />
        </div>
        <div>
          <RecentUsers key={`recent-${refreshKey}`} />
        </div>
      </div>
    </div>
  );
}

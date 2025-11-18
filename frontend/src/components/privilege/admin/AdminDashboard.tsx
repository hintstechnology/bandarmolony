import { Button } from "../../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import { RefreshCw, Shield, AlertTriangle } from "lucide-react";
import { useProfile } from "../../../contexts/ProfileContext";
import { useNavigate } from "react-router-dom";
import { getRoleDisplayName } from "../../../utils/role";
import { UserStats, UserManagement } from "../shared";

export function AdminDashboard() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  
  // Guard check
  if (!profile || profile.role !== 'admin') {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="w-5 h-5" />
            Access Denied
          </CardTitle>
          <CardDescription>
            You don't have permission to access this page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Shield className="w-4 h-4" />
              <span>Current role: {getRoleDisplayName(profile?.role || '')}</span>
            </div>
            <Button onClick={() => navigate('/')} className="w-full">
              Go to Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleRefresh = () => {
    // Refresh will be handled by each component internally
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold">Admin Dashboard</h1>
          <p className="text-sm sm:text-base text-muted-foreground">User management and platform overview</p>
        </div>
        <Button onClick={handleRefresh} variant="outline" size="sm" className="w-full sm:w-auto">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh Data
        </Button>
      </div>

      {/* User Statistics */}
      <UserStats apiPrefix="admin" />

      {/* User Management */}
      <UserManagement apiPrefix="admin" />
    </div>
  );
}

import React from "react";
import { useProfile } from "../contexts/ProfileContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Shield, AlertTriangle } from "lucide-react";
import { Button } from "./ui/button";
import { useNavigate } from "react-router-dom";

interface AdminGuardProps {
  children: React.ReactNode;
}

export function AdminGuard({ children }: AdminGuardProps) {
  const { profile, isLoading } = useProfile();
  const navigate = useNavigate();

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Check if user is admin
  if (!profile || profile.role !== 'admin') {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <Shield className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle className="text-2xl">Access Denied</CardTitle>
            <CardDescription>
              You don't have permission to access this page. Admin privileges required.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4" />
              <span>Current role: {profile?.role}</span>
            </div>
            <div className="space-y-2">
              <Button 
                onClick={() => navigate('/dashboard')} 
                className="w-full"
              >
                Go to Dashboard
              </Button>
              <Button 
                onClick={() => navigate(-1)} 
                variant="outline" 
                className="w-full"
              >
                Go Back
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // User is admin, render children
  return <>{children}</>;
}

import React from "react";
import { AdminGuard } from "./AdminGuard";
import { AdminDashboard } from "./AdminDashboard";

export function AdminPage() {
  return (
    <AdminGuard>
      <AdminDashboard />
    </AdminGuard>
  );
}

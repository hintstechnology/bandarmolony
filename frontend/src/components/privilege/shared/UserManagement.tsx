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
import { Label } from "../../ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { useToast } from "../../../contexts/ToastContext";
import { ConfirmationDialog } from "../../ui/confirmation-dialog";
import { 
  Search, 
  Mail,
  Loader2,
  AlertCircle,
  UserPlus,
  Eye,
  EyeOff,
  ChevronDown,
  Send,
  RefreshCw
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

interface AddUserFormData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: string;
}

interface AddUserFormData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: string;
}

interface UserManagementProps {
  apiPrefix: 'admin' | 'developer';
  onUserStatusChange?: () => void;
}

export function UserManagement({ apiPrefix, onUserStatusChange }: UserManagementProps) {
  const { showToast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [limit] = useState(20); // Number of users to load per batch
  const [offset, setOffset] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  // Add user form state
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [addUserMethod, setAddUserMethod] = useState<'invite' | 'create'>('invite');
  const [addUserLoading, setAddUserLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [addUserFormData, setAddUserFormData] = useState<AddUserFormData>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'user'
  });
  const [addUserErrors, setAddUserErrors] = useState<{[key: string]: string}>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPasswordError, setAdminPasswordError] = useState('');
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    type: 'suspend' | 'reinvite' | 'delete' | 'addUser';
    userId?: string;
    userEmail?: string;
    currentStatus?: boolean;
  } | null>(null);
  const [confirmationDialog, setConfirmationDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({
    open: false,
    title: '',
    description: '',
    onConfirm: () => {},
  });

  const loadUsers = async (reset: boolean = false) => {
    if (reset) {
      setLoading(true);
      setUsers([]);
      setOffset(0);
      setHasMore(true);
    } else {
      setLoadingMore(true);
    }
    setError(null);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const currentOffset = reset ? 0 : offset;
      
      const response = await fetch(
        `${API_URL}/api/${apiPrefix}/users?page=${Math.floor(currentOffset / limit) + 1}&limit=${limit}`,
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
        
        if (reset) {
          setUsers(normalizedUsers);
        } else {
          setUsers(prev => [...prev, ...normalizedUsers]);
        }
        
        // Check if there are more users to load
        const total = json.data.pagination?.total || 0;
        const newOffset = currentOffset + normalizedUsers.length;
        setOffset(newOffset);
        setHasMore(newOffset < total);
      }

    } catch (err) {
      console.error('Error loading users:', err);
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const bottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 100; // Load when 100px from bottom
    
    if (bottom && hasMore && !loadingMore && !loading) {
      loadUsers(false);
    }
  };


  const toggleUserStatus = async (userId: string, currentStatus: boolean, userEmail: string) => {
    // Show confirmation dialog first
    setConfirmationDialog({
      open: true,
      title: currentStatus ? 'Suspend User' : 'Activate User',
      description: `Are you sure you want to ${currentStatus ? 'suspend' : 'activate'} user ${userEmail}?`,
      onConfirm: () => {
        setPendingAction({
          type: 'suspend',
          userId,
          userEmail,
          currentStatus
        });
        setShowPasswordDialog(true);
        setAdminPassword('');
        setAdminPasswordError('');
      },
    });
  };

  const executeToggleUserStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`${API_URL}/api/${apiPrefix}/users/${userId}/suspend`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ 
          suspended: currentStatus,
          adminPassword: adminPassword
        })
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to update user status');
      }

      const result = await response.json();
      showToast({
        type: 'success',
        title: 'Status Updated',
        message: result.message || `User ${currentStatus ? 'suspended' : 'activated'} successfully`,
      });

      loadUsers(true);
      onUserStatusChange?.();
    } catch (err: any) {
      console.error('Error updating user status:', err);
      showToast({
        type: 'error',
        title: 'Error',
        message: err.message || 'Failed to update user status',
      });
      // If password error, show dialog again
      if (err.message?.includes('password') || err.message?.includes('Password')) {
        setShowPasswordDialog(true);
      }
    }
  };

  const deleteUser = async (userId: string, userEmail: string) => {
    // Show confirmation dialog first
    setConfirmationDialog({
      open: true,
      title: 'Delete User',
      description: `Are you sure you want to delete user ${userEmail}? This action cannot be undone.`,
      onConfirm: () => {
        setPendingAction({
          type: 'delete',
          userId,
          userEmail
        });
        setShowPasswordDialog(true);
        setAdminPassword('');
        setAdminPasswordError('');
      },
    });
  };

  const executeDeleteUser = async (userId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`${API_URL}/api/${apiPrefix}/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          adminPassword: adminPassword
        })
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to delete user');
      }

      showToast({
        type: 'success',
        title: 'User Deleted',
        message: 'User has been deleted successfully',
      });

      loadUsers(true);
      onUserStatusChange?.();
    } catch (err: any) {
      console.error('Error deleting user:', err);
      showToast({
        type: 'error',
        title: 'Error',
        message: err.message || 'Failed to delete user',
      });
      // If password error, show dialog again
      if (err.message?.includes('password') || err.message?.includes('Password')) {
        setShowPasswordDialog(true);
      }
    }
  };

  const reinviteUser = async (userId: string, userEmail: string) => {
    // Show confirmation dialog first
    setConfirmationDialog({
      open: true,
      title: 'Reinvite User',
      description: `Are you sure you want to reinvite user ${userEmail}?`,
      onConfirm: () => {
        setPendingAction({
          type: 'reinvite',
          userId,
          userEmail
        });
        setShowPasswordDialog(true);
        setAdminPassword('');
        setAdminPasswordError('');
      },
    });
  };

  const executeReinviteUser = async (userId: string, userEmail: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`${API_URL}/api/${apiPrefix}/users/${userId}/reinvite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          adminPassword: adminPassword
        })
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to resend invitation');
      }

      showToast({
        type: 'success',
        title: 'Invitation Sent',
        message: `Invitation email has been resent to ${userEmail}`,
      });

      loadUsers(true);
      onUserStatusChange?.();
    } catch (err: any) {
      console.error('Error resending invitation:', err);
      showToast({
        type: 'error',
        title: 'Error',
        message: err.message || 'Failed to resend invitation',
      });
      // If password error, show dialog again
      if (err.message?.includes('password') || err.message?.includes('Password')) {
        setShowPasswordDialog(true);
      }
    }
  };

  const validateAddUserForm = () => {
    const newErrors: {[key: string]: string} = {};

    // First name validation
    const firstName: string = addUserFormData['firstName'] || '';
    if (!firstName.trim()) {
      newErrors['firstName'] = 'First name is required';
    } else if (firstName.trim().length < 2) {
      newErrors['firstName'] = 'First name must be at least 2 characters';
    }

    // Last name validation
    const lastName: string = addUserFormData['lastName'] || '';
    if (!lastName.trim()) {
      newErrors['lastName'] = 'Last name is required';
    } else if (lastName.trim().length < 2) {
      newErrors['lastName'] = 'Last name must be at least 2 characters';
    }

    // Email validation
    const email: string = addUserFormData['email'] || '';
    if (!email.trim()) {
      newErrors['email'] = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors['email'] = 'Please enter a valid email address';
    }

    // Password validation (only if method is create)
    if (addUserMethod === 'create') {
      const password: string = addUserFormData['password'] || '';
      if (!password) {
        newErrors['password'] = 'Password is required';
      } else if (password.length < 6) {
        newErrors['password'] = 'Password must be at least 6 characters';
      } else if (password.length > 128) {
        newErrors['password'] = 'Password must be less than 128 characters';
      } else if (!/(?=.*[a-z])/.test(password)) {
        newErrors['password'] = 'Password must contain at least one lowercase letter';
      } else if (!/(?=.*[A-Z])/.test(password)) {
        newErrors['password'] = 'Password must contain at least one uppercase letter';
      } else if (!/(?=.*\d)/.test(password)) {
        newErrors['password'] = 'Password must contain at least one number';
      }

      // Confirm password validation
      const confirmPassword: string = addUserFormData['confirmPassword'] || '';
      if (!confirmPassword) {
        newErrors['confirmPassword'] = 'Please confirm your password';
      } else if (password !== confirmPassword) {
        newErrors['confirmPassword'] = 'Passwords do not match';
      }
    }

    setAddUserErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAddUserInputChange = (field: keyof AddUserFormData, value: string) => {
    setAddUserFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (addUserErrors[field]) {
      setAddUserErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleVerifyPassword = async () => {
    if (!adminPassword) {
      setAdminPasswordError('Password is required');
      return;
    }

    setVerifyingPassword(true);
    setAdminPasswordError('');
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`${API_URL}/api/${apiPrefix}/users/verify-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ password: adminPassword })
      });

      const result = await response.json();

      if (!response.ok) {
        const errorMessage = result.error || 'Invalid password';
        // Map backend error messages to user-friendly messages
        if (errorMessage.includes('Current password is incorrect') || errorMessage.includes('Invalid password')) {
          throw new Error('Password yang dimasukkan salah');
        }
        throw new Error(errorMessage);
      }

      if (result.ok) {
        // Password verified, proceed with the pending action
        setShowPasswordDialog(false);
        
        if (pendingAction) {
          if (pendingAction.type === 'addUser') {
            await submitAddUser();
          } else if (pendingAction.type === 'suspend' && pendingAction.userId !== undefined && pendingAction.currentStatus !== undefined) {
            await executeToggleUserStatus(pendingAction.userId, pendingAction.currentStatus);
          } else if (pendingAction.type === 'delete' && pendingAction.userId) {
            await executeDeleteUser(pendingAction.userId);
          } else if (pendingAction.type === 'reinvite' && pendingAction.userId && pendingAction.userEmail) {
            await executeReinviteUser(pendingAction.userId, pendingAction.userEmail);
          }
        }
        
        // Clear pending action and password
        setPendingAction(null);
        setAdminPassword('');
      }
    } catch (err: any) {
      console.error('Error verifying password:', err);
      setAdminPasswordError(err.message || 'Invalid password');
    } finally {
      setVerifyingPassword(false);
    }
  };

  const submitAddUser = async () => {
    setAddUserLoading(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`${API_URL}/api/${apiPrefix}/users/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          email: addUserFormData.email,
          full_name: `${addUserFormData.firstName} ${addUserFormData.lastName}`,
          password: addUserMethod === 'create' ? addUserFormData.password : undefined,
          role: addUserFormData.role,
          method: addUserMethod,
          adminPassword: adminPassword
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create user');
      }

      if (result.ok) {
        showToast({
          type: 'success',
          title: addUserMethod === 'invite' ? 'Invitation Sent!' : 'User Created!',
          message: result.message || (addUserMethod === 'invite' ? 'Invitation email has been sent successfully' : 'User has been created successfully'),
        });
        
        // Reset form
        setAddUserFormData({
          firstName: '',
          lastName: '',
          email: '',
          password: '',
          confirmPassword: '',
          role: 'user'
        });
        setAddUserMethod('invite');
        setShowAddUserForm(false);
        setAdminPassword('');
        setAdminPasswordError('');
        
        // Reload users
        loadUsers();
        onUserStatusChange?.();
      }
    } catch (err: any) {
      console.error('Error adding user:', err);
      showToast({
        type: 'error',
        title: 'Error',
        message: err.message || 'Failed to add user',
      });
      // If error, show password dialog again
      if (err.message?.includes('password') || err.message?.includes('Password')) {
        setShowPasswordDialog(true);
      }
    } finally {
      setAddUserLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateAddUserForm()) {
      showToast({
        type: 'error',
        title: 'Validation Error',
        message: 'Please fix the errors in the form',
      });
      return;
    }

    // Show password dialog first
    setPendingAction({
      type: 'addUser'
    });
    setShowPasswordDialog(true);
    setAdminPassword('');
    setAdminPasswordError('');
  };

  // Get current user ID on mount
  useEffect(() => {
    const getCurrentUserId = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        setCurrentUserId(session.user.id);
      }
    };
    getCurrentUserId();
  }, []);

  useEffect(() => {
    loadUsers(true);
  }, [search, roleFilter, statusFilter]);

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
    <div className="space-y-4">
      {/* Add New User Section */}
      <Card className="overflow-visible">
        <CardHeader className="pb-3 overflow-visible">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 overflow-visible">
            <div className="space-y-0.5">
              <CardTitle className="text-base sm:text-lg">Add New User</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Create a new user account or send an invitation
              </CardDescription>
            </div>
            {!showAddUserForm && (
              <div className="relative z-10 w-full sm:w-auto">
                <Button 
                  type="button"
                  className="w-full sm:w-auto"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowDropdown(!showDropdown);
                  }}
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add user
                  <ChevronDown className="w-4 h-4 ml-2" />
                </Button>
                {showDropdown && (
                  <>
                    <div 
                      className="fixed inset-0 z-[99]" 
                      onClick={() => setShowDropdown(false)}
                    />
                    <div className="absolute right-0 mt-2 z-[100] min-w-[200px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
                      <button
                        type="button"
                        className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowDropdown(false);
                          setAddUserMethod('invite');
                          setShowAddUserForm(true);
                        }}
                      >
                        <Mail className="w-4 h-4 mr-2" />
                        Send invitation
                      </button>
                      <button
                        type="button"
                        className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowDropdown(false);
                          setAddUserMethod('create');
                          setShowAddUserForm(true);
                        }}
                      >
                        <UserPlus className="w-4 h-4 mr-2" />
                        Create new user
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        {showAddUserForm && (
          <CardContent className="pt-0 pb-4">
            <form onSubmit={handleAddUser} className="space-y-4">
              <div className="flex items-start justify-between gap-3 pb-3 border-b">
                <div className="space-y-0.5">
                  <h3 className="text-sm sm:text-base font-semibold">
                    {addUserMethod === 'invite' ? 'Send Invitation' : 'Create New User'}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {addUserMethod === 'invite' 
                      ? 'Send an invitation email to the user' 
                      : 'Create a new user account with password'}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="flex-shrink-0"
                  onClick={() => {
                    setShowAddUserForm(false);
                    setAddUserFormData({
                      firstName: '',
                      lastName: '',
                      email: '',
                      password: '',
                      confirmPassword: '',
                      role: 'user'
                    });
                    setAddUserErrors({});
                  }}
                >
                  Cancel
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    type="text"
                    placeholder="John"
                    value={addUserFormData['firstName']}
                    onChange={(e) => handleAddUserInputChange('firstName', e.target.value)}
                  />
                  {addUserErrors['firstName'] && (
                    <p className="text-xs text-red-500 mt-1">{addUserErrors['firstName']}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    type="text"
                    placeholder="Doe"
                    value={addUserFormData['lastName']}
                    onChange={(e) => handleAddUserInputChange('lastName', e.target.value)}
                  />
                  {addUserErrors['lastName'] && (
                    <p className="text-xs text-red-500 mt-1">{addUserErrors['lastName']}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john.doe@example.com"
                  value={addUserFormData['email']}
                  onChange={(e) => handleAddUserInputChange('email', e.target.value)}
                />
                {addUserErrors['email'] && (
                  <p className="text-xs text-red-500 mt-1">{addUserErrors['email']}</p>
                )}
              </div>

              {addUserMethod === 'create' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Create a strong password"
                        value={addUserFormData['password']}
                        onChange={(e) => handleAddUserInputChange('password', e.target.value)}
                        className="pl-4 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {addUserErrors['password'] && (
                      <p className="text-xs text-red-500 mt-1">{addUserErrors['password']}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="Confirm your password"
                        value={addUserFormData['confirmPassword']}
                        onChange={(e) => handleAddUserInputChange('confirmPassword', e.target.value)}
                        className="pl-4 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {addUserErrors['confirmPassword'] && (
                      <p className="text-xs text-red-500 mt-1">{addUserErrors['confirmPassword']}</p>
                    )}
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select
                  value={addUserFormData.role}
                  onValueChange={(value) => handleAddUserInputChange('role', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    {apiPrefix === 'developer' && (
                      <SelectItem value="developer">Developer</SelectItem>
                    )}
                    {apiPrefix === 'admin' && (
                      <>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="developer">Developer</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <Button
                  type="submit"
                  disabled={addUserLoading}
                  className="flex-1 w-full sm:w-auto"
                  size="sm"
                >
                  {addUserLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {addUserMethod === 'invite' ? 'Sending...' : 'Creating...'}
                    </>
                  ) : (
                    <>
                      {addUserMethod === 'invite' ? (
                        <>
                          <Send className="w-4 h-4 mr-2" />
                          Send Invitation
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-4 h-4 mr-2" />
                          Create User
                        </>
                      )}
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  size="sm"
                  onClick={() => {
                    setShowAddUserForm(false);
                    setAddUserFormData({
                      firstName: '',
                      lastName: '',
                      email: '',
                      password: '',
                      confirmPassword: '',
                      role: 'user'
                    });
                    setAddUserErrors({});
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        )}
      </Card>

      {/* Password Confirmation Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Confirm Your Password</DialogTitle>
            <DialogDescription>
              Please enter your password to confirm this action. This is required for security purposes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="adminPassword">Your Password</Label>
              <div className="relative">
                <Input
                  id="adminPassword"
                  type={showAdminPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={adminPassword}
                  onChange={(e) => {
                    setAdminPassword(e.target.value);
                    setAdminPasswordError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !verifyingPassword) {
                      e.preventDefault();
                      handleVerifyPassword();
                    }
                  }}
                  className={adminPasswordError ? 'border-red-500 pl-4 pr-10' : 'pl-4 pr-10'}
                />
                <button
                  type="button"
                  onClick={() => setShowAdminPassword(!showAdminPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showAdminPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {adminPasswordError && (
                <p className="text-sm text-red-500">{adminPasswordError}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowPasswordDialog(false);
                setAdminPassword('');
                setAdminPasswordError('');
                setPendingAction(null);
              }}
              disabled={verifyingPassword}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleVerifyPassword}
              disabled={verifyingPassword || !adminPassword}
            >
              {verifyingPassword ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Confirm'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <CardTitle>User Management</CardTitle>
                <CardDescription>
                  Manage user accounts and permissions
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadUsers(true)}
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-2 mb-4">
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
                <SelectTrigger className="w-full sm:w-[140px]">
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
                <SelectTrigger className="w-full sm:w-[140px]">
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
                <div 
                  className="overflow-x-auto overflow-y-auto max-h-[600px]"
                  onScroll={handleScroll}
                >
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
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
                            {currentUserId === user.id ? (
                              <Badge variant="outline" className="text-xs">
                                Your account
                              </Badge>
                            ) : (
                              <div className="flex items-center gap-1 flex-nowrap">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => toggleUserStatus(user.id, user.is_active, user.email)}
                                  className={`h-7 px-2 text-xs whitespace-nowrap min-h-[28px] ${
                                    user.is_active 
                                      ? 'bg-yellow-500 hover:bg-yellow-600 text-white border-yellow-500 hover:border-yellow-600' 
                                      : 'bg-green-600 hover:bg-green-700 text-white border-green-600 hover:border-green-700'
                                  }`}
                                >
                                  {user.is_active ? 'Suspend' : 'Activate'}
                                </Button>
                                {!user.email_verified && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => reinviteUser(user.id, user.email)}
                                    className="h-7 px-2 text-xs whitespace-nowrap min-h-[28px]"
                                  >
                                    Reinvite
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => deleteUser(user.id, user.email)}
                                  className="h-7 px-2 text-xs whitespace-nowrap min-h-[28px] bg-red-600 hover:bg-red-700 text-white border-red-600 hover:border-red-700"
                                >
                                  Delete
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {loadingMore && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-4">
                            <div className="flex items-center justify-center gap-2">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span className="text-sm text-muted-foreground">Loading more users...</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                      {!hasMore && filteredUsers.length > 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-4">
                            <span className="text-sm text-muted-foreground">No more users to load</span>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <ConfirmationDialog
          open={confirmationDialog.open}
          onOpenChange={(open) => setConfirmationDialog({ ...confirmationDialog, open })}
          title={confirmationDialog.title}
          description={confirmationDialog.description}
          onConfirm={confirmationDialog.onConfirm}
          confirmText="Yes"
          cancelText="No"
        />
    </div>
  );
}

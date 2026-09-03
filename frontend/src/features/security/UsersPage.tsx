import React, { useEffect, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  DeleteOutlined,
  Edit,
  PersonAdd,
} from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';

import { apiClient } from '../../api/client';
import { Role, UserStatus } from '../../types';

export const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // User modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<UserStatus>('ACTIVE');
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchUsersAndRoles = async () => {
    setLoading(true);
    try {
      const [uRes, rRes] = await Promise.all([
        apiClient.get<{ items: any[]; total: number }>('/users'),
        apiClient.get<Role[]>('/roles'),
      ]);
      setUsers(uRes.data.items);
      setRoles(rRes.data);
    } catch (err) {
      console.error('Failed to load users/roles', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsersAndRoles();
  }, []);

  const handleOpenCreate = () => {
    setEditingUserId(null);
    setUsername('');
    setFullName('');
    setEmail('');
    setPassword('');
    setStatus('ACTIVE');
    setSelectedRoleIds([]);
    setError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: any) => {
    setEditingUserId(user.id);
    setUsername(user.username);
    setFullName(user.full_name);
    setEmail(user.email);
    setPassword('');
    setStatus(user.status);
    setSelectedRoleIds(user.roles?.map((r: any) => r.id) || []);
    setError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      if (editingUserId) {
        await apiClient.put(`/users/${editingUserId}`, {
          full_name: fullName.trim(),
          email: email.trim(),
          status,
          password: password ? password : undefined,
          role_ids: selectedRoleIds,
        });
      } else {
        await apiClient.post('/users', {
          username: username.trim(),
          full_name: fullName.trim(),
          email: email.trim(),
          password,
          status,
          role_ids: selectedRoleIds,
        });
      }
      setIsModalOpen(false);
      fetchUsersAndRoles();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save user.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      await apiClient.delete(`/users/${userId}`);
      fetchUsersAndRoles();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete user.');
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            User Management
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Manage authorized system users, passwords, and security status.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<PersonAdd />} onClick={handleOpenCreate}>
          Create User
        </Button>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
          <CircularProgress size={36} />
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Roles</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Last Login</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar sx={{ width: 34, height: 34, bgcolor: u.is_super_admin ? 'primary.main' : 'default' }}>
                        {u.full_name?.charAt(0) || 'U'}
                      </Avatar>
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                          {u.full_name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
                          @{u.username}
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {u.is_super_admin && <Chip label="SUPER ADMIN" size="small" color="primary" />}
                      {u.roles?.map((r: any) => (
                        <Chip key={r.id} label={r.display_name} size="small" variant="outlined" />
                      ))}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={u.status}
                      size="small"
                      color={u.status === 'ACTIVE' ? 'success' : u.status === 'LOCKED' ? 'warning' : 'error'}
                    />
                  </TableCell>
                  <TableCell>
                    {u.last_login_at
                      ? formatDistanceToNow(new Date(u.last_login_at), { addSuffix: true })
                      : 'Never'}
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="Edit User">
                      <IconButton size="small" onClick={() => handleOpenEdit(u)}>
                        <Edit fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {!u.is_super_admin && (
                      <Tooltip title="Delete User">
                        <IconButton size="small" color="error" onClick={() => handleDeleteUser(u.id)}>
                          <DeleteOutlined fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Create / Edit User Dialog */}
      <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          {editingUserId ? 'Edit User Account' : 'Create New User'}
        </DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent dividers>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <Grid container spacing={2}>
              {!editingUserId && (
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </Grid>
              )}
              <Grid size={{ xs: 12, sm: editingUserId ? 12 : 6 }}>
                <TextField
                  fullWidth
                  label="Full Name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth>
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={status}
                    label="Status"
                    onChange={(e) => setStatus(e.target.value as UserStatus)}
                  >
                    <MenuItem value="ACTIVE">ACTIVE</MenuItem>
                    <MenuItem value="DISABLED">DISABLED</MenuItem>
                    <MenuItem value="LOCKED">LOCKED</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={12}>
                <TextField
                  fullWidth
                  label={editingUserId ? 'Password (leave blank to keep unchanged)' : 'Password'}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required={!editingUserId}
                  helperText="Minimum 8 characters (Argon2id hashed)"
                />
              </Grid>
              <Grid size={12}>
                <FormControl fullWidth>
                  <InputLabel>Assign Roles</InputLabel>
                  <Select
                    multiple
                    value={selectedRoleIds}
                    label="Assign Roles"
                    onChange={(e) => setSelectedRoleIds(e.target.value as string[])}
                    renderValue={(selected) => (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {(selected as string[]).map((rId) => {
                          const r = roles.find((role) => role.id === rId);
                          return <Chip key={rId} label={r?.display_name || rId} size="small" />;
                        })}
                      </Box>
                    )}
                  >
                    {roles.map((r) => (
                      <MenuItem key={r.id} value={r.id}>
                        {r.display_name} ({r.name})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={saving}>
              {saving ? <CircularProgress size={20} /> : editingUserId ? 'Save Changes' : 'Create User'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
};

export default UsersPage;

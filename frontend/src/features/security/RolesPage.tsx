import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Paper,
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
import { Add, AdminPanelSettings, DeleteOutlined, Edit } from '@mui/icons-material';

import { apiClient } from '../../api/client';
import { Permission, Role } from '../../types';

export const RolesPage: React.FC = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchRolesAndPermissions = async () => {
    setLoading(true);
    try {
      const [rRes, pRes] = await Promise.all([
        apiClient.get<Role[]>('/roles'),
        apiClient.get<Permission[]>('/permissions'),
      ]);
      setRoles(rRes.data);
      setPermissions(pRes.data);
    } catch (err) {
      console.error('Failed to load roles and permissions', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRolesAndPermissions();
  }, []);

  const handleOpenCreate = () => {
    setEditingRoleId(null);
    setName('');
    setDisplayName('');
    setDescription('');
    setSelectedPermissionIds([]);
    setError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (role: Role) => {
    setEditingRoleId(role.id);
    setName(role.name);
    setDisplayName(role.display_name);
    setDescription(role.description || '');
    setSelectedPermissionIds(role.permissions?.map((p) => p.id) || []);
    setError(null);
    setIsModalOpen(true);
  };

  const handleTogglePermission = (pId: string) => {
    setSelectedPermissionIds((prev) =>
      prev.includes(pId) ? prev.filter((id) => id !== pId) : [...prev, pId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      if (editingRoleId) {
        await apiClient.put(`/roles/${editingRoleId}`, {
          display_name: displayName.trim(),
          description: description.trim() || null,
          permission_ids: selectedPermissionIds,
        });
      } else {
        await apiClient.post('/roles', {
          name: name.trim().toUpperCase(),
          display_name: displayName.trim(),
          description: description.trim() || null,
          permission_ids: selectedPermissionIds,
        });
      }
      setIsModalOpen(false);
      fetchRolesAndPermissions();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save role.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (!window.confirm('Are you sure you want to delete this role?')) return;
    try {
      await apiClient.delete(`/roles/${roleId}`);
      fetchRolesAndPermissions();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete role.');
    }
  };

  const permissionCategories = Array.from(new Set(permissions.map((p) => p.category)));

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            Roles & Access Control (RBAC)
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Configure enterprise role hierarchies and granular capability matrices.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={handleOpenCreate}>
          Create Custom Role
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
                <TableCell>Role Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Granted Permissions</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {roles.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <AdminPanelSettings color={r.is_system ? 'primary' : 'action'} />
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                          {r.display_name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
                          {r.name}
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={r.is_system ? 'SYSTEM DEFAULT' : 'CUSTOM'}
                      size="small"
                      color={r.is_system ? 'primary' : 'default'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>{r.description || 'No description'}</TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {r.permissions?.length || 0} permissions granted
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="Edit Role">
                      <IconButton size="small" onClick={() => handleOpenEdit(r)}>
                        <Edit fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {!r.is_system && (
                      <Tooltip title="Delete Role">
                        <IconButton size="small" color="error" onClick={() => handleDeleteRole(r.id)}>
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

      {/* Role Editor Modal */}
      <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          {editingRoleId ? 'Edit Role Permissions' : 'Create Custom Role'}
        </DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent dividers>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <Grid container spacing={2} sx={{ mb: 3 }}>
              {!editingRoleId && (
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Role Code Identifier"
                    placeholder="e.g. DATA_ANALYST"
                    value={name}
                    onChange={(e) => setName(e.target.value.toUpperCase())}
                    required
                  />
                </Grid>
              )}
              <Grid size={{ xs: 12, sm: editingRoleId ? 12 : 6 }}>
                <TextField
                  fullWidth
                  size="small"
                  label="Display Name"
                  placeholder="e.g. Data Analyst"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              </Grid>
              <Grid size={12}>
                <TextField
                  fullWidth
                  size="small"
                  label="Description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Grid>
            </Grid>

            <Divider sx={{ mb: 2 }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
              Assign Permissions Matrix
            </Typography>

            <Grid container spacing={2}>
              {permissionCategories.map((cat) => (
                <Grid size={{ xs: 12, sm: 6 }} key={cat}>
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'primary.main', mb: 1 }}>
                      {cat}
                    </Typography>
                    {permissions
                      .filter((p) => p.category === cat)
                      .map((p) => (
                        <Box key={p.id} sx={{ display: 'flex', alignItems: 'flex-start', mb: 0.5 }}>
                          <Checkbox
                            size="small"
                            checked={selectedPermissionIds.includes(p.id)}
                            onChange={() => handleTogglePermission(p.id)}
                          />
                          <Box sx={{ pt: 0.7 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                              {p.name}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                              {p.description}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={saving}>
              {saving ? <CircularProgress size={20} /> : 'Save Role Matrix'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
};

export default RolesPage;

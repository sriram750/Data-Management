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
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  AdminPanelSettingsOutlined,
  DeleteOutlined,
  GroupOutlined,
  PersonOutlined,
  SecurityOutlined,
} from '@mui/icons-material';

import { apiClient } from '../../api/client';
import { ColumnPermissionLevel, DataTable, Role, TablePermissionRule, UserInfo } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  table: DataTable;
}

export const TablePermissionsModal: React.FC<Props> = ({ open, onClose, table }) => {
  const [targetType, setTargetType] = useState<'ROLE' | 'USER'>('ROLE');

  // Available Roles & Users
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  // Existing configured rules for this table
  const [existingRules, setExistingRules] = useState<TablePermissionRule[]>([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Table Level Permissions
  const [canView, setCanView] = useState(true);
  const [canAdd, setCanAdd] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [canManageCols, setCanManageCols] = useState(false);
  const [canImport, setCanImport] = useState(false);
  const [canExport, setCanExport] = useState(false);

  // Column Level Permissions
  const [colPerms, setColPerms] = useState<Record<string, ColumnPermissionLevel>>({});

  useEffect(() => {
    if (open) {
      loadInitialData();
    }
  }, [open, table.id]);

  const loadInitialData = async () => {
    setLoading(true);
    setError(null);

    const [rolesOutcome, usersOutcome, rulesOutcome] = await Promise.allSettled([
      apiClient.get<Role[]>('/roles'),
      apiClient.get<{ items: UserInfo[] }>('/users?page=1&page_size=100'),
      apiClient.get<TablePermissionRule[]>(`/tables/${table.id}/permissions`),
    ]);

    let loadedRoles: Role[] = [];
    let loadedRules: TablePermissionRule[] = [];

    if (rolesOutcome.status === 'fulfilled') {
      loadedRoles = rolesOutcome.value.data || [];
      setRoles(loadedRoles);
      if (loadedRoles.length > 0) {
        setSelectedRoleId(loadedRoles[0].id);
      }
    } else {
      console.warn('Failed to load roles', rolesOutcome.reason);
    }

    if (usersOutcome.status === 'fulfilled') {
      const loadedUsers = usersOutcome.value.data?.items || [];
      setUsers(loadedUsers);
      if (loadedUsers.length > 0) {
        setSelectedUserId(loadedUsers[0].id);
      }
    } else {
      console.warn('Failed to load users', usersOutcome.reason);
    }

    if (rulesOutcome.status === 'fulfilled') {
      loadedRules = rulesOutcome.value.data || [];
      setExistingRules(loadedRules);
    } else {
      console.warn('Failed to load existing table rules', rulesOutcome.reason);
    }

    if (loadedRoles.length > 0) {
      applyExistingRule(loadedRules, 'ROLE', loadedRoles[0].id);
    }

    // Report error only if both roles and users failed
    if (rolesOutcome.status === 'rejected' && usersOutcome.status === 'rejected') {
      const reason =
        (rolesOutcome.reason as any)?.response?.data?.detail ||
        (usersOutcome.reason as any)?.response?.data?.detail ||
        'Insufficient permissions to view roles or users.';
      setError(`Failed to load access list: ${reason}`);
    }

    setLoading(false);
  };

  const applyExistingRule = (rules: TablePermissionRule[], type: 'ROLE' | 'USER', id: string) => {
    const match = rules.find((r) => (type === 'ROLE' ? r.role_id === id : r.user_id === id));
    if (match) {
      setCanView(match.can_view_records);
      setCanAdd(match.can_add_records);
      setCanEdit(match.can_edit_records);
      setCanDelete(match.can_delete_records);
      setCanManageCols(match.can_manage_columns);
      setCanImport(match.can_import);
      setCanExport(match.can_export);
    } else {
      // Default rule settings
      setCanView(true);
      setCanAdd(false);
      setCanEdit(false);
      setCanDelete(false);
      setCanManageCols(false);
      setCanImport(false);
      setCanExport(false);
    }
  };

  const handleRoleChange = (roleId: string) => {
    setSelectedRoleId(roleId);
    applyExistingRule(existingRules, 'ROLE', roleId);
  };

  const handleUserChange = (userId: string) => {
    setSelectedUserId(userId);
    applyExistingRule(existingRules, 'USER', userId);
  };

  const handleTargetTypeToggle = (_: any, newType: 'ROLE' | 'USER' | null) => {
    if (!newType) return;
    setTargetType(newType);
    if (newType === 'ROLE' && selectedRoleId) {
      applyExistingRule(existingRules, 'ROLE', selectedRoleId);
    } else if (newType === 'USER' && selectedUserId) {
      applyExistingRule(existingRules, 'USER', selectedUserId);
    }
  };

  const handleSave = async () => {
    const targetId = targetType === 'ROLE' ? selectedRoleId : selectedUserId;
    if (!targetId) {
      setError(`Please select a ${targetType === 'ROLE' ? 'role' : 'user'} to configure.`);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      // 1. Save Table Permission (Role or User)
      const payload: any = {
        can_view_records: canView,
        can_add_records: canAdd,
        can_edit_records: canEdit,
        can_delete_records: canDelete,
        can_manage_columns: canManageCols,
        can_manage_permissions: false,
        can_import: canImport,
        can_export: canExport,
      };

      if (targetType === 'ROLE') {
        payload.role_id = selectedRoleId;
      } else {
        payload.user_id = selectedUserId;
      }

      await apiClient.post(`/tables/${table.id}/permissions`, payload);

      // 2. Save Column Permissions (if configuring by Role)
      if (targetType === 'ROLE') {
        for (const [colId, permLevel] of Object.entries(colPerms)) {
          await apiClient.post(`/columns/${colId}/permissions`, {
            role_id: selectedRoleId,
            permission_level: permLevel,
          });
        }
      }

      // 3. Refresh list of active rules
      const rulesRes = await apiClient.get<TablePermissionRule[]>(`/tables/${table.id}/permissions`);
      setExistingRules(rulesRes.data || []);

      setSuccess(`Access permissions successfully applied for ${targetType === 'ROLE' ? 'role' : 'user'}!`);
      setTimeout(() => {
        setSuccess(null);
      }, 3000);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update table permissions.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async (permId: string) => {
    try {
      await apiClient.delete(`/tables/${table.id}/permissions/${permId}`);
      const rulesRes = await apiClient.get<TablePermissionRule[]>(`/tables/${table.id}/permissions`);
      setExistingRules(rulesRes.data || []);
      setSuccess('Permission rule removed. Reverted to default access.');
      setTimeout(() => setSuccess(null), 2500);
    } catch (err: any) {
      setError('Failed to remove permission rule: ' + (err.response?.data?.detail || err.message));
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
        <AdminPanelSettingsOutlined color="primary" sx={{ fontSize: 28 }} />
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
            Manage Access Control & Permissions
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Table: <strong>{table.display_name}</strong> (#{table.name})
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent dividers sx={{ pt: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
            {success}
          </Alert>
        )}

        {/* Informational Guidance Box */}
        <Box
          sx={{
            p: 1.5,
            mb: 2.5,
            borderRadius: 2,
            bgcolor: 'primary.lighter',
            border: '1px solid',
            borderColor: 'primary.light',
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <SecurityOutlined color="primary" />
          <Typography variant="body2" sx={{ color: 'text.primary', fontSize: '0.82rem' }}>
            <strong>How Table Access Control works:</strong> Restrict this table so only authorized roles or specific users can view or edit records. If a user does not have <em>View Records</em> permission, this table will be completely hidden from their navigation.
          </Typography>
        </Box>

        {/* Target Switch: By Role vs By Specific User */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Step 1: Choose Permission Scope
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Assign access by user role or directly to individual users
            </Typography>
          </Box>

          <ToggleButtonGroup
            value={targetType}
            exclusive
            onChange={handleTargetTypeToggle}
            size="small"
            color="primary"
          >
            <ToggleButton value="ROLE" sx={{ px: 2, fontWeight: 700, gap: 1 }}>
              <GroupOutlined fontSize="small" /> By Role
            </ToggleButton>
            <ToggleButton value="USER" sx={{ px: 2, fontWeight: 700, gap: 1 }}>
              <PersonOutlined fontSize="small" /> By Specific User
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Selector based on targetType */}
        <Box sx={{ mb: 3 }}>
          {targetType === 'ROLE' ? (
            <FormControl fullWidth size="small">
              <InputLabel>Select Role to Configure</InputLabel>
              <Select
                value={selectedRoleId}
                label="Select Role to Configure"
                onChange={(e) => handleRoleChange(e.target.value)}
              >
                {roles.map((r) => (
                  <MenuItem key={r.id} value={r.id}>
                    {r.display_name} ({r.name})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : (
            <FormControl fullWidth size="small">
              <InputLabel>Select Specific User to Configure</InputLabel>
              <Select
                value={selectedUserId}
                label="Select Specific User to Configure"
                onChange={(e) => handleUserChange(e.target.value)}
              >
                {users.map((u) => (
                  <MenuItem key={u.id} value={u.id}>
                    {u.full_name || u.username} (@{u.username}) &bull; {u.email}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Box>

        <Divider sx={{ mb: 2.5 }} />

        {/* Section 1: Table Level Permissions */}
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          Step 2: Table-Level Capabilities for Selected {targetType === 'ROLE' ? 'Role' : 'User'}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5 }}>
          Unchecking <strong>View Records</strong> completely hides this table from the selected {targetType === 'ROLE' ? 'role' : 'user'}.
        </Typography>

        <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 2 }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', p: 0.5, bgcolor: canView ? 'action.selected' : 'transparent', borderRadius: 1.5 }}>
                <Checkbox checked={canView} onChange={(e) => setCanView(e.target.checked)} color="primary" />
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    View Records (Access Table)
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Required to see and open this table
                  </Typography>
                </Box>
              </Box>
            </Grid>

            <Grid size={{ xs: 6, sm: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Checkbox checked={canAdd} onChange={(e) => setCanAdd(e.target.checked)} disabled={!canView} />
                <Typography variant="body2">Add Rows</Typography>
              </Box>
            </Grid>

            <Grid size={{ xs: 6, sm: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Checkbox checked={canEdit} onChange={(e) => setCanEdit(e.target.checked)} disabled={!canView} />
                <Typography variant="body2">Edit Rows</Typography>
              </Box>
            </Grid>

            <Grid size={{ xs: 6, sm: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Checkbox checked={canDelete} onChange={(e) => setCanDelete(e.target.checked)} disabled={!canView} />
                <Typography variant="body2">Delete Rows</Typography>
              </Box>
            </Grid>

            <Grid size={{ xs: 6, sm: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Checkbox checked={canManageCols} onChange={(e) => setCanManageCols(e.target.checked)} disabled={!canView} />
                <Typography variant="body2">Manage Columns</Typography>
              </Box>
            </Grid>

            <Grid size={{ xs: 6, sm: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Checkbox checked={canImport} onChange={(e) => setCanImport(e.target.checked)} disabled={!canView} />
                <Typography variant="body2">Import Excel</Typography>
              </Box>
            </Grid>

            <Grid size={{ xs: 6, sm: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Checkbox checked={canExport} onChange={(e) => setCanExport(e.target.checked)} disabled={!canView} />
                <Typography variant="body2">Export XLSX/CSV</Typography>
              </Box>
            </Grid>
          </Grid>
        </Paper>

        {/* Section 2: Column Level Permissions (Role Scope) */}
        {targetType === 'ROLE' && (
          <>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
              Step 3: Column-Level Field Protection for this Role
            </Typography>

            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, mb: 3 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Column Name</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Sensitivity</TableCell>
                    <TableCell>Access Level for this Role</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {table.columns.map((col) => {
                    const currentPerm = colPerms[col.id] || 'VIEW_EDIT';
                    return (
                      <TableRow key={col.id}>
                        <TableCell sx={{ fontWeight: 600 }}>{col.display_name}</TableCell>
                        <TableCell>
                          <Chip label={col.data_type} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell>
                          {col.is_sensitive && <Chip label="Sensitive/Secret" size="small" color="secondary" />}
                        </TableCell>
                        <TableCell>
                          <Select
                            size="small"
                            value={currentPerm}
                            onChange={(e) =>
                              setColPerms((prev) => ({ ...prev, [col.id]: e.target.value as ColumnPermissionLevel }))
                            }
                            sx={{ minWidth: 140 }}
                          >
                            <MenuItem value="VIEW_EDIT">Full Access (View + Edit)</MenuItem>
                            <MenuItem value="VIEW">Read Only (View)</MenuItem>
                            <MenuItem value="DENIED" sx={{ color: 'error.main' }}>
                              Denied (Hidden)
                            </MenuItem>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}

        {/* Section 3: Summary of Currently Configured Access Rules on this Table */}
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
            Active Access Rules on this Table ({existingRules.length})
          </Typography>
          {existingRules.length === 0 ? (
            <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
              No custom override rules configured yet. Default global RBAC rules apply.
            </Typography>
          ) : (
            <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Target</TableCell>
                    <TableCell>View</TableCell>
                    <TableCell>Add</TableCell>
                    <TableCell>Edit</TableCell>
                    <TableCell>Delete</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {existingRules.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell sx={{ fontWeight: 600 }}>
                        {r.role_id ? (
                          <Chip
                            icon={<GroupOutlined fontSize="small" />}
                            label={`Role: ${r.role_name || r.role_id}`}
                            size="small"
                            variant="outlined"
                            color="primary"
                          />
                        ) : (
                          <Chip
                            icon={<PersonOutlined fontSize="small" />}
                            label={`User: @${r.username || r.user_id}`}
                            size="small"
                            variant="outlined"
                            color="secondary"
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={r.can_view_records ? 'Allowed' : 'Denied'}
                          color={r.can_view_records ? 'success' : 'error'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{r.can_add_records ? 'Yes' : 'No'}</TableCell>
                      <TableCell>{r.can_edit_records ? 'Yes' : 'No'}</TableCell>
                      <TableCell>{r.can_delete_records ? 'Yes' : 'No'}</TableCell>
                      <TableCell>
                        <Tooltip title="Remove rule & revert to default">
                          <IconButton size="small" color="error" onClick={() => handleDeleteRule(r.id)}>
                            <DeleteOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
        <Button onClick={onClose} color="inherit">
          Close
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || loading}
          startIcon={saving ? <CircularProgress size={16} /> : <AdminPanelSettingsOutlined />}
        >
          {saving ? 'Saving...' : `Save ${targetType === 'ROLE' ? 'Role' : 'User'} Permissions`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TablePermissionsModal;

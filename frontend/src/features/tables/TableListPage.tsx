import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Paper,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  AddCircleOutlined,
  AdminPanelSettingsOutlined,
  DeleteForeverOutlined,
  DeleteOutlined,
  FileUploadOutlined,
  HistoryOutlined,
  KeyOutlined,
  LockOutlined,
  LockOpenOutlined,
  PublicOutlined,
  RestoreFromTrashOutlined,
  Search,
  SecurityOutlined,
  Star,
  StarBorder,
  TableChartOutlined,
  TableView,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';

import { apiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { DataTable, DeletedRecordItem, TableListResponse } from '../../types';
import TablePermissionsModal from './TablePermissionsModal';

export const TableListPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const isFavoriteFilter = location.search.includes('favorites=true');

  const [currentTab, setCurrentTab] = useState(0); // 0: Active Tables, 1: Trash Tables, 2: Deleted Records

  const [tables, setTables] = useState<DataTable[]>([]);
  const [trashTables, setTrashTables] = useState<DataTable[]>([]);
  const [deletedRecords, setDeletedRecords] = useState<DeletedRecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Delete / Trash Dialogs
  const [deleteTableId, setDeleteTableId] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Permanent Delete Dialog
  const [permDeleteTableId, setPermDeleteTableId] = useState<string | null>(null);
  const [permDeleteConfirmText, setPermDeleteConfirmText] = useState('');

  // Action status messages
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Table Permissions Modal State
  const [permissionsTable, setPermissionsTable] = useState<DataTable | null>(null);

  // Table Security / Lock Modal State
  const [securityTable, setSecurityTable] = useState<DataTable | null>(null);
  const [securityIsPrivate, setSecurityIsPrivate] = useState(false);
  const [securityIsLocked, setSecurityIsLocked] = useState(false);
  const [securityPassword, setSecurityPassword] = useState('');
  const [securityCurrentPassword, setSecurityCurrentPassword] = useState('');
  const [showSecurityPassword, setShowSecurityPassword] = useState(false);
  const [showSecurityCurrentPassword, setShowSecurityCurrentPassword] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [securitySaving, setSecuritySaving] = useState(false);

  // Table Unlock Modal State (Prompt when opening locked table)
  const [unlockTable, setUnlockTable] = useState<DataTable | null>(null);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [showUnlockPassword, setShowUnlockPassword] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const fetchActiveTables = async () => {
    try {
      const res = await apiClient.get<TableListResponse>('/tables', {
        params: {
          search: search || undefined,
          only_favorites: isFavoriteFilter || undefined,
        },
      });
      setTables(res.data.items);
    } catch (e) {
      console.error('Failed to load tables', e);
    }
  };

  const fetchTrashTables = async () => {
    try {
      const res = await apiClient.get<TableListResponse>('/tables/trash', {
        params: { search: search || undefined },
      });
      setTrashTables(res.data.items);
    } catch (e) {
      console.error('Failed to load trash tables', e);
    }
  };

  const fetchDeletedRecords = async () => {
    try {
      const res = await apiClient.get<DeletedRecordItem[]>('/records/all-deleted');
      setDeletedRecords(res.data);
    } catch (e) {
      console.error('Failed to load deleted records', e);
    }
  };

  const fetchAllData = async () => {
    setLoading(true);
    await Promise.all([fetchActiveTables(), fetchTrashTables(), fetchDeletedRecords()]);
    setLoading(false);
  };

  useEffect(() => {
    fetchAllData();
  }, [location.search, search, currentTab]);

  const handleToggleFavorite = async (e: React.MouseEvent, table: DataTable) => {
    e.stopPropagation();
    try {
      await apiClient.put(`/tables/${table.id}`, {
        is_favorite: !table.is_favorite,
      });
      setTables((prev) =>
        prev.map((t) => (t.id === table.id ? { ...t, is_favorite: !t.is_favorite } : t))
      );
    } catch (err) {
      console.error('Failed to toggle favorite', err);
    }
  };

  // Move table to trash (soft delete)
  const handleMoveToTrash = async () => {
    if (!deleteTableId) return;
    setIsDeleting(true);
    try {
      await apiClient.delete(`/tables/${deleteTableId}`);
      setActionSuccess('Table moved to Trash.');
      setDeleteTableId(null);
      setDeleteConfirmText('');
      await fetchAllData();
    } catch (err: any) {
      setActionError(err.response?.data?.detail || 'Failed to move table to trash.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Restore table from trash
  const handleRestoreTable = async (tableId: string) => {
    try {
      await apiClient.post(`/tables/${tableId}/restore`, {});
      setActionSuccess('Table restored to Active list successfully!');
      await fetchAllData();
    } catch (err: any) {
      setActionError(err.response?.data?.detail || 'Failed to restore table.');
    }
  };

  // Permanently delete table
  const handlePermanentDeleteTable = async () => {
    if (!permDeleteTableId) return;
    setIsDeleting(true);
    try {
      await apiClient.delete(`/tables/${permDeleteTableId}/permanent`);
      setActionSuccess('Table permanently deleted from database.');
      setPermDeleteTableId(null);
      setPermDeleteConfirmText('');
      await fetchAllData();
    } catch (err: any) {
      setActionError(err.response?.data?.detail || 'Failed to permanently delete table.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Restore deleted record
  const handleRestoreRecord = async (tableId: string, recordId: string) => {
    try {
      await apiClient.post(`/tables/${tableId}/records/${recordId}/restore-deleted`, {});
      setActionSuccess('Record restored to active grid successfully!');
      await fetchAllData();
    } catch (err: any) {
      setActionError(err.response?.data?.detail || 'Failed to restore record.');
    }
  };

  // Open Security & Lock settings modal
  const handleOpenSecurity = (e: React.MouseEvent, table: DataTable) => {
    e.stopPropagation();
    setSecurityTable(table);
    setSecurityIsPrivate(table.is_private);
    setSecurityIsLocked(table.is_locked || table.has_password);
    setSecurityPassword('');
    setSecurityCurrentPassword('');
    setShowSecurityPassword(false);
    setShowSecurityCurrentPassword(false);
    setSecurityError(null);
  };

  // Save Security & Lock settings
  const handleSaveSecurity = async () => {
    if (!securityTable) return;
    setSecuritySaving(true);
    setSecurityError(null);
    try {
      const res = await apiClient.put<DataTable>(`/tables/${securityTable.id}/lock`, {
        is_private: securityIsPrivate,
        is_locked: securityIsLocked,
        password: securityPassword.trim() ? securityPassword.trim() : (securityIsLocked ? undefined : ''),
        current_password: securityCurrentPassword.trim() || undefined,
      });
      setTables((prev) => prev.map((t) => (t.id === securityTable.id ? res.data : t)));
      setActionSuccess(`Security settings for "${securityTable.display_name}" updated successfully.`);
      setSecurityTable(null);
    } catch (err: any) {
      setSecurityError(err.response?.data?.detail || 'Failed to update table security settings.');
    } finally {
      setSecuritySaving(false);
    }
  };

  // Card click with Lock check (even Super Admin must enter password)
  const handleCardClick = (table: DataTable) => {
    const isUnlocked = sessionStorage.getItem(`table_unlocked_${table.id}`);
    if ((table.is_locked || table.has_password) && !isUnlocked) {
      setUnlockTable(table);
      setUnlockPassword('');
      setUnlockError(null);
      return;
    }
    navigate(`/tables/${table.id}`);
  };

  // Unlock table with password
  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockTable) return;
    setUnlocking(true);
    setUnlockError(null);
    try {
      await apiClient.post(`/tables/${unlockTable.id}/unlock`, {
        password: unlockPassword,
      });
      sessionStorage.setItem(`table_unlocked_${unlockTable.id}`, unlockPassword);
      const targetId = unlockTable.id;
      setUnlockTable(null);
      navigate(`/tables/${targetId}`);
    } catch (err: any) {
      setUnlockError(err.response?.data?.detail || 'Incorrect password.');
    } finally {
      setUnlocking(false);
    }
  };

  // Permanently delete record
  const handlePermanentDeleteRecord = async (tableId: string, recordId: string) => {
    if (!window.confirm('Permanently delete this record? This cannot be undone.')) return;
    try {
      await apiClient.delete(`/tables/${tableId}/records/${recordId}/permanent`);
      setActionSuccess('Record permanently deleted.');
      await fetchAllData();
    } catch (err: any) {
      setActionError(err.response?.data?.detail || 'Failed to delete record.');
    }
  };

  const selectedTableToDelete = tables.find((t) => t.id === deleteTableId);
  const selectedTrashTableToDelete = trashTables.find((t) => t.id === permDeleteTableId);

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {isFavoriteFilter ? 'Favorite Tables' : 'Dynamic Tables'}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Centralized dynamic spreadsheets with granular access control, audit trails, and Recycle Bin.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button
            variant="outlined"
            startIcon={<FileUploadOutlined />}
            onClick={() => navigate('/imports/wizard')}
          >
            Import Excel
          </Button>
          <Button
            variant="contained"
            startIcon={<AddCircleOutlined />}
            onClick={() => navigate('/tables/create')}
          >
            Create Table
          </Button>
        </Box>
      </Box>

      {/* Notifications */}
      {actionSuccess && (
        <Alert severity="success" sx={{ mb: 2.5 }} onClose={() => setActionSuccess(null)}>
          {actionSuccess}
        </Alert>
      )}
      {actionError && (
        <Alert severity="error" sx={{ mb: 2.5 }} onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      {/* Section Tabs: Active Tables | Trash Tables | Deleted Records */}
      <Paper sx={{ mb: 3, borderRadius: 2 }}>
        <Tabs
          value={currentTab}
          onChange={(_, val) => setCurrentTab(val)}
          indicatorColor="primary"
          textColor="primary"
          sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
        >
          <Tab
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TableChartOutlined fontSize="small" />
                <span>Active Tables</span>
                <Chip label={tables.length} size="small" color="primary" sx={{ height: 20, fontSize: '0.72rem' }} />
              </Box>
            }
          />
          <Tab
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <DeleteOutlined fontSize="small" />
                <span>Trash Tables</span>
                {trashTables.length > 0 && (
                  <Chip label={trashTables.length} size="small" color="error" sx={{ height: 20, fontSize: '0.72rem' }} />
                )}
              </Box>
            }
          />
          <Tab
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <HistoryOutlined fontSize="small" />
                <span>Deleted Records Log</span>
                {deletedRecords.length > 0 && (
                  <Chip label={deletedRecords.length} size="small" color="warning" sx={{ height: 20, fontSize: '0.72rem' }} />
                )}
              </Box>
            }
          />
        </Tabs>

        {/* Search Bar for Tables */}
        {currentTab !== 2 && (
          <Box sx={{ p: 2 }}>
            <TextField
              fullWidth
              size="small"
              placeholder={currentTab === 0 ? "Search active tables..." : "Search trash tables..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
            />
          </Box>
        )}
      </Paper>

      {/* TAB 0: ACTIVE TABLES */}
      {currentTab === 0 && (
        <>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
              <CircularProgress size={36} />
            </Box>
          ) : tables.length === 0 ? (
            <Paper
              sx={{
                p: 6,
                textAlign: 'center',
                borderRadius: 3,
                bgcolor: 'background.default',
                borderStyle: 'dashed',
              }}
            >
              <TableView sx={{ fontSize: 56, color: 'text.secondary', opacity: 0.4, mb: 2 }} />
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {isFavoriteFilter ? 'No favorite tables found.' : 'No active tables found.'}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 450, mx: 'auto', mt: 1, mb: 3 }}>
                Start by importing an Excel file (.xlsx) or construct a new table schema from scratch.
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
                <Button
                  variant="contained"
                  startIcon={<FileUploadOutlined />}
                  onClick={() => navigate('/imports/wizard')}
                >
                  Import Excel
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<AddCircleOutlined />}
                  onClick={() => navigate('/tables/create')}
                >
                  Create Table
                </Button>
              </Box>
            </Paper>
          ) : (
            <Grid container spacing={2.5}>
              {tables.map((table) => (
                <Grid size={{ xs: 12, sm: 6, md: 4 }} key={table.id}>
                  <Card
                    sx={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      borderRadius: 3,
                      cursor: 'pointer',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                      '&:hover': {
                        transform: 'translateY(-3px)',
                        boxShadow: '0 12px 30px rgba(0,0,0,0.2)',
                      },
                    }}
                    onClick={() => handleCardClick(table)}
                  >
                    <Box
                      sx={{ flexGrow: 1, p: 2.5, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', mb: 1.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, flexWrap: 'wrap' }}>
                          <Chip
                            icon={<TableChartOutlined sx={{ fontSize: '0.9rem !important' }} />}
                            label={`${table.columns?.length || 0} Cols`}
                            size="small"
                            color="primary"
                            variant="outlined"
                          />
                          {table.is_private && (
                            <Tooltip title="Private Table: Only the creator and Super Admins can access">
                              <Chip
                                icon={<LockOutlined sx={{ fontSize: '0.85rem !important' }} />}
                                label="Private"
                                size="small"
                                color="secondary"
                                sx={{ fontWeight: 700, fontSize: '0.72rem' }}
                              />
                            </Tooltip>
                          )}
                          {(table.is_locked || table.has_password) && (
                            <Tooltip title="Password Protected: Password required to view records">
                              <Chip
                                icon={<KeyOutlined sx={{ fontSize: '0.85rem !important' }} />}
                                label="Locked"
                                size="small"
                                color="warning"
                                sx={{ fontWeight: 700, fontSize: '0.72rem' }}
                              />
                            </Tooltip>
                          )}
                          {!table.is_private && !table.is_locked && !table.has_password && (
                            <Chip
                              icon={<PublicOutlined sx={{ fontSize: '0.85rem !important' }} />}
                              label="Public"
                              size="small"
                              variant="outlined"
                              sx={{ fontSize: '0.72rem', opacity: 0.7 }}
                            />
                          )}
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Tooltip title={table.is_favorite ? 'Remove from favorites' : 'Add to favorites'}>
                            <IconButton
                              size="small"
                              onClick={(e) => handleToggleFavorite(e, table)}
                              color={table.is_favorite ? 'warning' : 'default'}
                            >
                              {table.is_favorite ? <Star fontSize="small" /> : <StarBorder fontSize="small" />}
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Table Lock & Security Settings">
                            <IconButton
                              size="small"
                              onClick={(e) => handleOpenSecurity(e, table)}
                              sx={{
                                color: table.is_private ? 'secondary.main' : table.is_locked ? 'warning.main' : 'text.secondary',
                                '&:hover': { color: 'primary.main' },
                              }}
                            >
                              <SecurityOutlined fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Manage Table Access & Permissions">
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPermissionsTable(table);
                              }}
                              sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
                            >
                              <AdminPanelSettingsOutlined fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Move Table to Trash">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmText('');
                                setDeleteTableId(table.id);
                              }}
                              sx={{ opacity: 0.85, '&:hover': { opacity: 1, color: 'error.main' } }}
                            >
                              <DeleteOutlined fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </Box>

                      <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5, lineHeight: 1.3 }}>
                        {table.display_name}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5, fontFamily: 'monospace' }}>
                        #{table.name}
                      </Typography>

                      <Typography
                        variant="body2"
                        sx={{
                          color: 'text.secondary',
                          mb: 2,
                          flexGrow: 1,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {table.description || 'No description provided.'}
                      </Typography>

                      <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', pt: 1.5, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.primary' }}>
                          {table.record_count} Active Records
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {formatDistanceToNow(new Date(table.created_at), { addSuffix: true })}
                        </Typography>
                      </Box>
                    </Box>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </>
      )}

      {/* TAB 1: TRASH / DELETED TABLES */}
      {currentTab === 1 && (
        <>
          {trashTables.length === 0 ? (
            <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 3, borderStyle: 'dashed' }}>
              <DeleteOutlined sx={{ fontSize: 56, color: 'text.disabled', mb: 1.5 }} />
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Trash is Empty
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                No tables are currently in the trash. Soft-deleted tables will appear here and can be restored anytime.
              </Typography>
            </Paper>
          ) : (
            <Grid container spacing={2.5}>
              {trashTables.map((table) => (
                <Grid size={{ xs: 12, sm: 6, md: 4 }} key={table.id}>
                  <Card
                    sx={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      borderRadius: 3,
                      border: '1px dashed',
                      borderColor: 'error.main',
                      bgcolor: 'rgba(239, 68, 68, 0.03)',
                    }}
                  >
                    <Box sx={{ flexGrow: 1, p: 2.5, display: 'flex', flexDirection: 'column' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', mb: 1.5 }}>
                        <Chip
                          label="In Trash"
                          size="small"
                          color="error"
                          variant="outlined"
                          sx={{ fontWeight: 700 }}
                        />
                        <Chip
                          label={`${table.columns?.length || 0} Columns`}
                          size="small"
                          variant="outlined"
                        />
                      </Box>

                      <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
                        {table.display_name}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5, fontFamily: 'monospace' }}>
                        #{table.name}
                      </Typography>

                      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, flexGrow: 1 }}>
                        {table.description || 'No description provided.'}
                      </Typography>

                      <Divider sx={{ my: 1.5 }} />

                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                        <Button
                          size="small"
                          variant="contained"
                          color="primary"
                          startIcon={<RestoreFromTrashOutlined />}
                          onClick={() => handleRestoreTable(table.id)}
                          sx={{ textTransform: 'none', fontWeight: 700 }}
                        >
                          Restore Table
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          startIcon={<DeleteForeverOutlined />}
                          onClick={() => {
                            setPermDeleteConfirmText('');
                            setPermDeleteTableId(table.id);
                          }}
                          sx={{ textTransform: 'none' }}
                        >
                          Delete Forever
                        </Button>
                      </Box>
                    </Box>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </>
      )}

      {/* TAB 2: DELETED RECORDS AUDIT LOG */}
      {currentTab === 2 && (
        <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
          {deletedRecords.length === 0 ? (
            <Box sx={{ p: 6, textAlign: 'center' }}>
              <DeleteOutlined sx={{ fontSize: 56, color: 'text.disabled', mb: 1.5 }} />
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                No Deleted Records Found
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                When users delete individual or bulk records from any table, they are logged here with full restoration capabilities.
              </Typography>
            </Box>
          ) : (
            <TableContainer sx={{ maxHeight: 520 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Table Name</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Data Snapshot Preview</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Deleted By</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Deleted At</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {deletedRecords.map((rec, idx) => (
                    <TableRow key={rec.id} hover>
                      <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{idx + 1}</TableCell>
                      <TableCell>
                        <Chip
                          label={rec.table_display_name || rec.table_name || 'Table'}
                          size="small"
                          color="primary"
                          variant="outlined"
                          sx={{ fontWeight: 600 }}
                        />
                      </TableCell>
                      <TableCell sx={{ maxWidth: 300 }}>
                        <Box sx={{ display: 'flex', gap: 0.8, flexWrap: 'wrap' }}>
                          {Object.entries(rec.data_snapshot || {})
                            .slice(0, 3)
                            .map(([k, v]) => (
                              <Chip
                                key={k}
                                label={`${k}: ${String(v)}`}
                                size="small"
                                sx={{ fontSize: '0.72rem', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}
                              />
                            ))}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>
                          {rec.deleted_by_name || 'Administrator'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {new Date(rec.deleted_at).toLocaleString()}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                          <Button
                            size="small"
                            variant="contained"
                            color="primary"
                            startIcon={<RestoreFromTrashOutlined />}
                            onClick={() => handleRestoreRecord(rec.table_id, rec.record_id)}
                            sx={{ textTransform: 'none', fontWeight: 600, py: 0.3 }}
                          >
                            Restore
                          </Button>
                          <Tooltip title="Delete Permanently">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handlePermanentDeleteRecord(rec.table_id, rec.record_id)}
                            >
                              <DeleteForeverOutlined fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      )}

      {/* Move to Trash Confirmation Dialog */}
      <Dialog open={Boolean(deleteTableId)} onClose={() => setDeleteTableId(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, color: 'error.main' }}>Move Table to Trash?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Moving table <strong>{selectedTableToDelete?.display_name}</strong> to the Trash will hide it from the active list. You can restore it anytime from the <strong>Trash Tables</strong> tab.
          </DialogContentText>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
            Type <strong>DELETE</strong> to confirm:
          </Typography>
          <TextField
            fullWidth
            size="small"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="DELETE"
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDeleteTableId(null)} disabled={isDeleting}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleMoveToTrash}
            disabled={deleteConfirmText !== 'DELETE' || isDeleting}
          >
            {isDeleting ? <CircularProgress size={20} /> : 'Move to Trash'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Permanent Delete Confirmation Dialog */}
      <Dialog open={Boolean(permDeleteTableId)} onClose={() => setPermDeleteTableId(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, color: 'error.main' }}>Permanently Delete Table?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            This action is <strong>completely irreversible</strong>. Table{' '}
            <strong>{selectedTrashTableToDelete?.display_name}</strong> and all of its records will be permanently erased.
          </DialogContentText>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
            Type <strong>PERMANENT</strong> to confirm:
          </Typography>
          <TextField
            fullWidth
            size="small"
            value={permDeleteConfirmText}
            onChange={(e) => setPermDeleteConfirmText(e.target.value)}
            placeholder="PERMANENT"
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setPermDeleteTableId(null)} disabled={isDeleting}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handlePermanentDeleteTable}
            disabled={permDeleteConfirmText !== 'PERMANENT' || isDeleting}
          >
            {isDeleting ? <CircularProgress size={20} /> : 'Delete Permanently'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Table Permissions Modal */}
      {permissionsTable && (
        <TablePermissionsModal
          open={Boolean(permissionsTable)}
          onClose={() => setPermissionsTable(null)}
          table={permissionsTable}
        />
      )}

      {/* Table Security & Lock Settings Modal */}
      {securityTable && (
        <Dialog
          open={Boolean(securityTable)}
          onClose={() => setSecurityTable(null)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
            <SecurityOutlined color="primary" /> Security & Access Locks: {securityTable.display_name}
          </DialogTitle>
          <DialogContent dividers>
            {securityError && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSecurityError(null)}>
                {securityError}
              </Alert>
            )}

            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
              Control who can see this table and require a password to access records.
            </Typography>

            {/* Visibility Toggle */}
            <Paper
              variant="outlined"
              sx={{
                p: 2.5,
                mb: 2.5,
                borderRadius: 2,
                bgcolor: securityIsPrivate ? 'rgba(124, 77, 255, 0.05)' : 'background.paper',
                borderColor: securityIsPrivate ? 'secondary.main' : 'divider',
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {securityIsPrivate ? <LockOutlined color="secondary" /> : <LockOpenOutlined color="action" />}
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {securityIsPrivate ? 'Private Table (Strictly Restricted)' : 'Public Table (Standard RBAC)'}
                  </Typography>
                </Box>
                <Switch
                  checked={securityIsPrivate}
                  onChange={(e) => setSecurityIsPrivate(e.target.checked)}
                  color="secondary"
                />
              </Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                {securityIsPrivate
                  ? '🔒 Only the table creator and Super Administrators can view or access this table. Other users and roles will NOT see this table at all.'
                  : '🌐 Standard role permissions control who can view and edit this table.'}
              </Typography>
            </Paper>

            {/* Password Protection */}
            <Paper
              variant="outlined"
              sx={{
                p: 2.5,
                borderRadius: 2,
                bgcolor: securityIsLocked ? 'rgba(255, 152, 0, 0.05)' : 'background.paper',
                borderColor: securityIsLocked ? 'warning.main' : 'divider',
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <KeyOutlined color={securityIsLocked ? 'warning' : 'action'} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {securityIsLocked ? 'Password Protection Enabled' : 'Password Lock Disabled'}
                  </Typography>
                </Box>
                <Switch
                  checked={securityIsLocked}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setSecurityIsLocked(checked);
                    if (!checked) setSecurityPassword('');
                  }}
                  color="warning"
                />
              </Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2 }}>
                {securityIsLocked
                  ? 'All users (including Super Administrators) must enter the table password to view records.'
                  : 'No password required to access records if user has table permission.'}
              </Typography>

              {/* Confirm existing password when disabling lock */}
              {!securityIsLocked && securityTable.has_password && (
                <Box sx={{ mt: 1 }}>
                  <Alert severity="warning" sx={{ mb: 1.5, py: 0.5 }}>
                    Confirm with the existing table password to disable password protection.
                  </Alert>
                  <TextField
                    fullWidth
                    size="small"
                    type={showSecurityCurrentPassword ? 'text' : 'password'}
                    label="Current Table Password"
                    placeholder="Enter existing password to confirm disabling..."
                    value={securityCurrentPassword}
                    onChange={(e) => setSecurityCurrentPassword(e.target.value)}
                    required
                    slotProps={{
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              size="small"
                              onClick={() => setShowSecurityCurrentPassword(!showSecurityCurrentPassword)}
                              edge="end"
                            >
                              {showSecurityCurrentPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                </Box>
              )}

              {/* Setting or updating password when lock is enabled */}
              {securityIsLocked && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {securityTable.has_password && (
                    <TextField
                      fullWidth
                      size="small"
                      type={showSecurityCurrentPassword ? 'text' : 'password'}
                      label="Current Table Password (Required to change password)"
                      placeholder="Enter existing password..."
                      value={securityCurrentPassword}
                      onChange={(e) => setSecurityCurrentPassword(e.target.value)}
                      slotProps={{
                        input: {
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton
                                size="small"
                                onClick={() => setShowSecurityCurrentPassword(!showSecurityCurrentPassword)}
                                edge="end"
                              >
                                {showSecurityCurrentPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                              </IconButton>
                            </InputAdornment>
                          ),
                        },
                      }}
                    />
                  )}

                  <TextField
                    fullWidth
                    size="small"
                    type={showSecurityPassword ? 'text' : 'password'}
                    label={securityTable.has_password ? 'New Password (Leave blank to keep current)' : 'Set Access Password'}
                    placeholder="Enter secret table password..."
                    value={securityPassword}
                    onChange={(e) => setSecurityPassword(e.target.value)}
                    slotProps={{
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              size="small"
                              onClick={() => setShowSecurityPassword(!showSecurityPassword)}
                              edge="end"
                            >
                              {showSecurityPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                </Box>
              )}
            </Paper>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setSecurityTable(null)} disabled={securitySaving}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleSaveSecurity}
              disabled={securitySaving}
            >
              {securitySaving ? <CircularProgress size={20} /> : 'Save Security Settings'}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Unlock Table Dialog */}
      {unlockTable && (
        <Dialog
          open={Boolean(unlockTable)}
          onClose={() => setUnlockTable(null)}
          maxWidth="xs"
          fullWidth
        >
          <form onSubmit={handleUnlockSubmit}>
            <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
              <LockOutlined color="warning" /> Table Access Locked
            </DialogTitle>
            <DialogContent>
              <DialogContentText sx={{ mb: 2 }}>
                Table <strong>{unlockTable.display_name}</strong> is password-protected. Enter the table security password to view its records.
              </DialogContentText>

              {unlockError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {unlockError}
                </Alert>
              )}

              <TextField
                fullWidth
                size="small"
                autoFocus
                type={showUnlockPassword ? 'text' : 'password'}
                label="Table Password"
                placeholder="Enter password..."
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
                required
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          onClick={() => setShowUnlockPassword(!showUnlockPassword)}
                          edge="end"
                        >
                          {showUnlockPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
              <Button onClick={() => setUnlockTable(null)} disabled={unlocking}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
                color="warning"
                disabled={!unlockPassword.trim() || unlocking}
              >
                {unlocking ? <CircularProgress size={20} /> : 'Unlock & Open'}
              </Button>
            </DialogActions>
          </form>
        </Dialog>
      )}
    </Box>
  );
};

export default TableListPage;

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
  IconButton,
  InputAdornment,
  Paper,
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
  RestoreFromTrashOutlined,
  Search,
  Star,
  StarBorder,
  TableChartOutlined,
  TableView,
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
                    onClick={() => navigate(`/tables/${table.id}`)}
                  >
                    <Box
                      sx={{ flexGrow: 1, p: 2.5, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', mb: 1.5 }}>
                        <Chip
                          icon={<TableChartOutlined sx={{ fontSize: '1rem !important' }} />}
                          label={`${table.columns?.length || 0} Columns`}
                          size="small"
                          color="primary"
                          variant="outlined"
                        />
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
    </Box>
  );
};

export default TableListPage;

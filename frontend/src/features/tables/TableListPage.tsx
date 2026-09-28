import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Alert,
  Avatar,
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
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
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
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  AddCircleOutlined,
  AdminPanelSettingsOutlined,
  CheckCircle,
  CheckCircleOutlined,
  DeleteForeverOutlined,
  DeleteOutlined,
  FileUploadOutlined,
  GridView,
  HistoryOutlined,
  KeyOutlined,
  KeyboardArrowDown,
  LockOutlined,
  LockOpenOutlined,
  MoreVert,
  OpenInNewOutlined,
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

import { AgGridReact } from 'ag-grid-react';
import {
  AllCommunityModule,
  ColDef,
  ModuleRegistry,
} from 'ag-grid-community';

ModuleRegistry.registerModules([AllCommunityModule]);
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

import { apiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useThemeMode } from '../../context/ThemeContext';
import { DataTable, DeletedRecordItem, TableListResponse } from '../../types';
import TablePermissionsModal from './TablePermissionsModal';
import ConfirmDeleteModal from '../../components/common/ConfirmDeleteModal';

export const TableListPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { mode } = useThemeMode();
  const agGridThemeClass = mode === 'dark' ? 'ag-theme-quartz-dark' : 'ag-theme-quartz';

  const isFavoriteFilter = location.search.includes('favorites=true');

  const [currentTab, setCurrentTab] = useState(0); // 0: Active Tables, 1: Trash Tables, 2: Deleted Records
  const [layoutMode, setLayoutMode] = useState<'table' | 'cards'>(() => {
    return (localStorage.getItem('table_list_layout') as 'table' | 'cards') || 'table';
  });

  const handleLayoutChange = (_: React.MouseEvent<HTMLElement>, newLayout: 'table' | 'cards' | null) => {
    if (newLayout) {
      setLayoutMode(newLayout);
      localStorage.setItem('table_list_layout', newLayout);
    }
  };

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

  // Permanent Delete Record Confirm Modal
  const [deleteRecordTarget, setDeleteRecordTarget] = useState<{ tableId: string; recordId: string } | null>(null);
  const [isDeletingRecord, setIsDeletingRecord] = useState(false);

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

  // Row Action Menu State
  const [rowMenuAnchorEl, setRowMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedRowTable, setSelectedRowTable] = useState<DataTable | null>(null);

  const handleOpenRowMenu = (e: React.MouseEvent<HTMLElement>, table: DataTable) => {
    e.stopPropagation();
    setRowMenuAnchorEl(e.currentTarget);
    setSelectedRowTable(table);
  };

  const handleCloseRowMenu = () => {
    setRowMenuAnchorEl(null);
    setSelectedRowTable(null);
  };

  const getAvatarGradient = (name: string) => {
    const gradients = [
      'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
      'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
      'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
      'linear-gradient(135deg, #06b6d4 0%, #0e7490 100%)',
    ];
    let hash = 0;
    const str = name || 'table';
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return gradients[Math.abs(hash) % gradients.length];
  };

  const getInitials = (name: string) => {
    if (!name) return 'TB';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const formatSchedule = (dateStr?: string) => {
    if (!dateStr) return { dateFormatted: '—', timeFormatted: '', rel: '' };
    try {
      const d = new Date(dateStr);
      const dateFormatted = d.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
      });
      const timeFormatted = d.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const rel = formatDistanceToNow(d, { addSuffix: true });
      return { dateFormatted, timeFormatted, rel };
    } catch {
      return { dateFormatted: '—', timeFormatted: '', rel: '' };
    }
  };

  const renderStatusPill = (table: DataTable) => {
    if ((table as any).is_deleted) {
      return (
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            px: 1.8,
            py: 0.5,
            borderRadius: '9999px',
            fontSize: '0.75rem',
            fontWeight: 700,
            bgcolor: mode === 'dark' ? 'rgba(239, 68, 68, 0.12)' : '#fef2f2',
            color: mode === 'dark' ? '#f87171' : '#ef4444',
            border: mode === 'dark' ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid #fecaca',
          }}
        >
          In Trash
        </Box>
      );
    }
    if (table.is_locked || table.has_password) {
      return (
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            px: 1.8,
            py: 0.5,
            borderRadius: '9999px',
            fontSize: '0.75rem',
            fontWeight: 700,
            bgcolor: mode === 'dark' ? 'rgba(239, 68, 68, 0.12)' : '#fef2f2',
            color: mode === 'dark' ? '#f87171' : '#ef4444',
            border: mode === 'dark' ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid #fecaca',
          }}
        >
          Locked
        </Box>
      );
    }
    if (table.is_private) {
      return (
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            px: 1.8,
            py: 0.5,
            borderRadius: '9999px',
            fontSize: '0.75rem',
            fontWeight: 700,
            bgcolor: mode === 'dark' ? 'rgba(245, 158, 11, 0.12)' : '#fffbeb',
            color: mode === 'dark' ? '#fbbf24' : '#d97706',
            border: mode === 'dark' ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid #fde68a',
          }}
        >
          Private
        </Box>
      );
    }
    return (
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: 1.8,
          py: 0.5,
          borderRadius: '9999px',
          fontSize: '0.75rem',
          fontWeight: 700,
          bgcolor: mode === 'dark' ? 'rgba(16, 185, 129, 0.12)' : '#ecfdf5',
          color: mode === 'dark' ? '#34d399' : '#10b981',
          border: mode === 'dark' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid #a7f3d0',
        }}
      >
        Active
      </Box>
    );
  };

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
  const handlePermanentDeleteRecord = (tableId: string, recordId: string) => {
    setDeleteRecordTarget({ tableId, recordId });
  };

  const confirmPermanentDeleteRecord = async () => {
    if (!deleteRecordTarget) return;
    setIsDeletingRecord(true);
    try {
      await apiClient.delete(`/tables/${deleteRecordTarget.tableId}/records/${deleteRecordTarget.recordId}/permanent`);
      setActionSuccess('Record permanently deleted.');
      setDeleteRecordTarget(null);
      await fetchAllData();
    } catch (err: any) {
      setActionError(err.response?.data?.detail || 'Failed to delete record.');
    } finally {
      setIsDeletingRecord(false);
    }
  };

  const selectedTableToDelete = tables.find((t) => t.id === deleteTableId);
  const selectedTrashTableToDelete = trashTables.find((t) => t.id === permDeleteTableId);

  // Client-side search filtering for deleted records log
  const filteredDeletedRecords = useMemo(() => {
    if (!search.trim()) return deletedRecords;
    const s = search.toLowerCase();
    return deletedRecords.filter((rec) => {
      const tableName = (rec.table_display_name || rec.table_name || '').toLowerCase();
      const deletedBy = (rec.deleted_by_name || '').toLowerCase();
      const snapshot = JSON.stringify(rec.data_snapshot || {}).toLowerCase();
      return tableName.includes(s) || deletedBy.includes(s) || snapshot.includes(s);
    });
  }, [deletedRecords, search]);

  // ColDefs for Active Tables AG Grid
  const activeTableColDefs = useMemo<ColDef<DataTable>[]>(() => [
    {
      field: 'is_favorite',
      headerName: '',
      width: 55,
      pinned: 'left',
      sortable: false,
      filter: false,
      cellRenderer: (params: any) => {
        if (!params.data) return null;
        return (
          <Tooltip title={params.data.is_favorite ? 'Remove from favorites' : 'Add to favorites'}>
            <IconButton
              size="small"
              onClick={(e) => handleToggleFavorite(e, params.data)}
              color={params.data.is_favorite ? 'warning' : 'default'}
              sx={{ p: 0.5 }}
            >
              {params.data.is_favorite ? <Star fontSize="small" /> : <StarBorder fontSize="small" />}
            </IconButton>
          </Tooltip>
        );
      },
    },
    {
      field: 'display_name',
      headerName: 'Table Name',
      flex: 2,
      minWidth: 230,
      cellRenderer: (params: any) => {
        if (!params.data) return null;
        return (
          <Box
            sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', cursor: 'pointer' }}
            onClick={() => handleCardClick(params.data)}
          >
            <Typography
              variant="body2"
              sx={{
                fontWeight: 700,
                color: 'primary.main',
                '&:hover': { textDecoration: 'underline' },
              }}
            >
              {params.data.display_name}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace', fontSize: '0.72rem' }}>
              #{params.data.name}
            </Typography>
          </Box>
        );
      },
    },
    {
      headerName: 'Access / Security',
      width: 145,
      cellRenderer: (params: any) => {
        if (!params.data) return null;
        const t = params.data;
        if (t.is_private) {
          return (
            <Tooltip title="Private Table: Only creator & super admins can access">
              <Chip
                icon={<LockOutlined sx={{ fontSize: '0.85rem !important' }} />}
                label="Private"
                size="small"
                color="secondary"
                sx={{ fontWeight: 700, fontSize: '0.72rem' }}
              />
            </Tooltip>
          );
        }
        if (t.is_locked || t.has_password) {
          return (
            <Tooltip title="Password Protected: Password required to view records">
              <Chip
                icon={<KeyOutlined sx={{ fontSize: '0.85rem !important' }} />}
                label="Locked"
                size="small"
                color="warning"
                sx={{ fontWeight: 700, fontSize: '0.72rem' }}
              />
            </Tooltip>
          );
        }
        return (
          <Chip
            icon={<PublicOutlined sx={{ fontSize: '0.85rem !important' }} />}
            label="Public"
            size="small"
            variant="outlined"
            sx={{ fontSize: '0.72rem', opacity: 0.75 }}
          />
        );
      },
    },
    {
      headerName: 'Columns',
      width: 115,
      cellRenderer: (params: any) => {
        if (!params.data) return null;
        return (
          <Chip
            icon={<TableChartOutlined sx={{ fontSize: '0.85rem !important' }} />}
            label={`${params.data.columns?.length || 0} Cols`}
            size="small"
            color="primary"
            variant="outlined"
            sx={{ fontSize: '0.74rem' }}
          />
        );
      },
    },
    {
      field: 'record_count',
      headerName: 'Active Records',
      width: 140,
      cellRenderer: (params: any) => {
        if (!params.data) return null;
        return (
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {params.data.record_count ?? 0} Records
          </Typography>
        );
      },
    },
    {
      field: 'description',
      headerName: 'Description',
      flex: 2,
      minWidth: 220,
      cellRenderer: (params: any) => {
        const text = params.value || 'No description provided.';
        return (
          <Tooltip title={text}>
            <Typography variant="body2" sx={{ color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {text}
            </Typography>
          </Tooltip>
        );
      },
    },
    {
      field: 'created_at',
      headerName: 'Created',
      width: 145,
      cellRenderer: (params: any) => {
        if (!params.value) return '—';
        try {
          return (
            <Tooltip title={new Date(params.value).toLocaleString()}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {formatDistanceToNow(new Date(params.value), { addSuffix: true })}
              </Typography>
            </Tooltip>
          );
        } catch {
          return '—';
        }
      },
    },
    {
      headerName: 'Actions',
      width: 185,
      pinned: 'right',
      sortable: false,
      filter: false,
      cellRenderer: (params: any) => {
        if (!params.data) return null;
        const table = params.data;
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, height: '100%' }}>
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
            <Tooltip title="Open Table Records">
              <IconButton
                size="small"
                color="primary"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCardClick(table);
                }}
              >
                <OpenInNewOutlined fontSize="small" />
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
        );
      },
    },
  ], [tables]);

  // ColDefs for Trash Tables AG Grid
  const trashTableColDefs = useMemo<ColDef<DataTable>[]>(() => [
    {
      field: 'display_name',
      headerName: 'Table Name',
      flex: 2,
      minWidth: 230,
      cellRenderer: (params: any) => {
        if (!params.data) return null;
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
            <Typography variant="body2" sx={{ fontWeight: 700, color: 'error.main' }}>
              {params.data.display_name}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace', fontSize: '0.72rem' }}>
              #{params.data.name}
            </Typography>
          </Box>
        );
      },
    },
    {
      headerName: 'Status',
      width: 120,
      cellRenderer: () => (
        <Chip label="In Trash" size="small" color="error" variant="outlined" sx={{ fontWeight: 700 }} />
      ),
    },
    {
      headerName: 'Columns',
      width: 110,
      cellRenderer: (params: any) => (
        <Chip label={`${params.data?.columns?.length || 0} Cols`} size="small" variant="outlined" />
      ),
    },
    {
      field: 'record_count',
      headerName: 'Records',
      width: 130,
      cellRenderer: (params: any) => (
        <Typography variant="body2">{params.data?.record_count ?? 0} Records</Typography>
      ),
    },
    {
      field: 'description',
      headerName: 'Description',
      flex: 2,
      minWidth: 200,
      cellRenderer: (params: any) => {
        const text = params.value || 'No description provided.';
        return (
          <Tooltip title={text}>
            <Typography variant="body2" sx={{ color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {text}
            </Typography>
          </Tooltip>
        );
      },
    },
    {
      field: 'created_at',
      headerName: 'Created',
      width: 145,
      cellRenderer: (params: any) => {
        if (!params.value) return '—';
        try {
          return (
            <Tooltip title={new Date(params.value).toLocaleString()}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {formatDistanceToNow(new Date(params.value), { addSuffix: true })}
              </Typography>
            </Tooltip>
          );
        } catch {
          return '—';
        }
      },
    },
    {
      headerName: 'Actions',
      width: 250,
      pinned: 'right',
      sortable: false,
      filter: false,
      cellRenderer: (params: any) => {
        if (!params.data) return null;
        const table = params.data;
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, height: '100%' }}>
            <Button
              size="small"
              variant="contained"
              color="primary"
              startIcon={<RestoreFromTrashOutlined />}
              onClick={() => handleRestoreTable(table.id)}
              sx={{ textTransform: 'none', fontWeight: 600, py: 0.3 }}
            >
              Restore
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
              sx={{ textTransform: 'none', py: 0.3 }}
            >
              Delete Forever
            </Button>
          </Box>
        );
      },
    },
  ], [trashTables]);

  // ColDefs for Deleted Records Log AG Grid
  const deletedRecordsColDefs = useMemo<ColDef<DeletedRecordItem>[]>(() => [
    {
      headerName: '#',
      width: 65,
      valueGetter: (params: any) => (params.node?.rowIndex !== undefined ? params.node.rowIndex + 1 : ''),
      sortable: false,
    },
    {
      field: 'table_display_name',
      headerName: 'Table Name',
      width: 180,
      cellRenderer: (params: any) => {
        if (!params.data) return null;
        return (
          <Chip
            label={params.data.table_display_name || params.data.table_name || 'Table'}
            size="small"
            color="primary"
            variant="outlined"
            sx={{ fontWeight: 600 }}
          />
        );
      },
    },
    {
      field: 'data_snapshot',
      headerName: 'Data Snapshot Preview',
      flex: 2,
      minWidth: 280,
      cellRenderer: (params: any) => {
        if (!params.data || !params.data.data_snapshot) return '—';
        const entries = Object.entries(params.data.data_snapshot).slice(0, 3);
        return (
          <Box sx={{ display: 'flex', gap: 0.8, alignItems: 'center', height: '100%', overflow: 'hidden' }}>
            {entries.map(([k, v]) => (
              <Chip
                key={k}
                label={`${k}: ${String(v)}`}
                size="small"
                sx={{ fontSize: '0.72rem', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}
              />
            ))}
          </Box>
        );
      },
    },
    {
      field: 'deleted_by_name',
      headerName: 'Deleted By',
      width: 160,
      cellRenderer: (params: any) => (
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          {params.value || 'Administrator'}
        </Typography>
      ),
    },
    {
      field: 'deleted_at',
      headerName: 'Deleted At',
      width: 185,
      cellRenderer: (params: any) => {
        if (!params.value) return '—';
        return (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {new Date(params.value).toLocaleString()}
          </Typography>
        );
      },
    },
    {
      headerName: 'Actions',
      width: 180,
      pinned: 'right',
      sortable: false,
      filter: false,
      cellRenderer: (params: any) => {
        if (!params.data) return null;
        const rec = params.data;
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, height: '100%' }}>
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
        );
      },
    },
  ], [deletedRecords]);

  return (
    <Box sx={{ width: '100%', py: 1 }}>
      {/* Notifications */}
      {actionSuccess && (
        <Alert severity="success" sx={{ mb: 2.5, borderRadius: 3 }} onClose={() => setActionSuccess(null)}>
          {actionSuccess}
        </Alert>
      )}
      {actionError && (
        <Alert severity="error" sx={{ mb: 2.5, borderRadius: 3 }} onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      {/* Main Premium Card Canvas */}
      <Paper
        elevation={0}
        sx={{
          borderRadius: { xs: 3, md: 5 },
          border: mode === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid #eef2f6',
          bgcolor: mode === 'dark' ? '#0f172a' : '#ffffff',
          boxShadow: mode === 'dark'
            ? '0 10px 40px -10px rgba(0,0,0,0.5)'
            : '0 10px 40px -10px rgba(0,0,0,0.04)',
          p: { xs: 2.5, md: 4 },
        }}
      >
        {/* TOP BAR: Nav Pills & Quick Search/Toggle */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 3.5,
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          {/* Nav Pills (Active | Trash | Deleted Records) */}
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
              bgcolor: mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#f1f5f9',
              p: 0.6,
              borderRadius: '9999px',
            }}
          >
            <Button
              onClick={() => setCurrentTab(0)}
              sx={{
                borderRadius: '9999px',
                px: 2.5,
                py: 0.8,
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.86rem',
                color: currentTab === 0 ? '#ffffff' : mode === 'dark' ? '#94a3b8' : '#64748b',
                bgcolor: currentTab === 0 ? 'primary.main' : 'transparent',
                boxShadow: currentTab === 0 ? '0 4px 14px rgba(37, 99, 235, 0.35)' : 'none',
                transition: 'all 0.2s',
                '&:hover': {
                  bgcolor: currentTab === 0 ? 'primary.dark' : mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                },
              }}
            >
              Active Tables {tables.length > 0 && `(${tables.length})`}
            </Button>
            <Button
              onClick={() => setCurrentTab(1)}
              sx={{
                borderRadius: '9999px',
                px: 2.5,
                py: 0.8,
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.86rem',
                color: currentTab === 1 ? '#ffffff' : mode === 'dark' ? '#94a3b8' : '#64748b',
                bgcolor: currentTab === 1 ? '#ef4444' : 'transparent',
                boxShadow: currentTab === 1 ? '0 4px 14px rgba(239, 68, 68, 0.35)' : 'none',
                transition: 'all 0.2s',
                '&:hover': {
                  bgcolor: currentTab === 1 ? '#dc2626' : mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                },
              }}
            >
              Trash Tables {trashTables.length > 0 && `(${trashTables.length})`}
            </Button>
            <Button
              onClick={() => setCurrentTab(2)}
              sx={{
                borderRadius: '9999px',
                px: 2.5,
                py: 0.8,
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.86rem',
                color: currentTab === 2 ? '#ffffff' : mode === 'dark' ? '#94a3b8' : '#64748b',
                bgcolor: currentTab === 2 ? '#f59e0b' : 'transparent',
                boxShadow: currentTab === 2 ? '0 4px 14px rgba(245, 158, 11, 0.35)' : 'none',
                transition: 'all 0.2s',
                '&:hover': {
                  bgcolor: currentTab === 2 ? '#d97706' : mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                },
              }}
            >
              Deleted Records Log {deletedRecords.length > 0 && `(${deletedRecords.length})`}
            </Button>
          </Box>

          {/* Quick Search & Layout Switcher */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <TextField
              size="small"
              placeholder={currentTab === 0 ? "Search tables..." : currentTab === 1 ? "Search trash..." : "Search log..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{
                width: { xs: 180, sm: 250 },
                '& .MuiOutlinedInput-root': {
                  borderRadius: '9999px',
                  bgcolor: mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#f8fafc',
                  fontSize: '0.85rem',
                  '& fieldset': {
                    borderColor: mode === 'dark' ? 'rgba(255,255,255,0.1)' : '#e2e8f0',
                  },
                },
              }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search fontSize="small" sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <ToggleButtonGroup
              value={layoutMode}
              exclusive
              onChange={handleLayoutChange}
              size="small"
              sx={{
                bgcolor: mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
                p: 0.4,
                borderRadius: '9999px',
                '& .MuiToggleButtonGroup-grouped': {
                  borderRadius: '9999px !important',
                  border: 'none',
                  px: 1.5,
                  py: 0.6,
                },
              }}
            >
              <ToggleButton value="table" title="Table View">
                <TableView fontSize="small" />
              </ToggleButton>
              <ToggleButton value="cards" title="Cards View">
                <GridView fontSize="small" />
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Box>

        {/* SUB-HEADER: Title + Filter Pills + Action Buttons */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            mb: 3,
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          <Box>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 800,
                letterSpacing: '-0.025em',
                color: 'text.primary',
                fontSize: { xs: '1.5rem', md: '1.85rem' },
                mb: 0.5,
              }}
            >
              {currentTab === 0
                ? isFavoriteFilter
                  ? 'Favorite Tables'
                  : 'Smart Tables'
                : currentTab === 1
                ? 'Trash Tables'
                : 'Deleted Records Audit'}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
              {currentTab === 0
                ? 'Smart order and centralized dynamic spreadsheets made effortless.'
                : currentTab === 1
                ? 'Soft-deleted tables ready to be restored or permanently removed.'
                : 'Granular audit logs of all deleted records with instantaneous restoration.'}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            {/* Filter Pill: All Tables / Favorites */}
            {currentTab === 0 && (
              <Button
                variant="outlined"
                size="small"
                onClick={() => navigate(isFavoriteFilter ? '/tables' : '/tables?favorites=true')}
                endIcon={<KeyboardArrowDown fontSize="small" />}
                sx={{
                  borderRadius: '9999px',
                  px: 2,
                  py: 0.7,
                  textTransform: 'none',
                  borderColor: mode === 'dark' ? 'rgba(255,255,255,0.15)' : '#e2e8f0',
                  color: isFavoriteFilter ? 'warning.main' : 'text.secondary',
                  fontWeight: 600,
                  fontSize: '0.84rem',
                  '&:hover': {
                    borderColor: 'primary.main',
                    bgcolor: mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#f8fafc',
                  },
                }}
              >
                {isFavoriteFilter ? '⭐ Favorites Only' : 'All Tables'}
              </Button>
            )}

            {/* Import Excel Pill Button & + Create Table Primary Button (Active Tab Only) */}
            {currentTab === 0 && (
              <>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<FileUploadOutlined />}
                  onClick={() => navigate('/imports/wizard')}
                  sx={{
                    borderRadius: '9999px',
                    px: 2.2,
                    py: 0.7,
                    textTransform: 'none',
                    borderColor: mode === 'dark' ? 'rgba(255,255,255,0.15)' : '#e2e8f0',
                    color: 'text.primary',
                    fontWeight: 600,
                    fontSize: '0.84rem',
                    '&:hover': {
                      borderColor: 'primary.main',
                      bgcolor: mode === 'dark' ? 'rgba(37,99,235,0.08)' : '#eff6ff',
                    },
                  }}
                >
                  Import Excel
                </Button>

                <Button
                  variant="contained"
                  size="small"
                  startIcon={<AddCircleOutlined />}
                  onClick={() => navigate('/tables/create')}
                  sx={{
                    borderRadius: '9999px',
                    px: 2.8,
                    py: 0.8,
                    textTransform: 'none',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
                    bgcolor: '#2563eb',
                    '&:hover': { bgcolor: '#1d4ed8' },
                  }}
                >
                  + Create Table
                </Button>
              </>
            )}
          </Box>
        </Box>

        {/* ========================================================================= */}
        {/* TAB 0: ACTIVE TABLES */}
        {/* ========================================================================= */}
        {currentTab === 0 && (
          <>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 8 }}>
                <CircularProgress size={36} />
              </Box>
            ) : tables.length === 0 ? (
              <Box
                sx={{
                  p: 8,
                  textAlign: 'center',
                  borderRadius: 4,
                  bgcolor: mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#f8fafc',
                  border: '1px dashed',
                  borderColor: mode === 'dark' ? 'rgba(255,255,255,0.1)' : '#e2e8f0',
                }}
              >
                <TableView sx={{ fontSize: 56, color: 'text.secondary', opacity: 0.3, mb: 2 }} />
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
                    sx={{ borderRadius: '9999px', textTransform: 'none', px: 2.5 }}
                  >
                    Import Excel
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<AddCircleOutlined />}
                    onClick={() => navigate('/tables/create')}
                    sx={{ borderRadius: '9999px', textTransform: 'none', px: 2.5 }}
                  >
                    Create Table
                  </Button>
                </Box>
              </Box>
            ) : layoutMode === 'table' ? (
              /* Ultra-Premium Bespoke Table matching reference image */
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table sx={{ minWidth: 920 }}>
                  <TableHead>
                    <TableRow
                      sx={{
                        '& th': {
                          borderBottom: mode === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid #f1f5f9',
                          py: 1.8,
                        },
                      }}
                    >
                      <TableCell sx={{ width: 44, pl: 1 }}>
                        <CheckCircle sx={{ color: '#0f172a', fontSize: '1.25rem' }} />
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem', color: '#64748b' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 2 }}>
                          <span>Name</span>
                          <Typography sx={{ color: '#cbd5e1', fontSize: '0.8rem' }}>:</Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem', color: '#64748b' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 2 }}>
                          <span>Order Details</span>
                          <Typography sx={{ color: '#cbd5e1', fontSize: '0.8rem' }}>:</Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem', color: '#64748b' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 2 }}>
                          <span>Phone / Access</span>
                          <Typography sx={{ color: '#cbd5e1', fontSize: '0.8rem' }}>:</Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem', color: '#64748b' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 2 }}>
                          <span>Schedule</span>
                          <Typography sx={{ color: '#cbd5e1', fontSize: '0.8rem' }}>:</Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem', color: '#64748b' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 2 }}>
                          <span>Status</span>
                          <Typography sx={{ color: '#cbd5e1', fontSize: '0.8rem' }}>:</Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="right" sx={{ width: 44, pr: 1 }}>
                        <Typography sx={{ color: '#cbd5e1', fontSize: '0.8rem' }}>:</Typography>
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tables.map((table) => {
                      const schedule = formatSchedule(table.created_at);
                      return (
                        <TableRow
                          key={table.id}
                          hover
                          onClick={() => handleCardClick(table)}
                          sx={{
                            cursor: 'pointer',
                            transition: 'background-color 0.15s ease',
                            '& td': {
                              borderBottom: mode === 'dark' ? '1px solid rgba(255,255,255,0.04)' : '1px solid #f8fafc',
                              py: 2,
                            },
                            '&:hover': {
                              bgcolor: mode === 'dark' ? 'rgba(255,255,255,0.03)' : '#f8fafc',
                            },
                          }}
                        >
                          {/* Col 1: Circular Check / Favorite */}
                          <TableCell sx={{ pl: 1 }} onClick={(e) => e.stopPropagation()}>
                            <IconButton
                              size="small"
                              onClick={(e) => handleToggleFavorite(e, table)}
                              sx={{ p: 0.4 }}
                            >
                              {table.is_favorite ? (
                                <Star sx={{ color: '#f59e0b', fontSize: '1.25rem' }} />
                              ) : (
                                <CheckCircleOutlined sx={{ color: '#cbd5e1', fontSize: '1.25rem', '&:hover': { color: '#64748b' } }} />
                              )}
                            </IconButton>
                          </TableCell>

                          {/* Col 2: Avatar + Name + Slug */}
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.8 }}>
                              <Avatar
                                sx={{
                                  width: 36,
                                  height: 36,
                                  fontSize: '0.8rem',
                                  fontWeight: 700,
                                  background: getAvatarGradient(table.name),
                                  color: '#ffffff',
                                  boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                                }}
                              >
                                {getInitials(table.display_name)}
                              </Avatar>
                              <Box sx={{ minWidth: 0 }}>
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontWeight: 700,
                                    color: 'text.primary',
                                    lineHeight: 1.25,
                                    '&:hover': { color: 'primary.main' },
                                  }}
                                >
                                  {table.display_name}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  sx={{
                                    color: 'text.secondary',
                                    fontFamily: 'monospace',
                                    fontSize: '0.72rem',
                                    display: 'block',
                                    mt: 0.3,
                                  }}
                                >
                                  #{table.name}
                                </Typography>
                              </Box>
                            </Box>
                          </TableCell>

                          {/* Col 3: Order Details (Table Details) */}
                          <TableCell>
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', lineHeight: 1.25 }}>
                                {table.description
                                  ? table.description.length > 34
                                    ? table.description.slice(0, 34) + '...'
                                    : table.description
                                  : 'Spreadsheet Data'}
                              </Typography>
                              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.74rem', display: 'block', mt: 0.3 }}>
                                {table.columns?.length || 0} Columns • {table.record_count ?? 0} Records
                              </Typography>
                            </Box>
                          </TableCell>

                          {/* Col 4: Phone / Access */}
                          <TableCell>
                            <Box>
                              <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.84rem' }}>
                                {table.is_private ? 'Private Access' : table.is_locked ? 'Password Protected' : 'Public Access'}
                              </Typography>
                              <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.72rem', display: 'block', mt: 0.3 }}>
                                {table.is_private ? 'Only Creator & Admins' : table.is_locked ? 'Unlock Key Required' : 'All Authenticated Users'}
                              </Typography>
                            </Box>
                          </TableCell>

                          {/* Col 5: Schedule */}
                          <TableCell>
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary', fontSize: '0.84rem', lineHeight: 1.25 }}>
                                {schedule.dateFormatted}
                              </Typography>
                              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem', display: 'block', mt: 0.3 }}>
                                {schedule.timeFormatted} • {schedule.rel}
                              </Typography>
                            </Box>
                          </TableCell>

                          {/* Col 6: Status Pill */}
                          <TableCell>
                            {renderStatusPill(table)}
                          </TableCell>

                          {/* Col 7: Three-dot Actions */}
                          <TableCell align="right" sx={{ pr: 1 }} onClick={(e) => e.stopPropagation()}>
                            <IconButton
                              size="small"
                              onClick={(e) => handleOpenRowMenu(e, table)}
                              sx={{ color: '#94a3b8', '&:hover': { color: 'text.primary' } }}
                            >
                              <MoreVert fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              /* Fallback Card View */
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
                      <Box sx={{ flexGrow: 1, p: 2.5, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', mb: 1.5 }}>
                          <Chip
                            icon={<TableChartOutlined sx={{ fontSize: '0.9rem !important' }} />}
                            label={`${table.columns?.length || 0} Cols`}
                            size="small"
                            color="primary"
                            variant="outlined"
                          />
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <IconButton
                              size="small"
                              onClick={(e) => handleToggleFavorite(e, table)}
                              color={table.is_favorite ? 'warning' : 'default'}
                            >
                              {table.is_favorite ? <Star fontSize="small" /> : <StarBorder fontSize="small" />}
                            </IconButton>
                            <IconButton size="small" onClick={(e) => handleOpenSecurity(e, table)}>
                              <SecurityOutlined fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPermissionsTable(table);
                              }}
                            >
                              <AdminPanelSettingsOutlined fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmText('');
                                setDeleteTableId(table.id);
                              }}
                            >
                              <DeleteOutlined fontSize="small" />
                            </IconButton>
                          </Box>
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
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', pt: 1.5, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                          <Typography variant="caption" sx={{ fontWeight: 600 }}>
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

        {/* ========================================================================= */}
        {/* TAB 1: TRASH / DELETED TABLES */}
        {/* ========================================================================= */}
        {currentTab === 1 && (
          <>
            {trashTables.length === 0 ? (
              <Box
                sx={{
                  p: 8,
                  textAlign: 'center',
                  borderRadius: 4,
                  bgcolor: mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#f8fafc',
                  border: '1px dashed',
                  borderColor: mode === 'dark' ? 'rgba(255,255,255,0.1)' : '#e2e8f0',
                }}
              >
                <DeleteOutlined sx={{ fontSize: 56, color: 'text.disabled', mb: 1.5 }} />
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Trash is Empty
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                  No tables are currently in the trash. Soft-deleted tables will appear here and can be restored anytime.
                </Typography>
              </Box>
            ) : layoutMode === 'table' ? (
              /* Ultra-Premium Bespoke Table for Trash */
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table sx={{ minWidth: 920 }}>
                  <TableHead>
                    <TableRow
                      sx={{
                        '& th': {
                          borderBottom: mode === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid #f1f5f9',
                          py: 1.8,
                        },
                      }}
                    >
                      <TableCell sx={{ width: 44, pl: 1 }}>
                        <CheckCircle sx={{ color: '#ef4444', fontSize: '1.25rem' }} />
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem', color: '#64748b' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 2 }}>
                          <span>Name</span>
                          <Typography sx={{ color: '#cbd5e1', fontSize: '0.8rem' }}>:</Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem', color: '#64748b' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 2 }}>
                          <span>Details</span>
                          <Typography sx={{ color: '#cbd5e1', fontSize: '0.8rem' }}>:</Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem', color: '#64748b' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 2 }}>
                          <span>Previous Access</span>
                          <Typography sx={{ color: '#cbd5e1', fontSize: '0.8rem' }}>:</Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem', color: '#64748b' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 2 }}>
                          <span>Created Date</span>
                          <Typography sx={{ color: '#cbd5e1', fontSize: '0.8rem' }}>:</Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem', color: '#64748b' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 2 }}>
                          <span>Status</span>
                          <Typography sx={{ color: '#cbd5e1', fontSize: '0.8rem' }}>:</Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="right" sx={{ width: 44, pr: 1 }}>
                        <Typography sx={{ color: '#cbd5e1', fontSize: '0.8rem' }}>:</Typography>
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {trashTables.map((table) => {
                      const schedule = formatSchedule(table.created_at);
                      return (
                        <TableRow
                          key={table.id}
                          hover
                          sx={{
                            '& td': {
                              borderBottom: mode === 'dark' ? '1px solid rgba(255,255,255,0.04)' : '1px solid #f8fafc',
                              py: 2,
                            },
                          }}
                        >
                          <TableCell sx={{ pl: 1 }}>
                            <CheckCircleOutlined sx={{ color: '#f87171', fontSize: '1.25rem' }} />
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.8 }}>
                              <Avatar
                                sx={{
                                  width: 36,
                                  height: 36,
                                  fontSize: '0.8rem',
                                  fontWeight: 700,
                                  bgcolor: 'rgba(239, 68, 68, 0.2)',
                                  color: '#ef4444',
                                }}
                              >
                                {getInitials(table.display_name)}
                              </Avatar>
                              <Box>
                                <Typography variant="body2" sx={{ fontWeight: 700, color: 'error.main' }}>
                                  {table.display_name}
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace', fontSize: '0.72rem' }}>
                                  #{table.name}
                                </Typography>
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                                {table.description || 'No description provided.'}
                              </Typography>
                              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.74rem' }}>
                                {table.columns?.length || 0} Columns • {table.record_count ?? 0} Records
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.84rem' }}>
                              {table.is_private ? 'Private Table' : 'Public Access'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.84rem' }}>
                              {schedule.dateFormatted}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
                              {schedule.rel}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Box
                              sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                px: 1.8,
                                py: 0.5,
                                borderRadius: '9999px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                bgcolor: mode === 'dark' ? 'rgba(239, 68, 68, 0.15)' : '#fef2f2',
                                color: '#ef4444',
                                border: '1px solid #fecaca',
                              }}
                            >
                              In Trash
                            </Box>
                          </TableCell>
                          <TableCell align="right" sx={{ pr: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
                              <Button
                                size="small"
                                variant="contained"
                                color="primary"
                                startIcon={<RestoreFromTrashOutlined />}
                                onClick={() => handleRestoreTable(table.id)}
                                sx={{ borderRadius: '9999px', textTransform: 'none', fontWeight: 600, px: 2 }}
                              >
                                Restore
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
                                sx={{ borderRadius: '9999px', textTransform: 'none' }}
                              >
                                Delete
                              </Button>
                            </Box>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              /* Fallback Card View for Trash */
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
                        p: 2.5,
                      }}
                    >
                      <Chip label="In Trash" size="small" color="error" variant="outlined" sx={{ fontWeight: 700, width: 'fit-content', mb: 1.5 }} />
                      <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>{table.display_name}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5, fontFamily: 'monospace' }}>#{table.name}</Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, flexGrow: 1 }}>{table.description || 'No description provided.'}</Typography>
                      <Divider sx={{ my: 1.5 }} />
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                        <Button size="small" variant="contained" color="primary" startIcon={<RestoreFromTrashOutlined />} onClick={() => handleRestoreTable(table.id)} sx={{ textTransform: 'none', borderRadius: '9999px' }}>Restore</Button>
                        <Button size="small" variant="outlined" color="error" startIcon={<DeleteForeverOutlined />} onClick={() => { setPermDeleteConfirmText(''); setPermDeleteTableId(table.id); }} sx={{ textTransform: 'none', borderRadius: '9999px' }}>Delete Forever</Button>
                      </Box>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}
          </>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: DELETED RECORDS AUDIT LOG */}
        {/* ========================================================================= */}
        {currentTab === 2 && (
          <>
            {filteredDeletedRecords.length === 0 ? (
              <Box
                sx={{
                  p: 8,
                  textAlign: 'center',
                  borderRadius: 4,
                  bgcolor: mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#f8fafc',
                  border: '1px dashed',
                  borderColor: mode === 'dark' ? 'rgba(255,255,255,0.1)' : '#e2e8f0',
                }}
              >
                <DeleteOutlined sx={{ fontSize: 56, color: 'text.disabled', mb: 1.5 }} />
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  No Deleted Records Found
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                  When users delete individual or bulk records from any table, they are logged here with full restoration capabilities.
                </Typography>
              </Box>
            ) : (
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table sx={{ minWidth: 920 }}>
                  <TableHead>
                    <TableRow
                      sx={{
                        '& th': {
                          borderBottom: mode === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid #f1f5f9',
                          py: 1.8,
                        },
                      }}
                    >
                      <TableCell sx={{ width: 44, pl: 1 }}>
                        <CheckCircle sx={{ color: '#f59e0b', fontSize: '1.25rem' }} />
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem', color: '#64748b' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 2 }}>
                          <span>Table Name</span>
                          <Typography sx={{ color: '#cbd5e1', fontSize: '0.8rem' }}>:</Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem', color: '#64748b' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 2 }}>
                          <span>Data Snapshot Preview</span>
                          <Typography sx={{ color: '#cbd5e1', fontSize: '0.8rem' }}>:</Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem', color: '#64748b' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 2 }}>
                          <span>Deleted By</span>
                          <Typography sx={{ color: '#cbd5e1', fontSize: '0.8rem' }}>:</Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem', color: '#64748b' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 2 }}>
                          <span>Schedule / Deleted At</span>
                          <Typography sx={{ color: '#cbd5e1', fontSize: '0.8rem' }}>:</Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem', color: '#64748b' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 2 }}>
                          <span>Status</span>
                          <Typography sx={{ color: '#cbd5e1', fontSize: '0.8rem' }}>:</Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="right" sx={{ width: 44, pr: 1 }}>
                        <Typography sx={{ color: '#cbd5e1', fontSize: '0.8rem' }}>:</Typography>
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredDeletedRecords.map((rec) => {
                      const schedule = formatSchedule(rec.deleted_at);
                      return (
                        <TableRow
                          key={rec.id}
                          hover
                          sx={{
                            '& td': {
                              borderBottom: mode === 'dark' ? '1px solid rgba(255,255,255,0.04)' : '1px solid #f8fafc',
                              py: 2,
                            },
                          }}
                        >
                          <TableCell sx={{ pl: 1 }}>
                            <CheckCircleOutlined sx={{ color: '#cbd5e1', fontSize: '1.25rem' }} />
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.8 }}>
                              <Avatar
                                sx={{
                                  width: 36,
                                  height: 36,
                                  fontSize: '0.8rem',
                                  fontWeight: 700,
                                  bgcolor: 'primary.main',
                                  color: '#ffffff',
                                }}
                              >
                                {getInitials(rec.table_display_name || rec.table_name || 'TB')}
                              </Avatar>
                              <Box>
                                <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                  {rec.table_display_name || rec.table_name || 'Table'}
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace', fontSize: '0.72rem' }}>
                                  Record #{rec.record_id.slice(0, 8)}
                                </Typography>
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', gap: 0.8, flexWrap: 'wrap', maxWidth: 280 }}>
                              {Object.entries(rec.data_snapshot || {})
                                .slice(0, 3)
                                .map(([k, v]) => (
                                  <Chip
                                    key={k}
                                    label={`${k}: ${String(v)}`}
                                    size="small"
                                    sx={{ fontSize: '0.72rem', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}
                                  />
                                ))}
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                              {rec.deleted_by_name || 'Administrator'}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
                              Super Admin
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.84rem' }}>
                              {schedule.dateFormatted}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
                              {schedule.timeFormatted} • {schedule.rel}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Box
                              sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                px: 1.8,
                                py: 0.5,
                                borderRadius: '9999px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                bgcolor: mode === 'dark' ? 'rgba(245, 158, 11, 0.15)' : '#fffbeb',
                                color: '#d97706',
                                border: '1px solid #fde68a',
                              }}
                            >
                              Deleted
                            </Box>
                          </TableCell>
                          <TableCell align="right" sx={{ pr: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
                              <Button
                                size="small"
                                variant="contained"
                                color="primary"
                                startIcon={<RestoreFromTrashOutlined />}
                                onClick={() => handleRestoreRecord(rec.table_id, rec.record_id)}
                                sx={{ borderRadius: '9999px', textTransform: 'none', fontWeight: 600, px: 2 }}
                              >
                                Restore
                              </Button>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handlePermanentDeleteRecord(rec.table_id, rec.record_id)}
                              >
                                <DeleteForeverOutlined fontSize="small" />
                              </IconButton>
                            </Box>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </>
        )}

        {/* BOTTOM SUMMARY FOOTER */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            pt: 3,
            mt: 2,
            borderTop: mode === 'dark' ? '1px solid rgba(255,255,255,0.06)' : '1px solid #f1f5f9',
            flexWrap: 'wrap',
            gap: 1.5,
          }}
        >
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
            Showing {currentTab === 0 ? tables.length : currentTab === 1 ? trashTables.length : filteredDeletedRecords.length} records • Real-time synchronization active
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" sx={{ color: 'text.disabled' }}>
              Dynamic Table Hub 2.0
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Row Three-Dot Actions Menu */}
      <Menu
        anchorEl={rowMenuAnchorEl}
        open={Boolean(rowMenuAnchorEl)}
        onClose={handleCloseRowMenu}
        slotProps={{
          paper: {
            elevation: 4,
            sx: {
              borderRadius: 3,
              minWidth: 210,
              boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
              border: mode === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0',
              py: 0.5,
            },
          },
        }}
      >
        <MenuItem
          onClick={() => {
            if (selectedRowTable) handleCardClick(selectedRowTable);
            handleCloseRowMenu();
          }}
        >
          <ListItemIcon><OpenInNewOutlined fontSize="small" color="primary" /></ListItemIcon>
          <ListItemText primary="Open Table Records" />
        </MenuItem>
        <MenuItem
          onClick={(e) => {
            if (selectedRowTable) handleOpenSecurity(e, selectedRowTable);
            handleCloseRowMenu();
          }}
        >
          <ListItemIcon><SecurityOutlined fontSize="small" /></ListItemIcon>
          <ListItemText primary="Security & Password" />
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (selectedRowTable) setPermissionsTable(selectedRowTable);
            handleCloseRowMenu();
          }}
        >
          <ListItemIcon><AdminPanelSettingsOutlined fontSize="small" /></ListItemIcon>
          <ListItemText primary="Access Permissions" />
        </MenuItem>
        <MenuItem
          onClick={(e) => {
            if (selectedRowTable) handleToggleFavorite(e, selectedRowTable);
            handleCloseRowMenu();
          }}
        >
          <ListItemIcon>
            {selectedRowTable?.is_favorite ? <Star fontSize="small" color="warning" /> : <StarBorder fontSize="small" />}
          </ListItemIcon>
          <ListItemText primary={selectedRowTable?.is_favorite ? "Remove Favorite" : "Add to Favorites"} />
        </MenuItem>
        <Divider sx={{ my: 0.5 }} />
        <MenuItem
          onClick={() => {
            if (selectedRowTable) {
              setDeleteConfirmText('');
              setDeleteTableId(selectedRowTable.id);
            }
            handleCloseRowMenu();
          }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon><DeleteOutlined fontSize="small" color="error" /></ListItemIcon>
          <ListItemText primary="Move to Trash" />
        </MenuItem>
      </Menu>

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

      {/* Record Permanent Delete Modal */}
      <ConfirmDeleteModal
        open={Boolean(deleteRecordTarget)}
        onClose={() => {
          if (!isDeletingRecord) setDeleteRecordTarget(null);
        }}
        onConfirm={confirmPermanentDeleteRecord}
        title="Do you really want to delete the record?"
        description="This action is completely irreversible and will permanently purge the record from database logs."
        confirmText="Yes delete the record"
        cancelText="Cancel.this time"
        loading={isDeletingRecord}
      />
    </Box>
  );
};

export default TableListPage;

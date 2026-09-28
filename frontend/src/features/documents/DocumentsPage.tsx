import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  InputAdornment,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
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
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add,
  CheckCircle,
  CheckCircleOutlined,
  Clear,
  CloudUpload,
  DeleteForeverOutlined,
  DeleteOutlined,
  DescriptionOutlined,
  Download,
  EditNote,
  GridView,
  History,
  KeyboardArrowDown,
  MoreVert,
  PictureAsPdf,
  Refresh,
  RestoreFromTrashOutlined,
  Search,
  TableView,
  Visibility,
} from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';

import { AgGridReact } from 'ag-grid-react';
import {
  AllCommunityModule,
  ColDef,
  GridApi,
  GridReadyEvent,
  ModuleRegistry,
  RowDoubleClickedEvent,
} from 'ag-grid-community';

ModuleRegistry.registerModules([AllCommunityModule]);
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

import { apiClient } from '../../api/client';
import { useThemeMode } from '../../context/ThemeContext';
import { DocumentAuditLogItem, DocumentItem, DocumentListResponse } from '../../types';
import { DocumentStudioModal } from './DocumentStudioModal';
import ConfirmDeleteModal from '../../components/common/ConfirmDeleteModal';

export const DocumentsPage: React.FC = () => {
  const { mode } = useThemeMode();

  // Status view: active, trash, logs
  const [statusTab, setStatusTab] = useState<'active' | 'trash' | 'logs'>('active');
  // Layout mode: table (AG Grid) vs cards
  const [layoutMode, setLayoutMode] = useState<'table' | 'cards'>('table');

  // Documents data
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [trashDocuments, setTrashDocuments] = useState<DocumentItem[]>([]);
  const [trashTotal, setTrashTotal] = useState<number>(0);
  const [auditLogs, setAuditLogs] = useState<DocumentAuditLogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [fileTypeTab, setFileTypeTab] = useState<number>(0); // 0: all, 1: pdf, 2: word

  // Multi-selection for bulk operations
  const [selectedRows, setSelectedRows] = useState<DocumentItem[]>([]);
  const [gridApi, setGridApi] = useState<GridApi | null>(null);

  // Studio Modal state
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [studioOpen, setStudioOpen] = useState<boolean>(false);
  const [studioInitialMode, setStudioInitialMode] = useState<'read' | 'edit'>('read');

  // Upload Modal state
  const [uploadModalOpen, setUploadModalOpen] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Custom Delete Confirmation Modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'soft' | 'permanent' | 'bulk-soft' | 'bulk-permanent';
    id?: string;
    filename?: string;
    count?: number;
  } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<boolean>(false);

  // Fetch documents depending on statusTab
  const fetchActiveDocuments = async () => {
    let fileTypeFilter = '';
    if (fileTypeTab === 1) fileTypeFilter = 'pdf';
    if (fileTypeTab === 2) fileTypeFilter = 'word';

    const res = await apiClient.get<DocumentListResponse>('/attachments', {
      params: {
        search: search.trim() || undefined,
        file_type: fileTypeFilter || undefined,
        is_deleted: false,
        limit: 500,
      },
    });
    setDocuments(res.data.items);
    setTotal(res.data.total);
  };

  const fetchTrashDocuments = async () => {
    let fileTypeFilter = '';
    if (fileTypeTab === 1) fileTypeFilter = 'pdf';
    if (fileTypeTab === 2) fileTypeFilter = 'word';

    const res = await apiClient.get<DocumentListResponse>('/attachments', {
      params: {
        search: search.trim() || undefined,
        file_type: fileTypeFilter || undefined,
        is_deleted: true,
        limit: 500,
      },
    });
    setTrashDocuments(res.data.items);
    setTrashTotal(res.data.total);
  };

  const fetchAuditLogs = async () => {
    const res = await apiClient.get<DocumentAuditLogItem[]>('/attachments/audit-logs', {
      params: { limit: 200 },
    });
    setAuditLogs(res.data);
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    setSelectedRows([]);
    try {
      if (statusTab === 'active') {
        await fetchActiveDocuments();
        // Also fetch trash count in background
        apiClient
          .get<DocumentListResponse>('/attachments', { params: { is_deleted: true, limit: 1 } })
          .then((r) => setTrashTotal(r.data.total))
          .catch(() => {});
      } else if (statusTab === 'trash') {
        await fetchTrashDocuments();
      } else if (statusTab === 'logs') {
        await fetchAuditLogs();
      }
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      const msg = typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
        ? detail.map((e: any) => e.msg || JSON.stringify(e)).join(', ')
        : err.message || 'Failed to load documents data.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, fileTypeTab, statusTab]);

  const handleOpenStudio = (docId: string, mode: 'read' | 'edit') => {
    setActiveDocId(docId);
    setStudioInitialMode(mode);
    setStudioOpen(true);
  };

  // Move document to trash
  const handleSoftDelete = (docId: string, filename: string) => {
    setDeleteTarget({ type: 'soft', id: docId, filename });
    setDeleteModalOpen(true);
  };

  // Restore document from trash
  const handleRestore = async (docId: string) => {
    try {
      await apiClient.post(`/attachments/${docId}/restore`);
      loadData();
    } catch (err: any) {
      alert(`Restore failed: ${err.response?.data?.detail || err.message}`);
    }
  };

  // Permanently erase document
  const handlePermanentDelete = (docId: string, filename: string) => {
    setDeleteTarget({ type: 'permanent', id: docId, filename });
    setDeleteModalOpen(true);
  };

  // Bulk Move to Trash
  const handleBulkSoftDelete = () => {
    if (!selectedRows.length) return;
    setDeleteTarget({ type: 'bulk-soft', count: selectedRows.length });
    setDeleteModalOpen(true);
  };

  // Bulk Restore from Trash
  const handleBulkRestore = async () => {
    if (!selectedRows.length) return;
    try {
      await apiClient.post('/attachments/bulk-restore', {
        attachment_ids: selectedRows.map((r) => r.id),
      });
      loadData();
    } catch (err: any) {
      alert(`Bulk restore failed: ${err.response?.data?.detail || err.message}`);
    }
  };

  // Bulk Permanent Erase
  const handleBulkPermanentDelete = () => {
    if (!selectedRows.length) return;
    setDeleteTarget({ type: 'bulk-permanent', count: selectedRows.length });
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      if (deleteTarget.type === 'soft' && deleteTarget.id) {
        await apiClient.delete(`/attachments/${deleteTarget.id}`);
      } else if (deleteTarget.type === 'permanent' && deleteTarget.id) {
        await apiClient.delete(`/attachments/${deleteTarget.id}/permanent`);
      } else if (deleteTarget.type === 'bulk-soft') {
        await apiClient.post('/attachments/bulk-delete', {
          attachment_ids: selectedRows.map((r) => r.id),
        });
      } else if (deleteTarget.type === 'bulk-permanent') {
        await apiClient.post('/attachments/bulk-permanent', {
          attachment_ids: selectedRows.map((r) => r.id),
        });
      }
      setDeleteModalOpen(false);
      setDeleteTarget(null);
      loadData();
    } catch (err: any) {
      alert(`Deletion failed: ${err.response?.data?.detail || err.message}`);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDownload = (docId: string) => {
    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    window.open(`/api/v1/attachments/${docId}/download?token=${token || ''}`, '_blank');
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await apiClient.post<DocumentItem>('/attachments/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setUploadModalOpen(false);
      setSelectedFile(null);
      loadData();
      if (res.data?.id) {
        handleOpenStudio(res.data.id, 'read');
      }
    } catch (err: any) {
      setUploadError(err.response?.data?.detail || 'Failed to upload document.');
    } finally {
      setUploading(false);
    }
  };

  const isPdf = (filename: string, contentType?: string) =>
    (contentType && contentType.toLowerCase().includes('pdf')) || filename.toLowerCase().endsWith('.pdf');

  // Row Action Menu State
  const [rowMenuAnchorEl, setRowMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedRowDoc, setSelectedRowDoc] = useState<DocumentItem | null>(null);

  const handleOpenRowMenu = (e: React.MouseEvent<HTMLElement>, doc: DocumentItem) => {
    e.stopPropagation();
    setRowMenuAnchorEl(e.currentTarget);
    setSelectedRowDoc(doc);
  };

  const handleCloseRowMenu = () => {
    setRowMenuAnchorEl(null);
    setSelectedRowDoc(null);
  };

  // Filter Pill Dropdown Menu State
  const [filterMenuAnchorEl, setFilterMenuAnchorEl] = useState<null | HTMLElement>(null);

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
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

  const isSelected = (id: string) => selectedRows.some((r) => r.id === id);

  const toggleSelectRow = (doc: DocumentItem) => {
    if (isSelected(doc.id)) {
      setSelectedRows((prev) => prev.filter((r) => r.id !== doc.id));
    } else {
      setSelectedRows((prev) => [...prev, doc]);
    }
  };

  const toggleSelectAll = (items: DocumentItem[]) => {
    if (selectedRows.length === items.length && items.length > 0) {
      setSelectedRows([]);
    } else {
      setSelectedRows([...items]);
    }
  };

  const renderDocumentStatusPill = (doc: DocumentItem) => {
    if (doc.is_deleted) {
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
            bgcolor: mode === 'dark' ? 'rgba(239, 68, 68, 0.15)' : '#fef2f2',
            color: '#ef4444',
            border: '1px solid #fecaca',
          }}
        >
          In Trash
        </Box>
      );
    }
    const pdf = isPdf(doc.original_filename, doc.content_type);
    if (pdf) {
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
          PDF Ready
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
          bgcolor: mode === 'dark' ? 'rgba(37, 99, 235, 0.12)' : '#eff6ff',
          color: mode === 'dark' ? '#60a5fa' : '#2563eb',
          border: mode === 'dark' ? '1px solid rgba(37, 99, 235, 0.3)' : '1px solid #bfdbfe',
        }}
      >
        Word Ready
      </Box>
    );
  };

  // AG Grid Column Definitions for Active Documents
  const activeColDefs: ColDef[] = useMemo(
    () => [
      {
        field: 'id',
        headerName: '',
        checkboxSelection: true,
        headerCheckboxSelection: true,
        width: 48,
        minWidth: 48,
        maxWidth: 52,
        pinned: 'left',
        sortable: false,
        filter: false,
        resizable: false,
      },
      {
        field: 'original_filename',
        headerName: 'Document Name',
        flex: 2,
        minWidth: 260,
        sortable: true,
        filter: true,
        cellRenderer: (params: any) => {
          if (!params.data) return '';
          const pdf = isPdf(params.data.original_filename, params.data.content_type);
          return (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.2,
                cursor: 'pointer',
                fontWeight: 600,
                color: mode === 'dark' ? '#60A5FA' : '#2563EB',
                '&:hover': { textDecoration: 'underline' },
              }}
              onClick={() => handleOpenStudio(params.data.id, 'read')}
            >
              {pdf ? (
                <PictureAsPdf sx={{ color: '#EF4444', fontSize: 20 }} />
              ) : (
                <DescriptionOutlined sx={{ color: '#3B82F6', fontSize: 20 }} />
              )}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {params.data.original_filename}
              </span>
            </Box>
          );
        },
      },
      {
        field: 'content_type',
        headerName: 'Type',
        width: 120,
        sortable: true,
        filter: true,
        cellRenderer: (params: any) => {
          if (!params.data) return '';
          const pdf = isPdf(params.data.original_filename, params.data.content_type);
          return (
            <Chip
              label={pdf ? 'PDF' : 'DOCX'}
              size="small"
              sx={{
                bgcolor: pdf ? 'rgba(239, 68, 68, 0.12)' : 'rgba(59, 130, 246, 0.12)',
                color: pdf ? '#EF4444' : '#3B82F6',
                fontWeight: 700,
                fontSize: '0.72rem',
                height: 22,
              }}
            />
          );
        },
      },
      {
        field: 'file_size_bytes',
        headerName: 'Size',
        width: 110,
        sortable: true,
        filter: true,
        valueFormatter: (params) => {
          if (!params.value) return '0 B';
          const kb = params.value / 1024;
          return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(0)} KB`;
        },
      },
      {
        field: 'version',
        headerName: 'Version',
        width: 100,
        sortable: true,
        cellRenderer: (params: any) => (
          <Chip
            label={`v${params.value || 1}`}
            size="small"
            color="primary"
            variant="outlined"
            sx={{ fontWeight: 700, height: 22, fontSize: '0.72rem' }}
          />
        ),
      },
      {
        field: 'uploaded_by_username',
        headerName: 'Uploaded By',
        width: 140,
        sortable: true,
        filter: true,
        valueGetter: (params) => params.data?.uploaded_by_username || 'System',
      },
      {
        field: 'created_at',
        headerName: 'Created Date',
        width: 160,
        sortable: true,
        valueFormatter: (params) =>
          params.value ? new Date(params.value).toLocaleDateString() + ' ' + new Date(params.value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
      },
      {
        colId: 'actions',
        headerName: 'Actions',
        width: 180,
        pinned: 'right',
        sortable: false,
        filter: false,
        cellRenderer: (params: any) => {
          if (!params.data) return null;
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Tooltip title="Preview & Read Studio">
                <IconButton
                  size="small"
                  color="primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenStudio(params.data.id, 'read');
                  }}
                >
                  <Visibility fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Edit Studio">
                <IconButton
                  size="small"
                  color="secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenStudio(params.data.id, 'edit');
                  }}
                >
                  <EditNote fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Download Original">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownload(params.data.id);
                  }}
                >
                  <Download fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Move to Trash">
                <IconButton
                  size="small"
                  color="error"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSoftDelete(params.data.id, params.data.original_filename);
                  }}
                >
                  <DeleteOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          );
        },
      },
    ],
    [mode]
  );

  // AG Grid Column Definitions for Trash Documents
  const trashColDefs: ColDef[] = useMemo(
    () => [
      {
        field: 'id',
        headerName: '',
        checkboxSelection: true,
        headerCheckboxSelection: true,
        width: 48,
        minWidth: 48,
        maxWidth: 52,
        pinned: 'left',
        sortable: false,
        filter: false,
      },
      {
        field: 'original_filename',
        headerName: 'Document Name',
        flex: 2,
        minWidth: 260,
        sortable: true,
        filter: true,
        cellRenderer: (params: any) => {
          if (!params.data) return '';
          const pdf = isPdf(params.data.original_filename, params.data.content_type);
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, color: 'text.secondary' }}>
              {pdf ? (
                <PictureAsPdf sx={{ color: '#94A3B8', fontSize: 20 }} />
              ) : (
                <DescriptionOutlined sx={{ color: '#94A3B8', fontSize: 20 }} />
              )}
              <span style={{ textDecoration: 'line-through' }}>{params.data.original_filename}</span>
            </Box>
          );
        },
      },
      {
        field: 'content_type',
        headerName: 'Type',
        width: 110,
        sortable: true,
        cellRenderer: (params: any) => {
          const pdf = isPdf(params.data?.original_filename || '', params.data?.content_type);
          return (
            <Chip
              label={pdf ? 'PDF' : 'DOCX'}
              size="small"
              variant="outlined"
              sx={{ height: 22, fontSize: '0.72rem' }}
            />
          );
        },
      },
      {
        field: 'file_size_bytes',
        headerName: 'Size',
        width: 110,
        sortable: true,
        valueFormatter: (params) => {
          if (!params.value) return '0 B';
          const kb = params.value / 1024;
          return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(0)} KB`;
        },
      },
      {
        field: 'deleted_at',
        headerName: 'Deleted At',
        width: 170,
        sortable: true,
        valueFormatter: (params) =>
          params.value ? new Date(params.value).toLocaleDateString() + ' ' + new Date(params.value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently',
      },
      {
        field: 'deleted_by_username',
        headerName: 'Deleted By',
        width: 140,
        sortable: true,
        valueGetter: (params) => params.data?.deleted_by_username || 'User',
      },
      {
        colId: 'actions',
        headerName: 'Actions',
        width: 150,
        pinned: 'right',
        sortable: false,
        filter: false,
        cellRenderer: (params: any) => {
          if (!params.data) return null;
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Tooltip title="Restore back to Active Documents">
                <Button
                  size="small"
                  variant="outlined"
                  color="primary"
                  startIcon={<RestoreFromTrashOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRestore(params.data.id);
                  }}
                  sx={{ py: 0.2, px: 1, fontSize: '0.75rem', textTransform: 'none' }}
                >
                  Restore
                </Button>
              </Tooltip>
              <Tooltip title="Permanently Erase from Disk">
                <IconButton
                  size="small"
                  color="error"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePermanentDelete(params.data.id, params.data.original_filename);
                  }}
                >
                  <DeleteForeverOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          );
        },
      },
    ],
    []
  );

  // AG Grid Column Definitions for Audit & Deletion Logs
  const auditColDefs: ColDef[] = useMemo(
    () => [
      {
        field: 'timestamp',
        headerName: 'Timestamp',
        width: 180,
        sortable: true,
        valueFormatter: (params) =>
          params.value ? new Date(params.value).toLocaleDateString() + ' ' + new Date(params.value).toLocaleTimeString() : '',
      },
      {
        field: 'action',
        headerName: 'Event Action',
        width: 180,
        sortable: true,
        filter: true,
        cellRenderer: (params: any) => {
          const act = params.value || '';
          let color: 'error' | 'success' | 'info' | 'warning' | 'default' = 'default';
          if (act.includes('DELETED')) color = 'error';
          else if (act.includes('UPLOADED')) color = 'success';
          else if (act.includes('EDITED')) color = 'info';
          else if (act.includes('REVERTED')) color = 'warning';

          return <Chip label={act} size="small" color={color} sx={{ fontWeight: 700, fontSize: '0.72rem', height: 22 }} />;
        },
      },
      {
        field: 'filename',
        headerName: 'Document Filename',
        flex: 1.5,
        minWidth: 220,
        sortable: true,
        filter: true,
        valueGetter: (params) => params.data?.filename || params.data?.details?.filename || 'Document',
      },
      {
        field: 'username',
        headerName: 'Actor User',
        width: 140,
        sortable: true,
        filter: true,
      },
      {
        field: 'details',
        headerName: 'Change Details',
        flex: 2,
        minWidth: 240,
        valueFormatter: (params) => {
          if (!params.value) return '';
          return typeof params.value === 'object' ? JSON.stringify(params.value) : String(params.value);
        },
      },
      {
        field: 'ip_address',
        headerName: 'IP Address',
        width: 130,
        sortable: true,
      },
    ],
    []
  );

  return (
    <Box sx={{ width: '100%', py: 1 }}>
      {/* Notifications */}
      {error && (
        <Alert severity="error" sx={{ mb: 2.5, borderRadius: 3 }} onClose={() => setError(null)}>
          {error}
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
          {/* Nav Pills (Active | Trash | Audit Log) */}
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
              onClick={() => setStatusTab('active')}
              sx={{
                borderRadius: '9999px',
                px: 2.5,
                py: 0.8,
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.86rem',
                color: statusTab === 'active' ? '#ffffff' : mode === 'dark' ? '#94a3b8' : '#64748b',
                bgcolor: statusTab === 'active' ? 'primary.main' : 'transparent',
                boxShadow: statusTab === 'active' ? '0 4px 14px rgba(37, 99, 235, 0.35)' : 'none',
                transition: 'all 0.2s',
                '&:hover': {
                  bgcolor: statusTab === 'active' ? 'primary.dark' : mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                },
              }}
            >
              Active Documents {total > 0 && `(${total})`}
            </Button>
            <Button
              onClick={() => setStatusTab('trash')}
              sx={{
                borderRadius: '9999px',
                px: 2.5,
                py: 0.8,
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.86rem',
                color: statusTab === 'trash' ? '#ffffff' : mode === 'dark' ? '#94a3b8' : '#64748b',
                bgcolor: statusTab === 'trash' ? '#ef4444' : 'transparent',
                boxShadow: statusTab === 'trash' ? '0 4px 14px rgba(239, 68, 68, 0.35)' : 'none',
                transition: 'all 0.2s',
                '&:hover': {
                  bgcolor: statusTab === 'trash' ? '#dc2626' : mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                },
              }}
            >
              Trash Documents {trashTotal > 0 && `(${trashTotal})`}
            </Button>
            <Button
              onClick={() => setStatusTab('logs')}
              sx={{
                borderRadius: '9999px',
                px: 2.5,
                py: 0.8,
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.86rem',
                color: statusTab === 'logs' ? '#ffffff' : mode === 'dark' ? '#94a3b8' : '#64748b',
                bgcolor: statusTab === 'logs' ? '#f59e0b' : 'transparent',
                boxShadow: statusTab === 'logs' ? '0 4px 14px rgba(245, 158, 11, 0.35)' : 'none',
                transition: 'all 0.2s',
                '&:hover': {
                  bgcolor: statusTab === 'logs' ? '#d97706' : mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                },
              }}
            >
              Audit Log {auditLogs.length > 0 && `(${auditLogs.length})`}
            </Button>
          </Box>

          {/* Quick Search & Layout Switcher */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <TextField
              size="small"
              placeholder={statusTab === 'active' ? "Search documents..." : statusTab === 'trash' ? "Search trash..." : "Search logs..."}
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
              onChange={(_, v) => v && setLayoutMode(v)}
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
              {statusTab === 'active'
                ? 'Smart Documents'
                : statusTab === 'trash'
                ? 'Trash Documents'
                : 'Document Audit Trails'}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
              {statusTab === 'active'
                ? 'Interactive Word & PDF document management with built-in viewer, editor, and versioning.'
                : statusTab === 'trash'
                ? 'Soft-deleted documents ready to be restored or permanently purged.'
                : 'Complete activity logs tracking uploads, edits, annotations, and removals.'}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            {/* Filter Pill: File Type Dropdown */}
            {statusTab !== 'logs' && (
              <>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={(e) => setFilterMenuAnchorEl(e.currentTarget)}
                  endIcon={<KeyboardArrowDown fontSize="small" />}
                  sx={{
                    borderRadius: '9999px',
                    px: 2,
                    py: 0.7,
                    textTransform: 'none',
                    borderColor: mode === 'dark' ? 'rgba(255,255,255,0.15)' : '#e2e8f0',
                    color: fileTypeTab !== 0 ? 'primary.main' : 'text.secondary',
                    fontWeight: 600,
                    fontSize: '0.84rem',
                    '&:hover': {
                      borderColor: 'primary.main',
                      bgcolor: mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#f8fafc',
                    },
                  }}
                >
                  {fileTypeTab === 0 ? 'All File Types' : fileTypeTab === 1 ? '📄 PDF Files' : '📝 Word (.docx)'}
                </Button>
                <Menu
                  anchorEl={filterMenuAnchorEl}
                  open={Boolean(filterMenuAnchorEl)}
                  onClose={() => setFilterMenuAnchorEl(null)}
                  slotProps={{
                    paper: {
                      elevation: 4,
                      sx: {
                        borderRadius: 3,
                        minWidth: 160,
                        border: mode === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0',
                      },
                    },
                  }}
                >
                  <MenuItem
                    selected={fileTypeTab === 0}
                    onClick={() => {
                      setFileTypeTab(0);
                      setFilterMenuAnchorEl(null);
                    }}
                  >
                    All File Types
                  </MenuItem>
                  <MenuItem
                    selected={fileTypeTab === 1}
                    onClick={() => {
                      setFileTypeTab(1);
                      setFilterMenuAnchorEl(null);
                    }}
                  >
                    📄 PDF Files
                  </MenuItem>
                  <MenuItem
                    selected={fileTypeTab === 2}
                    onClick={() => {
                      setFileTypeTab(2);
                      setFilterMenuAnchorEl(null);
                    }}
                  >
                    📝 Word (.docx)
                  </MenuItem>
                </Menu>
              </>
            )}

            {/* Quick Refresh Button */}
            <Tooltip title="Refresh Documents">
              <IconButton
                size="small"
                onClick={loadData}
                sx={{
                  border: mode === 'dark' ? '1px solid rgba(255,255,255,0.15)' : '1px solid #e2e8f0',
                  borderRadius: '9999px',
                  p: 0.8,
                }}
              >
                <Refresh fontSize="small" />
              </IconButton>
            </Tooltip>

            {/* + Upload Document Primary Button (Active Tab Only) */}
            {statusTab === 'active' && (
              <Button
                variant="contained"
                size="small"
                startIcon={<CloudUpload />}
                onClick={() => setUploadModalOpen(true)}
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
                + Upload Document
              </Button>
            )}
          </Box>
        </Box>

        {/* Bulk Action Banner */}
        {selectedRows.length > 0 && (
          <Paper
            elevation={0}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 2.5,
              py: 1.2,
              mb: 2.5,
              borderRadius: '9999px',
              bgcolor: mode === 'dark' ? 'rgba(37, 99, 235, 0.12)' : '#eff6ff',
              border: '1px solid',
              borderColor: mode === 'dark' ? 'rgba(37, 99, 235, 0.3)' : '#bfdbfe',
              flexWrap: 'wrap',
              gap: 1.5,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <CheckCircle color="primary" fontSize="small" />
              <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                {selectedRows.length} document{selectedRows.length > 1 ? 's' : ''} selected
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {statusTab === 'active' && (
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteOutlined />}
                  onClick={handleBulkSoftDelete}
                  sx={{ borderRadius: '9999px', textTransform: 'none', fontWeight: 600, px: 2 }}
                >
                  Move Selected to Trash ({selectedRows.length})
                </Button>
              )}
              {statusTab === 'trash' && (
                <>
                  <Button
                    size="small"
                    variant="contained"
                    color="primary"
                    startIcon={<RestoreFromTrashOutlined />}
                    onClick={handleBulkRestore}
                    sx={{ borderRadius: '9999px', textTransform: 'none', fontWeight: 600, px: 2 }}
                  >
                    Restore Selected ({selectedRows.length})
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteForeverOutlined />}
                    onClick={handleBulkPermanentDelete}
                    sx={{ borderRadius: '9999px', textTransform: 'none', fontWeight: 600, px: 2 }}
                  >
                    Permanently Delete ({selectedRows.length})
                  </Button>
                </>
              )}
              <Button
                size="small"
                onClick={() => {
                  if (gridApi) gridApi.deselectAll();
                  setSelectedRows([]);
                }}
                sx={{ borderRadius: '9999px', textTransform: 'none' }}
              >
                Deselect All
              </Button>
            </Box>
          </Paper>
        )}

        {/* ========================================================================= */}
        {/* ACTIVE & TRASH DOCUMENTS (TABLE VIEW) */}
        {/* ========================================================================= */}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 8 }}>
            <CircularProgress size={36} />
          </Box>
        ) : statusTab !== 'logs' ? (
          (statusTab === 'active' ? documents : trashDocuments).length === 0 ? (
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
              <DescriptionOutlined sx={{ fontSize: 56, color: 'text.secondary', opacity: 0.3, mb: 2 }} />
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {statusTab === 'active' ? 'No active documents found' : 'Recycle Bin is empty'}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 450, mx: 'auto', mt: 1, mb: 3 }}>
                {statusTab === 'active'
                  ? 'Upload Word (.docx) or PDF files to preview, annotate, or edit in real-time.'
                  : 'Soft-deleted documents will appear here with restoration and permanent purge controls.'}
              </Typography>
              {statusTab === 'active' && (
                <Button
                  variant="contained"
                  startIcon={<CloudUpload />}
                  onClick={() => setUploadModalOpen(true)}
                  sx={{ borderRadius: '9999px', textTransform: 'none', px: 2.8 }}
                >
                  Upload Document
                </Button>
              )}
            </Box>
          ) : layoutMode === 'table' ? (
            /* Bespoke Ultra-Premium Table matching Reference Design */
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
                      <IconButton
                        size="small"
                        onClick={() => toggleSelectAll(statusTab === 'active' ? documents : trashDocuments)}
                        sx={{ p: 0.4 }}
                      >
                        {selectedRows.length > 0 && selectedRows.length === (statusTab === 'active' ? documents : trashDocuments).length ? (
                          <CheckCircle sx={{ color: 'primary.main', fontSize: '1.25rem' }} />
                        ) : (
                          <CheckCircleOutlined sx={{ color: '#0f172a', fontSize: '1.25rem' }} />
                        )}
                      </IconButton>
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
                        <span>Phone / Format</span>
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
                  {(statusTab === 'active' ? documents : trashDocuments).map((doc) => {
                    const schedule = formatSchedule(doc.created_at);
                    const pdf = isPdf(doc.original_filename, doc.content_type);
                    const rowSelected = isSelected(doc.id);
                    return (
                      <TableRow
                        key={doc.id}
                        hover
                        onClick={() => handleOpenStudio(doc.id, 'read')}
                        sx={{
                          cursor: 'pointer',
                          transition: 'background-color 0.15s ease',
                          bgcolor: rowSelected
                            ? mode === 'dark'
                              ? 'rgba(37, 99, 235, 0.08)'
                              : 'rgba(37, 99, 235, 0.04)'
                            : 'inherit',
                          '& td': {
                            borderBottom: mode === 'dark' ? '1px solid rgba(255,255,255,0.04)' : '1px solid #f8fafc',
                            py: 2,
                          },
                          '&:hover': {
                            bgcolor: mode === 'dark' ? 'rgba(255,255,255,0.03)' : '#f8fafc',
                          },
                        }}
                      >
                        {/* Col 1: Circular Checkbox */}
                        <TableCell sx={{ pl: 1 }} onClick={(e) => e.stopPropagation()}>
                          <IconButton size="small" onClick={() => toggleSelectRow(doc)} sx={{ p: 0.4 }}>
                            {rowSelected ? (
                              <CheckCircle sx={{ color: 'primary.main', fontSize: '1.25rem' }} />
                            ) : (
                              <CheckCircleOutlined sx={{ color: '#cbd5e1', fontSize: '1.25rem', '&:hover': { color: '#64748b' } }} />
                            )}
                          </IconButton>
                        </TableCell>

                        {/* Col 2: Avatar + Filename + ID */}
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.8 }}>
                            <Avatar
                              sx={{
                                width: 36,
                                height: 36,
                                fontSize: '0.72rem',
                                fontWeight: 800,
                                background: pdf
                                  ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)'
                                  : 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                                color: '#ffffff',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                              }}
                            >
                              {pdf ? 'PDF' : 'DOC'}
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
                                {doc.original_filename}
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
                                #{doc.id.slice(0, 8)} • {doc.sha256_hash ? doc.sha256_hash.slice(0, 8) : 'file'}
                              </Typography>
                            </Box>
                          </Box>
                        </TableCell>

                        {/* Col 3: Order Details (Document Details) */}
                        <TableCell>
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', lineHeight: 1.25 }}>
                              {formatBytes(doc.file_size_bytes)}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.74rem', display: 'block', mt: 0.3 }}>
                              Version {doc.version} • {doc.versions?.length || 1} Revision{doc.versions?.length !== 1 ? 's' : ''}
                            </Typography>
                          </Box>
                        </TableCell>

                        {/* Col 4: Phone / Format */}
                        <TableCell>
                          <Box>
                            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.84rem' }}>
                              {pdf ? 'Portable Document (PDF)' : 'Word Document (DOCX)'}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.72rem', display: 'block', mt: 0.3 }}>
                              {pdf ? 'Read & Annotate Mode' : 'Full WYSIWYG Editor'}
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
                          {renderDocumentStatusPill(doc)}
                        </TableCell>

                        {/* Col 7: Three-dot Actions */}
                        <TableCell align="right" sx={{ pr: 1 }} onClick={(e) => e.stopPropagation()}>
                          <IconButton
                            size="small"
                            onClick={(e) => handleOpenRowMenu(e, doc)}
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
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: 'repeat(2, 1fr)',
                  md: 'repeat(3, 1fr)',
                  lg: 'repeat(4, 1fr)',
                },
                gap: 2.5,
              }}
            >
              {(statusTab === 'active' ? documents : trashDocuments).map((doc) => {
                const pdf = isPdf(doc.original_filename, doc.content_type);
                return (
                  <Card
                    key={doc.id}
                    variant="outlined"
                    sx={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      borderRadius: 3,
                      p: 1,
                      transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                      '&:hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: mode === 'dark' ? '0 8px 24px rgba(0,0,0,0.5)' : '0 8px 24px rgba(0,0,0,0.08)',
                      },
                    }}
                  >
                    <CardContent sx={{ pb: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                        {pdf ? (
                          <PictureAsPdf sx={{ color: '#EF4444', fontSize: 32 }} />
                        ) : (
                          <DescriptionOutlined sx={{ color: '#3B82F6', fontSize: 32 }} />
                        )}
                        <Chip
                          label={`v${doc.version}`}
                          size="small"
                          color="primary"
                          variant="outlined"
                          sx={{ fontWeight: 700 }}
                        />
                      </Box>
                      <Typography
                        variant="subtitle1"
                        sx={{
                          fontWeight: 700,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          mb: 0.5,
                        }}
                        title={doc.original_filename}
                      >
                        {doc.original_filename}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {formatBytes(doc.file_size_bytes)} • {new Date(doc.created_at).toLocaleDateString()}
                      </Typography>
                    </CardContent>

                    <Divider />

                    <CardActions sx={{ justifyContent: 'space-between', px: 2, py: 1 }}>
                      {statusTab === 'active' ? (
                        <>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            <Button
                              size="small"
                              startIcon={<Visibility fontSize="small" />}
                              onClick={() => handleOpenStudio(doc.id, 'read')}
                            >
                              Read
                            </Button>
                            <Button
                              size="small"
                              startIcon={<EditNote fontSize="small" />}
                              color="secondary"
                              onClick={() => handleOpenStudio(doc.id, 'edit')}
                            >
                              Edit
                            </Button>
                          </Box>
                          <Box>
                            <IconButton size="small" onClick={() => handleDownload(doc.id)}>
                              <Download fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleSoftDelete(doc.id, doc.original_filename)}
                            >
                              <DeleteOutlined fontSize="small" />
                            </IconButton>
                          </Box>
                        </>
                      ) : (
                        <>
                          <Button
                            size="small"
                            startIcon={<RestoreFromTrashOutlined />}
                            onClick={() => handleRestore(doc.id)}
                          >
                            Restore
                          </Button>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handlePermanentDelete(doc.id, doc.original_filename)}
                          >
                            <DeleteForeverOutlined fontSize="small" />
                          </IconButton>
                        </>
                      )}
                    </CardActions>
                  </Card>
                );
              })}
            </Box>
          )
        ) : (
          /* ========================================================================= */
          /* AUDIT LOG TAB (TABLE VIEW) */
          /* ========================================================================= */
          auditLogs.length === 0 ? (
            <Box sx={{ p: 8, textAlign: 'center', borderRadius: 4, border: '1px dashed', borderColor: 'divider' }}>
              <History sx={{ fontSize: 56, color: 'text.disabled', mb: 1.5 }} />
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                No Audit Logs Recorded
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                Audit events are automatically recorded whenever documents are uploaded, edited, or removed.
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
                        <span>Document Filename</span>
                        <Typography sx={{ color: '#cbd5e1', fontSize: '0.8rem' }}>:</Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem', color: '#64748b' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 2 }}>
                        <span>Actor / User</span>
                        <Typography sx={{ color: '#cbd5e1', fontSize: '0.8rem' }}>:</Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem', color: '#64748b' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 2 }}>
                        <span>Change Details</span>
                        <Typography sx={{ color: '#cbd5e1', fontSize: '0.8rem' }}>:</Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem', color: '#64748b' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 2 }}>
                        <span>Schedule / Timestamp</span>
                        <Typography sx={{ color: '#cbd5e1', fontSize: '0.8rem' }}>:</Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem', color: '#64748b' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 2 }}>
                        <span>Event Action</span>
                        <Typography sx={{ color: '#cbd5e1', fontSize: '0.8rem' }}>:</Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {auditLogs.map((log) => {
                    const schedule = formatSchedule(log.timestamp);
                    const act = log.action || '';
                    let pillColor = '#2563eb';
                    let pillBg = 'rgba(37, 99, 235, 0.12)';
                    if (act.includes('DELETED')) {
                      pillColor = '#ef4444';
                      pillBg = 'rgba(239, 68, 68, 0.12)';
                    } else if (act.includes('UPLOADED')) {
                      pillColor = '#10b981';
                      pillBg = 'rgba(16, 185, 129, 0.12)';
                    } else if (act.includes('EDITED')) {
                      pillColor = '#f59e0b';
                      pillBg = 'rgba(245, 158, 11, 0.12)';
                    }
                    return (
                      <TableRow
                        key={log.id}
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
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                            {log.filename || (log.details && typeof log.details === 'object' ? log.details.filename : null) || 'Document'}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace', fontSize: '0.72rem' }}>
                            ID #{String(log.id || '').slice(0, 8)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {log.username || 'Administrator'}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
                            IP: {log.ip_address || '127.0.0.1'}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ maxWidth: 300 }}>
                          <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {log.details ? (typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details)) : 'No metadata'}
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
                              bgcolor: pillBg,
                              color: pillColor,
                            }}
                          >
                            {act}
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )
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
            Showing {statusTab === 'active' ? documents.length : statusTab === 'trash' ? trashDocuments.length : auditLogs.length} items • Real-time synchronization active
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" sx={{ color: 'text.disabled' }}>
              Document Studio 2.0
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
              minWidth: 200,
              boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
              border: mode === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0',
              py: 0.5,
            },
          },
        }}
      >
        {selectedRowDoc && !selectedRowDoc.is_deleted ? (
          <>
            <MenuItem
              onClick={() => {
                if (selectedRowDoc) handleOpenStudio(selectedRowDoc.id, 'read');
                handleCloseRowMenu();
              }}
            >
              <ListItemIcon><Visibility fontSize="small" color="primary" /></ListItemIcon>
              <ListItemText primary="Read / Preview" />
            </MenuItem>
            <MenuItem
              onClick={() => {
                if (selectedRowDoc) handleOpenStudio(selectedRowDoc.id, 'edit');
                handleCloseRowMenu();
              }}
            >
              <ListItemIcon><EditNote fontSize="small" color="secondary" /></ListItemIcon>
              <ListItemText primary="Open in Studio Editor" />
            </MenuItem>
            <MenuItem
              onClick={() => {
                if (selectedRowDoc) handleDownload(selectedRowDoc.id);
                handleCloseRowMenu();
              }}
            >
              <ListItemIcon><Download fontSize="small" /></ListItemIcon>
              <ListItemText primary="Download File" />
            </MenuItem>
            <Divider sx={{ my: 0.5 }} />
            <MenuItem
              onClick={() => {
                if (selectedRowDoc) handleSoftDelete(selectedRowDoc.id, selectedRowDoc.original_filename);
                handleCloseRowMenu();
              }}
              sx={{ color: 'error.main' }}
            >
              <ListItemIcon><DeleteOutlined fontSize="small" color="error" /></ListItemIcon>
              <ListItemText primary="Move to Trash" />
            </MenuItem>
          </>
        ) : (
          <>
            <MenuItem
              onClick={() => {
                if (selectedRowDoc) handleRestore(selectedRowDoc.id);
                handleCloseRowMenu();
              }}
            >
              <ListItemIcon><RestoreFromTrashOutlined fontSize="small" color="primary" /></ListItemIcon>
              <ListItemText primary="Restore Document" />
            </MenuItem>
            <Divider sx={{ my: 0.5 }} />
            <MenuItem
              onClick={() => {
                if (selectedRowDoc) handlePermanentDelete(selectedRowDoc.id, selectedRowDoc.original_filename);
                handleCloseRowMenu();
              }}
              sx={{ color: 'error.main' }}
            >
              <ListItemIcon><DeleteForeverOutlined fontSize="small" color="error" /></ListItemIcon>
              <ListItemText primary="Delete Forever" />
            </MenuItem>
          </>
        )}
      </Menu>

      {/* Document Studio Fullscreen Modal */}
      <DocumentStudioModal
        open={studioOpen}
        documentId={activeDocId}
        initialMode={studioInitialMode}
        onClose={() => setStudioOpen(false)}
        onDocumentUpdated={loadData}
      />

      {/* Upload Document Dialog */}
      <Dialog open={uploadModalOpen} onClose={() => !uploading && setUploadModalOpen(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleUploadSubmit}>
          <DialogTitle sx={{ fontWeight: 700 }}>Upload Word or PDF Document</DialogTitle>
          <DialogContent>
            {uploadError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {uploadError}
              </Alert>
            )}

            <Box
              sx={{
                border: '2px dashed',
                borderColor: selectedFile ? 'primary.main' : 'divider',
                borderRadius: 2,
                p: 4,
                textAlign: 'center',
                bgcolor: selectedFile ? 'action.hover' : 'background.paper',
                cursor: 'pointer',
                position: 'relative',
              }}
            >
              <input
                type="file"
                accept=".pdf,.docx,.doc"
                required
                onChange={(e) => {
                  if (e.target.files?.[0]) setSelectedFile(e.target.files[0]);
                }}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  opacity: 0,
                  cursor: 'pointer',
                }}
              />
              <CloudUpload sx={{ fontSize: 44, color: selectedFile ? 'primary.main' : 'text.secondary', mb: 1 }} />
              {selectedFile ? (
                <>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    {selectedFile.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {(selectedFile.size / 1024).toFixed(1)} KB • Click to change file
                  </Typography>
                </>
              ) : (
                <>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Choose a PDF (.pdf) or Word (.docx) file
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Drag and drop or click to browse files
                  </Typography>
                </>
              )}
            </Box>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button disabled={uploading} onClick={() => setUploadModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={!selectedFile || uploading}>
              {uploading ? <CircularProgress size={22} /> : 'Upload & Open'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Bespoke Delete Confirmation Modal matching User Reference Image */}
      <ConfirmDeleteModal
        open={deleteModalOpen}
        onClose={() => {
          if (!deleteLoading) {
            setDeleteModalOpen(false);
            setDeleteTarget(null);
          }
        }}
        onConfirm={handleConfirmDelete}
        title={
          deleteTarget?.type === 'permanent' || deleteTarget?.type === 'bulk-permanent'
            ? 'Permanently delete the file?'
            : 'Do you really want to delete the file?'
        }
        description={
          deleteTarget?.filename
            ? deleteTarget.type === 'permanent'
              ? `"${deleteTarget.filename}" and all version snapshots will be permanently erased. This cannot be undone.`
              : `Move "${deleteTarget.filename}" to Recycle Bin? You can restore it anytime.`
            : deleteTarget?.count
            ? deleteTarget.type === 'bulk-permanent'
              ? `Permanently erase ${deleteTarget.count} selected documents? This cannot be undone.`
              : `Move ${deleteTarget.count} selected documents to Recycle Bin?`
            : undefined
        }
        confirmText={
          deleteTarget?.type === 'permanent' || deleteTarget?.type === 'bulk-permanent'
            ? 'Yes, permanently delete'
            : 'Yes delete the file'
        }
        cancelText="Cancel.this time"
        loading={deleteLoading}
      />
    </Box>
  );
};

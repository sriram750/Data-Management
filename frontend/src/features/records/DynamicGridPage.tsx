import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
  InputLabel,
  Menu,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add,
  AdminPanelSettingsOutlined,
  ArrowDropDown,
  ArrowDropUp,
  CheckBoxOutlineBlank,
  CheckCircleOutlined,
  ChevronLeft,
  ChevronRight,
  Clear,
  ContentCopy,
  DeleteForeverOutlined,
  DeleteOutlined,
  DensityLarge,
  DensityMedium,
  DensitySmall,
  EditOutlined,
  FileDownloadOutlined,
  FileUploadOutlined,
  FilterList,
  FilterListOff,
  FirstPage,
  FitScreen,
  Fullscreen,
  FullscreenExit,
  KeyOutlined,
  LastPage,
  LockOutlined,
  MailOutlined,
  OpenInNew,
  PlaylistAdd,
  Print,
  Redo,
  Refresh,
  Remove,
  RestoreFromTrashOutlined,
  Search,
  SecurityOutlined,
  SettingsOutlined,
  TableView,
  Undo,
  ViewColumn,
  Visibility,
  VisibilityOff,
  VisibilityOutlined,
} from '@mui/icons-material';

import { AgGridReact } from 'ag-grid-react';
import {
  AllCommunityModule,
  CellValueChangedEvent,
  ColDef,
  GridApi,
  GridReadyEvent,
  ModuleRegistry,
  RowDoubleClickedEvent,
  SelectionChangedEvent,
  ValueGetterParams,
} from 'ag-grid-community';

ModuleRegistry.registerModules([AllCommunityModule]);
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

import { apiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useThemeMode } from '../../context/ThemeContext';
import { ColumnType, DataRecord, DataTable } from '../../types';
import RecordDrawer from './RecordDrawer';
import RecordHistoryModal from './RecordHistoryModal';
import DeletedRecordsModal from './DeletedRecordsModal';
import TableSettingsModal from '../tables/TableSettingsModal';
import TablePermissionsModal from '../tables/TablePermissionsModal';
import ExportModal from '../exports/ExportModal';

type DensityMode = 'compact' | 'standard' | 'comfortable';

const DENSITY_SETTINGS: Record<DensityMode, { row: number; header: number; label: string }> = {
  compact: { row: 28, header: 32, label: 'Compact' },
  standard: { row: 34, header: 36, label: 'Standard' },
  comfortable: { row: 42, header: 42, label: 'Comfortable' },
};

const ALL_COLUMN_TYPES: { type: ColumnType; label: string; desc: string }[] = [
  { type: 'MIXED', label: 'Mixed / Alphanumeric (123, N@R, DFJR)', desc: 'Mixed data: numbers, symbols, letters, codes' },
  { type: 'TEXT', label: 'Single Line Text', desc: 'Standard short text strings' },
  { type: 'LONG_TEXT', label: 'Long Text / Notes', desc: 'Multi-line notes and descriptions' },
  { type: 'NUMBER', label: 'Integer Number', desc: 'Whole integer numbers e.g. count, port' },
  { type: 'DECIMAL', label: 'Decimal Number', desc: 'Floating point numbers' },
  { type: 'CURRENCY', label: 'Currency ($)', desc: 'Monetary values e.g. $1,250.00' },
  { type: 'PASSWORD', label: 'Password / Vault Secret', desc: 'AES-256 encrypted, masked secret' },
  { type: 'DATE', label: 'Date', desc: 'Calendar date YYYY-MM-DD' },
  { type: 'DATETIME', label: 'Date & Time', desc: 'Full timestamp with time' },
  { type: 'BOOLEAN', label: 'Boolean (Yes/No)', desc: 'Toggle switch' },
  { type: 'EMAIL', label: 'Email Address', desc: 'Validated email format' },
  { type: 'PHONE', label: 'Phone Number', desc: 'Telephone number' },
  { type: 'IP_ADDRESS', label: 'IP Address', desc: 'IPv4 network address' },
  { type: 'URL', label: 'Web URL', desc: 'Clickable hyperlink' },
  { type: 'DROPDOWN', label: 'Dropdown Select', desc: 'Single choice from list' },
  { type: 'MULTI_SELECT', label: 'Multi-Select', desc: 'Multiple choices from list' },
];

export const DynamicGridPage: React.FC = () => {
  const { tableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { mode } = useThemeMode();

  const [table, setTable] = useState<DataTable | null>(null);
  const [records, setRecords] = useState<DataRecord[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);

  // Pagination and Search (-1 indicates "All" records)
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [gridApi, setGridApi] = useState<GridApi | null>(null);
  const [selectedRows, setSelectedRows] = useState<DataRecord[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // AG Grid Specific Controls
  const [density, setDensity] = useState<DensityMode>('standard');
  const [showFloatingFilters, setShowFloatingFilters] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState<Record<string, boolean>>({});

  // Menu Anchors
  const [columnMenuAnchor, setColumnMenuAnchor] = useState<null | HTMLElement>(null);
  const [densityMenuAnchor, setDensityMenuAnchor] = useState<null | HTMLElement>(null);

  // Quick Add Column Modal State
  const [isAddColumnOpen, setIsAddColumnOpen] = useState(false);
  const [newColDisplayName, setNewColDisplayName] = useState('');
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState<ColumnType>('MIXED');
  const [newColRequired, setNewColRequired] = useState(false);
  const [newColSensitive, setNewColSensitive] = useState(false);
  const [newColDefaultValue, setNewColDefaultValue] = useState('');
  const [addingColLoading, setAddingColLoading] = useState(false);
  const [addingColError, setAddingColError] = useState<string | null>(null);

  // Delete Table Modal State
  const [deleteTableConfirmOpen, setDeleteTableConfirmOpen] = useState(false);
  const [deleteTableConfirmText, setDeleteTableConfirmText] = useState('');
  const [isDeletingTable, setIsDeletingTable] = useState(false);

  // Modals state
  const [isRecordDrawerOpen, setIsRecordDrawerOpen] = useState(false);
  const [selectedRecordForEdit, setSelectedRecordForEdit] = useState<DataRecord | null>(null);
  const [historyRecordId, setHistoryRecordId] = useState<string | null>(null);
  const [isDeletedRecordsOpen, setIsDeletedRecordsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPermissionsOpen, setIsPermissionsOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [deleteSingleRecordId, setDeleteSingleRecordId] = useState<string | null>(null);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, string>>({});
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  // Cell Edit Undo/Redo Stacks
  const [undoStack, setUndoStack] = useState<
    Array<{ recordId: string; colName: string; prevValue: any; newValue: any }>
  >([]);
  const [redoStack, setRedoStack] = useState<
    Array<{ recordId: string; colName: string; prevValue: any; newValue: any }>
  >([]);

  // Table Lock & Password Protection State
  const [tableLockedPrompt, setTableLockedPrompt] = useState(false);
  const [promptPassword, setPromptPassword] = useState('');
  const [promptShowPassword, setPromptShowPassword] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [promptUnlocking, setPromptUnlocking] = useState(false);

  const fetchTableAndRecords = async () => {
    if (!tableId) return;
    setLoading(true);
    try {
      // 1. Fetch table metadata
      const tRes = await apiClient.get<DataTable>(`/tables/${tableId}`);
      setTable(tRes.data);

      const cachedPassword = sessionStorage.getItem(`table_unlocked_${tableId}`);

      if ((tRes.data.is_locked || tRes.data.has_password) && !cachedPassword) {
        setTableLockedPrompt(true);
        setLoading(false);
        return;
      }

      // 2. Fetch records with pagination (support 500 & All records)
      const effectivePageSize = pageSize === -1 ? 100000 : pageSize;
      const effectivePage = pageSize === -1 ? 1 : page;

      const headers: Record<string, string> = {};
      if (cachedPassword) {
        headers['X-Table-Password'] = cachedPassword;
      }

      const rRes = await apiClient.get<{ items: DataRecord[]; total: number }>(
        `/tables/${tableId}/records`,
        {
          headers,
          params: {
            search: search || undefined,
            page: effectivePage,
            page_size: effectivePageSize,
          },
        }
      );
      setRecords(rRes.data.items);
      setTotalRecords(rRes.data.total);
      setTableLockedPrompt(false);
    } catch (err: any) {
      if (err.response?.status === 403 && (err.response?.data?.detail?.includes('TABLE_LOCKED') || err.response?.data?.detail?.includes('locked'))) {
        setTableLockedPrompt(true);
      } else {
        console.error('Failed to load table and records', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUnlockTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableId || !promptPassword.trim()) return;
    setPromptUnlocking(true);
    setPromptError(null);
    try {
      await apiClient.post(`/tables/${tableId}/unlock`, {
        password: promptPassword.trim(),
      });
      sessionStorage.setItem(`table_unlocked_${tableId}`, promptPassword.trim());
      setTableLockedPrompt(false);
      await fetchTableAndRecords();
    } catch (err: any) {
      setPromptError(err.response?.data?.detail || 'Incorrect table password.');
    } finally {
      setPromptUnlocking(false);
    }
  };

  useEffect(() => {
    fetchTableAndRecords();
  }, [tableId, search, page, pageSize]);

  // Quick Add Column Handler
  const handleOpenAddColumn = () => {
    setNewColDisplayName('');
    setNewColName('');
    setNewColType('MIXED');
    setNewColRequired(false);
    setNewColSensitive(false);
    setNewColDefaultValue('');
    setAddingColError(null);
    setIsAddColumnOpen(true);
  };

  const handleCreateColumn = async () => {
    if (!tableId || !newColDisplayName.trim()) {
      setAddingColError('Column display name is required.');
      return;
    }
    const slugKey = newColName.trim() || newColDisplayName.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');
    setAddingColLoading(true);
    setAddingColError(null);
    try {
      await apiClient.post(`/tables/${tableId}/columns`, {
        name: slugKey,
        display_name: newColDisplayName.trim(),
        data_type: newColType,
        is_required: newColRequired,
        is_sensitive: newColSensitive,
        default_value: newColDefaultValue.trim() || null,
        display_order: (table?.columns.length || 0) + 1,
      });
      setIsAddColumnOpen(false);
      setSnackbarMessage(`Column '${newColDisplayName}' created successfully!`);
      await fetchTableAndRecords();
    } catch (err: any) {
      setAddingColError(err.response?.data?.detail || 'Failed to add column.');
    } finally {
      setAddingColLoading(false);
    }
  };

  // Delete Table Handler (Move to Trash)
  const handleDeleteTable = async () => {
    if (!tableId) return;
    setIsDeletingTable(true);
    try {
      await apiClient.delete(`/tables/${tableId}`);
      setDeleteTableConfirmOpen(false);
      navigate('/tables');
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete table.');
    } finally {
      setIsDeletingTable(false);
    }
  };

  const handleRevealSecret = async (recId: string, colId: string, colName: string) => {
    const secretKey = `${recId}_${colName}`;
    if (revealedSecrets[secretKey]) {
      setRevealedSecrets((prev) => {
        const copy = { ...prev };
        delete copy[secretKey];
        return copy;
      });
      return;
    }

    try {
      const res = await apiClient.post<{ plaintext_value: string }>(
        `/tables/${tableId}/records/${recId}/columns/${colId}/reveal-secret`,
        {}
      );
      setRevealedSecrets((prev) => ({ ...prev, [secretKey]: res.data.plaintext_value }));

      // Auto-hide after 30 seconds for security
      setTimeout(() => {
        setRevealedSecrets((prev) => {
          const copy = { ...prev };
          delete copy[secretKey];
          return copy;
        });
      }, 30000);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to reveal secret.');
    }
  };

  const handleCopySecret = (text: string) => {
    navigator.clipboard.writeText(text);
    setSnackbarMessage('Copied to clipboard!');
  };

  const handleDeleteSingle = async () => {
    if (!deleteSingleRecordId) return;
    try {
      await apiClient.delete(`/records/${deleteSingleRecordId}`);
      setDeleteSingleRecordId(null);
      fetchTableAndRecords();
      setSnackbarMessage('Record moved to trash successfully.');
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete record.');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedRows.length === 0 || !tableId) return;
    try {
      await apiClient.post(`/tables/${tableId}/records/bulk-delete`, {
        record_ids: selectedRows.map((r) => r.id),
      });
      setBulkDeleteConfirmOpen(false);
      setSelectedRows([]);
      if (gridApi) {
        gridApi.deselectAll();
      }
      fetchTableAndRecords();
      setSnackbarMessage(`${selectedRows.length} records moved to trash.`);
    } catch (err) {
      console.error('Bulk delete failed', err);
    }
  };

  const handleExportCsv = () => {
    if (!gridApi || !table) return;
    gridApi.exportDataAsCsv({
      fileName: `${table.name || 'records'}_export.csv`,
    });
    setSnackbarMessage('Exporting CSV from AG Grid...');
  };

  const handleExportSelected = () => {
    if (!gridApi || !table || selectedRows.length === 0) return;
    gridApi.exportDataAsCsv({
      onlySelected: true,
      fileName: `${table.name || 'records'}_selected.csv`,
    });
    setSnackbarMessage(`Exporting ${selectedRows.length} selected rows...`);
  };

  const handleToggleColumnVisibility = (colName: string) => {
    const isCurrentlyHidden = Boolean(hiddenColumns[colName]);
    const newHiddenState = !isCurrentlyHidden;
    setHiddenColumns((prev) => ({ ...prev, [colName]: newHiddenState }));

    if (gridApi) {
      gridApi.setColumnsVisible([`data.${colName}`], !newHiddenState);
    }
  };

  const handleShowAllColumns = () => {
    setHiddenColumns({});
    if (gridApi && table) {
      const colIds = table.columns.map((c) => `data.${c.name}`);
      gridApi.setColumnsVisible(colIds, true);
    }
  };

  const handleAutoSizeAll = () => {
    if (gridApi) {
      gridApi.autoSizeAllColumns();
      setSnackbarMessage('Columns auto-sized to content');
    }
  };

  const handleSizeColumnsToFit = () => {
    if (gridApi) {
      gridApi.sizeColumnsToFit();
      setSnackbarMessage('Columns fit to screen');
    }
  };

  // AG Grid Default Column Definition with strict overflow and text clipping
  const defaultColDef: ColDef = useMemo(() => {
    return {
      sortable: true,
      filter: true,
      floatingFilter: showFloatingFilters,
      resizable: true,
      minWidth: 150,
      flex: 1,
      cellStyle: {
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        minWidth: 0,
        maxWidth: '100%',
        display: 'flex',
        alignItems: 'center',
      },
    };
  }, [showFloatingFilters]);

  // Cell Edit Handler (In-Place Double Click Edit)
  const handleCellValueChanged = async (event: CellValueChangedEvent) => {
    const colName = event.colDef.field?.replace('data.', '') || '';
    if (!colName || event.oldValue === event.newValue) return;
    const record = event.data;
    if (!record || !record.id) return;

    const prevValue = event.oldValue;
    const newValue = event.newValue;

    setUndoStack((prev) => [...prev, { recordId: record.id, colName, prevValue, newValue }]);
    setRedoStack([]);

    try {
      const updatedData = {
        ...record.data,
        [colName]: newValue,
      };
      await apiClient.put(`/records/${record.id}`, { data: updatedData });
      setSnackbarMessage(`Saved cell edit on ${event.colDef.headerName || colName}`);
    } catch (err: any) {
      console.error('Failed to save cell edit', err);
      setSnackbarMessage('Failed to save edit: ' + (err.response?.data?.detail || err.message));
      event.node.setDataValue(event.colDef.field!, prevValue);
    }
  };

  // Rail Action: Undo
  const handleUndo = async () => {
    if (undoStack.length === 0) return;
    const lastEdit = undoStack[undoStack.length - 1];
    const nextUndo = undoStack.slice(0, -1);
    setUndoStack(nextUndo);
    setRedoStack((prev) => [...prev, lastEdit]);

    try {
      const record = records.find((r) => r.id === lastEdit.recordId);
      if (record) {
        const updatedData = {
          ...record.data,
          [lastEdit.colName]: lastEdit.prevValue,
        };
        await apiClient.put(`/records/${lastEdit.recordId}`, { data: updatedData });
        if (gridApi) {
          const rowNode = gridApi.getRowNode(lastEdit.recordId);
          if (rowNode) {
            rowNode.setDataValue(`data.${lastEdit.colName}`, lastEdit.prevValue);
          }
        }
        setSnackbarMessage(`Undid edit on ${lastEdit.colName}`);
      }
    } catch (err) {
      console.error('Failed to undo edit', err);
    }
  };

  // Rail Action: Redo
  const handleRedo = async () => {
    if (redoStack.length === 0) return;
    const lastRedo = redoStack[redoStack.length - 1];
    const nextRedo = redoStack.slice(0, -1);
    setRedoStack(nextRedo);
    setUndoStack((prev) => [...prev, lastRedo]);

    try {
      const record = records.find((r) => r.id === lastRedo.recordId);
      if (record) {
        const updatedData = {
          ...record.data,
          [lastRedo.colName]: lastRedo.newValue,
        };
        await apiClient.put(`/records/${lastRedo.recordId}`, { data: updatedData });
        if (gridApi) {
          const rowNode = gridApi.getRowNode(lastRedo.recordId);
          if (rowNode) {
            rowNode.setDataValue(`data.${lastRedo.colName}`, lastRedo.newValue);
          }
        }
        setSnackbarMessage(`Redid edit on ${lastRedo.colName}`);
      }
    } catch (err) {
      console.error('Failed to redo edit', err);
    }
  };

  // Rail Action: Duplicate selected row
  const handleDuplicateSelectedRow = async () => {
    if (selectedRows.length === 0 || !table) return;
    const firstSelected = selectedRows[0];
    try {
      setLoading(true);
      await apiClient.post(`/tables/${table.id}/records`, {
        data: { ...firstSelected.data },
      });
      setSnackbarMessage('Duplicated selected row');
      await fetchTableAndRecords();
    } catch (err: any) {
      setSnackbarMessage('Failed to duplicate row: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  // Rail Action: Edit selected record in drawer
  const handleEditSelectedRow = () => {
    if (selectedRows.length === 0) return;
    setSelectedRecordForEdit(selectedRows[0]);
    setIsRecordDrawerOpen(true);
  };

  // Rail Action: Inspect selected record history
  const handleInspectSelectedRow = () => {
    if (selectedRows.length === 0) return;
    setHistoryRecordId(selectedRows[0].id);
  };

  // Rail Action: Select all or toggle selection
  const handleToggleSelectAllOrFilters = () => {
    if (!gridApi) return;
    if (selectedRows.length === records.length && records.length > 0) {
      gridApi.deselectAll();
      setSelectedRows([]);
    } else {
      gridApi.selectAll();
    }
  };

  // Rail Action: Scroll Up / Down
  const handleScrollGrid = (direction: 'up' | 'down') => {
    if (!gridApi) return;
    const firstIdx = gridApi.getFirstDisplayedRowIndex?.() ?? 0;
    const targetIdx = direction === 'up' ? Math.max(0, firstIdx - 8) : firstIdx + 8;
    gridApi.ensureIndexVisible(targetIdx, 'top');
  };

  const editableColsCount = useMemo(() => {
    if (!table) return 0;
    return table.columns.filter((c) => !c.is_sensitive && c.data_type !== 'PASSWORD' && c.data_type !== 'FILE').length;
  }, [table]);

  // AG Grid Column Definitions
  const columnDefs: ColDef[] = useMemo(() => {
    if (!table) return [];

    const defs: ColDef[] = [];

    // Optional Checkbox selection column if explicitly enabled in column settings
    if (hiddenColumns['__select__'] === true) {
      defs.push({
        field: '__select__',
        headerName: '',
        checkboxSelection: true,
        headerCheckboxSelection: true,
        width: 44,
        minWidth: 44,
        maxWidth: 48,
        pinned: 'left',
        sortable: false,
        filter: false,
        resizable: false,
      });
    }

    // Optional Row Index column if explicitly enabled
    if (hiddenColumns['__index__'] === true) {
      defs.push({
        field: '__index__',
        headerName: '#',
        width: 55,
        minWidth: 50,
        maxWidth: 65,
        pinned: 'left',
        sortable: false,
        filter: false,
        resizable: false,
        cellStyle: {
          fontWeight: 600,
          color: mode === 'dark' ? '#94A3B8' : '#64748B',
          fontSize: '0.8rem',
          fontFamily: 'monospace',
          display: 'flex',
          alignItems: 'center',
        },
        valueGetter: (params: ValueGetterParams) => {
          if (params.node?.rowIndex === undefined || params.node?.rowIndex === null) return '';
          const baseOffset = pageSize === -1 ? 0 : (page - 1) * pageSize;
          return baseOffset + params.node.rowIndex + 1;
        },
      });
    }

    // Dynamic Columns from Table Schema (Starts directly with Circuit/first column matching reference design)
    table.columns.forEach((col) => {
      const isHidden = Boolean(hiddenColumns[col.name]);
      const isNumeric = col.data_type === 'NUMBER' || col.data_type === 'DECIMAL' || col.data_type === 'CURRENCY';
      const colDef: ColDef = {
        colId: `data.${col.name}`,
        headerName: col.display_name,
        field: `data.${col.name}`,
        sortable: true,
        filter: true,
        resizable: true,
        editable: !col.is_sensitive && col.data_type !== 'PASSWORD' && col.data_type !== 'FILE',
        minWidth: 95,
        hide: isHidden,
        headerClass: isNumeric ? 'ag-right-aligned-header' : undefined,
        tooltipValueGetter: (params) => {
          const val = params.value;
          if (val === null || val === undefined || val === '') return '';
          return String(val);
        },
        cellStyle: {
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
          maxWidth: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isNumeric ? 'flex-end' : 'flex-start',
          textAlign: isNumeric ? 'right' : 'left',
          ...(isNumeric ? { fontVariantNumeric: 'tabular-nums' } : {}),
        },
      };

      // Set specialized filter type and formatters per column data type
      if (col.data_type === 'NUMBER') {
        colDef.filter = 'agNumberColumnFilter';
        colDef.valueFormatter = (params) => {
          if (params.value === null || params.value === undefined || params.value === '') return '';
          const num = Number(params.value);
          return isNaN(num) ? String(params.value) : num.toLocaleString();
        };
      } else if (col.data_type === 'CURRENCY') {
        colDef.filter = 'agNumberColumnFilter';
        colDef.valueFormatter = (params) => {
          if (params.value === null || params.value === undefined || params.value === '') return '';
          const num = Number(params.value);
          return isNaN(num)
            ? String(params.value)
            : '£' + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        };
      } else if (col.data_type === 'DECIMAL') {
        colDef.filter = 'agNumberColumnFilter';
        colDef.valueFormatter = (params) => {
          if (params.value === null || params.value === undefined || params.value === '') return '';
          const num = Number(params.value);
          return isNaN(num) ? String(params.value) : num.toLocaleString(undefined, { minimumFractionDigits: 2 });
        };
      } else if (col.data_type === 'DATE' || col.data_type === 'DATETIME') {
        colDef.filter = 'agDateColumnFilter';
      } else {
        colDef.filter = 'agTextColumnFilter';
      }

      // Status column custom text styling matching reference image
      if (col.name.toLowerCase() === 'status') {
        colDef.cellRenderer = (params: any) => {
          const val = params.value;
          if (val === null || val === undefined || val === '') return '';
          const strVal = String(val).toLowerCase().trim();
          let color = mode === 'dark' ? '#F1F5F9' : '#1E293B';
          let fontWeight = 500;
          if (strVal === 'live') {
            color = mode === 'dark' ? '#34D399' : '#059669';
            fontWeight = 600;
          } else if (strVal === 'ceased') {
            color = mode === 'dark' ? '#94A3B8' : '#64748B';
          } else if (strVal === 'provisioning') {
            color = mode === 'dark' ? '#FBBF24' : '#D97706';
            fontWeight = 600;
          }
          return (
            <Typography
              variant="body2"
              component="span"
              sx={{ color, fontWeight, fontSize: '0.85rem' }}
            >
              {String(val)}
            </Typography>
          );
        };
      }

      // 1. Password / Sensitive Vault rendering
      if (col.is_sensitive || col.data_type === 'PASSWORD') {
        colDef.minWidth = 220;
        colDef.headerName = `${col.display_name} 🔒`;
        colDef.cellRenderer = (params: any) => {
          if (!params.data) return null;
          const secretKey = `${params.data.id}_${col.name}`;
          const isRevealed = Boolean(revealedSecrets[secretKey]);
          const currentVal = isRevealed ? revealedSecrets[secretKey] : '••••••••';

          return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, height: '100%', minWidth: 0, width: '100%', overflow: 'hidden' }}>
              <Box
                sx={{
                  bgcolor: mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
                  border: '1px solid',
                  borderColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : '#E2E8F0',
                  px: 1.2,
                  py: 0.3,
                  borderRadius: 1.5,
                  fontFamily: 'monospace',
                  fontSize: '0.82rem',
                  letterSpacing: isRevealed ? 0 : 2,
                  color: isRevealed ? 'text.primary' : '#64748B',
                  minWidth: 76,
                  textAlign: 'center',
                }}
              >
                {currentVal}
              </Box>

              <Tooltip title={isRevealed ? 'Hide secret' : 'Reveal secret'}>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRevealSecret(params.data.id, col.id, col.name);
                  }}
                  sx={{ color: '#64748B', p: 0.4 }}
                >
                  {isRevealed ? <VisibilityOff sx={{ fontSize: 16 }} /> : <Visibility sx={{ fontSize: 16 }} />}
                </IconButton>
              </Tooltip>

              <Tooltip title="Copy to clipboard">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isRevealed) {
                      handleCopySecret(revealedSecrets[secretKey]);
                    } else {
                      apiClient
                        .post<{ plaintext_value: string }>(
                          `/tables/${tableId}/records/${params.data.id}/columns/${col.id}/reveal-secret`,
                          {}
                        )
                        .then((res) => handleCopySecret(res.data.plaintext_value))
                        .catch(() => alert('Failed to copy secret'));
                    }
                  }}
                  sx={{ color: '#64748B', p: 0.4 }}
                >
                  <ContentCopy sx={{ fontSize: 15 }} />
                </IconButton>
              </Tooltip>
            </Box>
          );
        };
      }
      // 2. Email / URL type rendering
      else if (col.data_type === 'EMAIL' || col.data_type === 'URL') {
        colDef.cellRenderer = (params: any) => {
          if (!params.value) return <Typography variant="caption" sx={{ color: 'text.disabled' }}>-</Typography>;
          const isEmail = col.data_type === 'EMAIL';
          return (
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.6,
                color: mode === 'dark' ? '#60A5FA' : '#2563EB',
                fontWeight: 500,
                fontSize: '0.84rem',
                cursor: 'pointer',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                width: '100%',
                minWidth: 0,
                maxWidth: '100%',
                '&:hover': { textDecoration: 'underline' },
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (isEmail) {
                  window.location.href = `mailto:${params.value}`;
                } else {
                  window.open(params.value, '_blank');
                }
              }}
            >
              {isEmail ? <MailOutlined sx={{ fontSize: 14 }} /> : <OpenInNew sx={{ fontSize: 14 }} />}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                {params.value}
              </span>
            </Box>
          );
        };
      }
      // 3. Status / Boolean Pill Styling
      else if (
        col.data_type === 'BOOLEAN' ||
        col.name.toLowerCase().includes('status') ||
        col.display_name.toLowerCase().includes('status')
      ) {
        colDef.cellRenderer = (params: any) => {
          if (params.value === undefined || params.value === null || params.value === '') {
            return <Typography variant="caption" sx={{ color: 'text.disabled' }}>-</Typography>;
          }
          const isPositive =
            params.value === true ||
            params.value === 'ACTIVE' ||
            params.value === 'Active' ||
            params.value === 'active' ||
            params.value === 'COMPLETED' ||
            params.value === 'SUCCESS' ||
            params.value === '1';

          const labelText = params.value === true ? 'ACTIVE' : params.value === false ? 'INACTIVE' : String(params.value);

          return (
            <Box
              sx={{
                bgcolor: isPositive
                  ? mode === 'dark'
                    ? 'rgba(16, 185, 129, 0.15)'
                    : '#ECFDF5'
                  : mode === 'dark'
                  ? 'rgba(239, 68, 68, 0.15)'
                  : '#FEF2F2',
                color: isPositive
                  ? mode === 'dark'
                    ? '#34D399'
                    : '#059669'
                  : mode === 'dark'
                  ? '#F87171'
                  : '#DC2626',
                border: '1px solid',
                borderColor: isPositive
                  ? mode === 'dark'
                    ? 'rgba(16, 185, 129, 0.3)'
                    : '#A7F3D0'
                  : mode === 'dark'
                  ? 'rgba(239, 68, 68, 0.3)'
                  : '#FECACA',
                px: 1.2,
                py: 0.25,
                borderRadius: 5,
                fontWeight: 600,
                fontSize: '0.72rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.6,
                letterSpacing: 0.3,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '100%',
              }}
            >
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  bgcolor: isPositive ? '#10B981' : '#EF4444',
                  flexShrink: 0,
                }}
              />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {String(labelText).toUpperCase()}
              </span>
            </Box>
          );
        };
      }
      // 4. Dropdown / Category Tag styling
      else if (
        col.data_type === 'DROPDOWN' ||
        col.name.toLowerCase().includes('group') ||
        col.name.toLowerCase().includes('dept') ||
        col.name.toLowerCase().includes('category')
      ) {
        colDef.cellRenderer = (params: any) => {
          if (!params.value) return <Typography variant="caption" sx={{ color: 'text.disabled' }}>-</Typography>;
          return (
            <Box
              sx={{
                bgcolor: mode === 'dark' ? 'rgba(99, 102, 241, 0.15)' : '#EEF2FF',
                color: mode === 'dark' ? '#A5B4FC' : '#4F46E5',
                border: '1px solid',
                borderColor: mode === 'dark' ? 'rgba(99, 102, 241, 0.25)' : '#E0E7FF',
                px: 1.1,
                py: 0.25,
                borderRadius: 1.5,
                fontWeight: 600,
                fontSize: '0.74rem',
                display: 'inline-block',
                textTransform: 'uppercase',
                letterSpacing: 0.3,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '100%',
              }}
            >
              {params.value}
            </Box>
          );
        };
      }
      // 5. Multi-Select chips
      else if (col.data_type === 'MULTI_SELECT') {
        colDef.cellRenderer = (params: any) => {
          if (!Array.isArray(params.value) || params.value.length === 0) {
            return <Typography variant="caption" sx={{ color: 'text.disabled' }}>-</Typography>;
          }
          return (
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'nowrap', overflow: 'hidden', minWidth: 0, width: '100%' }}>
              {params.value.map((v: string) => (
                <Chip key={v} label={v} size="small" sx={{ height: 20, fontSize: '0.7rem' }} />
              ))}
            </Box>
          );
        };
      }
      // 6. Currency & Numbers (Right-aligned matching AG Grid reference design)
      else if (col.data_type === 'CURRENCY') {
        colDef.headerClass = 'ag-right-aligned-header';
        colDef.cellClass = 'ag-right-aligned-cell';
        colDef.cellStyle = {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontWeight: 500,
          fontSize: '0.84rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        };
        colDef.valueFormatter = (params: any) => {
          if (params.value === null || params.value === undefined || params.value === '') return '-';
          const num = Number(params.value);
          if (isNaN(num)) return String(params.value);
          return `$${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
        };
      } else if (col.data_type === 'NUMBER' || col.data_type === 'DECIMAL') {
        colDef.headerClass = 'ag-right-aligned-header';
        colDef.cellClass = 'ag-right-aligned-cell';
        colDef.cellStyle = {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontWeight: 500,
          fontSize: '0.84rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        };
        colDef.valueFormatter = (params: any) => {
          if (params.value === null || params.value === undefined || params.value === '') return '-';
          const num = Number(params.value);
          if (isNaN(num)) return String(params.value);
          return num.toLocaleString();
        };
      } else if (col.data_type === 'DATE' || col.data_type === 'DATETIME') {
        colDef.cellStyle = {
          display: 'flex',
          alignItems: 'center',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        };
        colDef.valueFormatter = (params: any) => {
          if (!params.value) return '-';
          try {
            return new Date(params.value).toLocaleDateString();
          } catch {
            return params.value;
          }
        };
      }
      // 7. Text / Mixed / Alphanumeric / Default
      else {
        colDef.cellRenderer = (params: any) => {
          if (params.value === undefined || params.value === null || params.value === '') {
            return <Typography variant="caption" sx={{ color: 'text.disabled' }}>-</Typography>;
          }
          const textVal = String(params.value);
          return (
            <span
              style={{
                fontFamily: col.data_type === 'MIXED' || col.data_type === 'ALPHANUMERIC' ? 'monospace' : 'inherit',
                fontSize: '0.84rem',
                fontWeight: 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                width: '100%',
                maxWidth: '100%',
                minWidth: 0,
                display: 'block',
              }}
              title={textVal}
            >
              {textVal}
            </span>
          );
        };
      }

      defs.push(colDef);
    });

    // Pinned Right ACTIONS column
    defs.push({
      field: '__actions__',
      headerName: 'Actions',
      width: 125,
      minWidth: 125,
      maxWidth: 135,
      pinned: 'right',
      lockPosition: 'right',
      sortable: false,
      filter: false,
      resizable: false,
      cellRenderer: (params: any) => {
        if (!params.data) return null;
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', gap: 0.4 }}>
            <Tooltip title="View history & audit diff">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  setHistoryRecordId(params.data.id);
                }}
                sx={{ color: '#64748B', '&:hover': { color: 'primary.main' } }}
              >
                <VisibilityOutlined sx={{ fontSize: 17 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Edit record (Double click row)">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedRecordForEdit(params.data);
                  setIsRecordDrawerOpen(true);
                }}
                sx={{ color: '#64748B', '&:hover': { color: 'primary.main' } }}
              >
                <EditOutlined sx={{ fontSize: 17 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Move to trash">
              <IconButton
                size="small"
                color="error"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteSingleRecordId(params.data.id);
                }}
                sx={{ opacity: 0.8, '&:hover': { opacity: 1 } }}
              >
                <DeleteOutlined sx={{ fontSize: 17 }} />
              </IconButton>
            </Tooltip>
          </Box>
        );
      },
    });

    return defs;
  }, [table, revealedSecrets, mode, page, pageSize, hiddenColumns]);

  const onGridReady = (params: GridReadyEvent) => {
    setGridApi(params.api);
  };

  const onSelectionChanged = (event: SelectionChangedEvent) => {
    const selected = event.api.getSelectedRows();
    setSelectedRows(selected);
  };

  const onRowDoubleClicked = (event: RowDoubleClickedEvent) => {
    if (event.data) {
      setSelectedRecordForEdit(event.data);
      setIsRecordDrawerOpen(true);
    }
  };

  // Calculate pagination bounds
  const isAllRows = pageSize === -1;
  const totalPages = isAllRows ? 1 : Math.max(1, Math.ceil(totalRecords / pageSize));
  const startEntry = totalRecords === 0 ? 0 : isAllRows ? 1 : (page - 1) * pageSize + 1;
  const endEntry = isAllRows ? totalRecords : Math.min(page * pageSize, totalRecords);

  const densityHeights = DENSITY_SETTINGS[density];

  if (loading && !table) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <CircularProgress size={40} />
      </Box>
    );
  }

  if (tableLockedPrompt && table) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '70vh',
          p: 3,
        }}
      >
        <Paper
          elevation={4}
          sx={{
            p: 4.5,
            maxWidth: 480,
            width: '100%',
            borderRadius: 3.5,
            textAlign: 'center',
            border: '1px solid',
            borderColor: 'warning.light',
            bgcolor: 'background.paper',
            boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
          }}
        >
          <Box
            sx={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              bgcolor: 'warning.lighter',
              color: 'warning.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 2.5,
              boxShadow: '0 4px 20px rgba(255, 152, 0, 0.25)',
            }}
          >
            <LockOutlined sx={{ fontSize: 40 }} />
          </Box>

          <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>
            Table Access Locked
          </Typography>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'text.secondary', mb: 2 }}>
            {table.display_name}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
            This table is protected with a security password. Enter the password below to unlock and access records.
          </Typography>

          {promptError && (
            <Alert severity="error" sx={{ mb: 2.5, textAlign: 'left' }} onClose={() => setPromptError(null)}>
              {promptError}
            </Alert>
          )}

          <form onSubmit={handleUnlockTable}>
            <TextField
              fullWidth
              size="medium"
              autoFocus
              type={promptShowPassword ? 'text' : 'password'}
              label="Table Security Password"
              placeholder="Enter password..."
              value={promptPassword}
              onChange={(e) => setPromptPassword(e.target.value)}
              required
              sx={{ mb: 3 }}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => setPromptShowPassword(!promptShowPassword)}
                        edge="end"
                      >
                        {promptShowPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />

            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="outlined"
                fullWidth
                size="large"
                onClick={() => navigate('/tables')}
              >
                Back to Tables
              </Button>
              <Button
                type="submit"
                variant="contained"
                color="warning"
                fullWidth
                size="large"
                disabled={!promptPassword.trim() || promptUnlocking}
                startIcon={promptUnlocking ? <CircularProgress size={20} color="inherit" /> : <KeyOutlined />}
                sx={{ fontWeight: 700 }}
              >
                {promptUnlocking ? 'Unlocking...' : 'Unlock Table'}
              </Button>
            </Box>
          </form>
        </Paper>
      </Box>
    );
  }

  if (!table) {
    return (
      <Alert severity="error" sx={{ mt: 3 }}>
        Table not found.
      </Alert>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: isFullscreen ? '100vh' : 'calc(100vh - 110px)',
        position: isFullscreen ? 'fixed' : 'relative',
        top: isFullscreen ? 0 : 'auto',
        left: isFullscreen ? 0 : 'auto',
        width: isFullscreen ? '100vw' : '100%',
        zIndex: isFullscreen ? 1400 : 'auto',
        bgcolor: 'background.default',
        p: isFullscreen ? 2.5 : 0,
      }}
    >
      {/* AG Grid Enterprise Header & Toolbar */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, flexWrap: 'wrap', gap: 1.5 }}>
        {/* Table Title & Metadata */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              display: 'flex',
              p: 1,
              borderRadius: 2,
              bgcolor: 'primary.main',
              color: '#fff',
              boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)',
            }}
          >
            <TableView fontSize="medium" />
          </Box>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                {table.display_name}
              </Typography>
              <Chip
                label={`${table.columns.length} columns`}
                size="small"
                variant="outlined"
                sx={{ height: 20, fontSize: '0.7rem', fontWeight: 600 }}
              />
              {table.is_private && (
                <Tooltip title="Private Table: Visible only to creator and Super Admins">
                  <Chip
                    icon={<LockOutlined sx={{ fontSize: '0.8rem !important' }} />}
                    label="Private"
                    size="small"
                    color="secondary"
                    sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700 }}
                  />
                </Tooltip>
              )}
              {(table.is_locked || table.has_password) && (
                <Tooltip title="Password Protected Table">
                  <Chip
                    icon={<KeyOutlined sx={{ fontSize: '0.8rem !important' }} />}
                    label="Locked"
                    size="small"
                    color="warning"
                    sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700 }}
                  />
                </Tooltip>
              )}
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {totalRecords} records &bull; Table ID: <code>{table.name}</code> &bull; Double-click row to edit
            </Typography>
          </Box>
        </Box>

        {/* Action Controls & AG Grid Features */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {/* Quick Search */}
          <TextField
            size="small"
            placeholder="Quick search..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search fontSize="small" sx={{ color: 'text.secondary' }} />
                  </InputAdornment>
                ),
                endAdornment: search ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearch('')}>
                      <Clear fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              },
            }}
            sx={{ width: 190 }}
          />

          {/* Floating Filter Toggle */}
          <Tooltip title={showFloatingFilters ? 'Hide Column Filters' : 'Show Column Filters'}>
            <IconButton
              size="small"
              color={showFloatingFilters ? 'primary' : 'default'}
              onClick={() => setShowFloatingFilters(!showFloatingFilters)}
              sx={{
                border: '1px solid',
                borderColor: showFloatingFilters ? 'primary.main' : 'divider',
                borderRadius: 1.5,
                p: 0.8,
              }}
            >
              {showFloatingFilters ? <FilterList fontSize="small" /> : <FilterListOff fontSize="small" />}
            </IconButton>
          </Tooltip>

          {/* Density Selector Menu */}
          <Tooltip title="Row Density">
            <IconButton
              size="small"
              onClick={(e) => setDensityMenuAnchor(e.currentTarget)}
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1.5,
                p: 0.8,
              }}
            >
              {density === 'compact' ? (
                <DensitySmall fontSize="small" />
              ) : density === 'comfortable' ? (
                <DensityLarge fontSize="small" />
              ) : (
                <DensityMedium fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={densityMenuAnchor}
            open={Boolean(densityMenuAnchor)}
            onClose={() => setDensityMenuAnchor(null)}
          >
            <MenuItem
              selected={density === 'compact'}
              onClick={() => {
                setDensity('compact');
                setDensityMenuAnchor(null);
              }}
            >
              <DensitySmall sx={{ mr: 1, fontSize: 16 }} /> Compact (28px)
            </MenuItem>
            <MenuItem
              selected={density === 'standard'}
              onClick={() => {
                setDensity('standard');
                setDensityMenuAnchor(null);
              }}
            >
              <DensityMedium sx={{ mr: 1, fontSize: 16 }} /> Standard (34px)
            </MenuItem>
            <MenuItem
              selected={density === 'comfortable'}
              onClick={() => {
                setDensity('comfortable');
                setDensityMenuAnchor(null);
              }}
            >
              <DensityLarge sx={{ mr: 1, fontSize: 16 }} /> Comfortable (42px)
            </MenuItem>
          </Menu>

          {/* Column Visibility & Layout Menu */}
          <Tooltip title="Manage Columns">
            <IconButton
              size="small"
              onClick={(e) => setColumnMenuAnchor(e.currentTarget)}
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1.5,
                p: 0.8,
              }}
            >
              <Badge
                color="primary"
                variant="dot"
                invisible={Object.values(hiddenColumns).filter(Boolean).length === 0}
              >
                <ViewColumn fontSize="small" />
              </Badge>
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={columnMenuAnchor}
            open={Boolean(columnMenuAnchor)}
            onClose={() => setColumnMenuAnchor(null)}
            slotProps={{ paper: { sx: { width: 260, maxHeight: 420, p: 1 } } }}
          >
            <Typography variant="subtitle2" sx={{ px: 1.5, py: 0.5, fontWeight: 700 }}>
              Visible Columns
            </Typography>
            <Divider sx={{ my: 0.5 }} />
            <Box sx={{ maxHeight: 220, overflowY: 'auto' }}>
              {table.columns.map((col) => {
                const isHidden = Boolean(hiddenColumns[col.name]);
                return (
                  <MenuItem
                    key={col.id}
                    dense
                    onClick={() => handleToggleColumnVisibility(col.name)}
                    sx={{ py: 0.2 }}
                  >
                    <Checkbox size="small" checked={!isHidden} sx={{ mr: 1, p: 0.5 }} />
                    <Typography variant="body2" sx={{ fontSize: '0.82rem' }}>
                      {col.display_name}
                    </Typography>
                  </MenuItem>
                );
              })}
            </Box>
            <Divider sx={{ my: 0.5 }} />
            <MenuItem dense onClick={handleShowAllColumns}>
              <Refresh sx={{ fontSize: 16, mr: 1 }} /> Show All Columns
            </MenuItem>
            <MenuItem dense onClick={handleAutoSizeAll}>
              <FitScreen sx={{ fontSize: 16, mr: 1 }} /> Auto-size Columns
            </MenuItem>
            <MenuItem dense onClick={handleSizeColumnsToFit}>
              <TableView sx={{ fontSize: 16, mr: 1 }} /> Fit to Screen Width
            </MenuItem>
          </Menu>

          {/* Add Row Primary Button */}
          <Button
            variant="contained"
            size="small"
            startIcon={<Add />}
            onClick={() => {
              setSelectedRecordForEdit(null);
              setIsRecordDrawerOpen(true);
            }}
            sx={{ fontWeight: 700 }}
          >
            Add Row
          </Button>

          {/* Add Column Button */}
          <Button
            variant="contained"
            color="secondary"
            size="small"
            startIcon={<PlaylistAdd />}
            onClick={handleOpenAddColumn}
            sx={{ fontWeight: 700 }}
          >
            Add Column
          </Button>

          {/* Export Button */}
          <Button
            variant="outlined"
            size="small"
            startIcon={<FileDownloadOutlined />}
            onClick={() => setIsExportOpen(true)}
          >
            Export
          </Button>

          {/* Import Button */}
          <Button
            variant="outlined"
            size="small"
            startIcon={<FileUploadOutlined />}
            onClick={() => navigate(`/imports/wizard?tableId=${table.id}`)}
          >
            Import
          </Button>

          {/* Table Recycle Bin (Deleted Records) */}
          <Tooltip title="View Table Recycle Bin (Deleted Records)">
            <IconButton
              size="small"
              onClick={() => setIsDeletedRecordsOpen(true)}
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1.5,
                p: 0.8,
              }}
            >
              <RestoreFromTrashOutlined fontSize="small" />
            </IconButton>
          </Tooltip>

          {/* Table Settings & Permissions */}
          <Tooltip title="Table Schema & Columns">
            <IconButton size="small" onClick={() => setIsSettingsOpen(true)}>
              <SettingsOutlined />
            </IconButton>
          </Tooltip>

          <Tooltip title="Access Control Permissions">
            <IconButton size="small" onClick={() => setIsPermissionsOpen(true)}>
              <AdminPanelSettingsOutlined />
            </IconButton>
          </Tooltip>

          {/* Delete Table Action (Move to Trash) */}
          <Tooltip title="Delete Entire Table (Move to Trash)">
            <IconButton
              size="small"
              color="error"
              onClick={() => {
                setDeleteTableConfirmText('');
                setDeleteTableConfirmOpen(true);
              }}
              sx={{ opacity: 0.85, '&:hover': { opacity: 1 } }}
            >
              <DeleteForeverOutlined />
            </IconButton>
          </Tooltip>

          <Tooltip title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
            <IconButton size="small" onClick={() => setIsFullscreen(!isFullscreen)}>
              {isFullscreen ? <FullscreenExit /> : <Fullscreen />}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Selected Rows Floating Action Banner */}
      {selectedRows.length > 0 && (
        <Paper
          elevation={3}
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 1,
            mb: 1.5,
            borderRadius: 2,
            bgcolor: mode === 'dark' ? '#1E293B' : '#EEF2FF',
            border: '1px solid',
            borderColor: mode === 'dark' ? 'primary.dark' : 'primary.light',
            animation: 'fadeIn 0.2s ease-in-out',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CheckCircleOutlined color="primary" fontSize="small" />
            <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
              {selectedRows.length} record{selectedRows.length > 1 ? 's' : ''} selected
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<FileDownloadOutlined />}
              onClick={handleExportSelected}
              sx={{ bgcolor: 'background.paper' }}
            >
              Export Selected
            </Button>
            <Button
              size="small"
              variant="contained"
              color="error"
              startIcon={<DeleteOutlined />}
              onClick={() => setBulkDeleteConfirmOpen(true)}
            >
              Delete Selected ({selectedRows.length})
            </Button>
            <Button
              size="small"
              onClick={() => {
                if (gridApi) gridApi.deselectAll();
                setSelectedRows([]);
              }}
            >
              Deselect All
            </Button>
          </Box>
        </Paper>
      )}

      {/* Main AG Grid Card Matching Reference Design */}
      <Paper
        variant="outlined"
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '14px',
          overflow: 'hidden',
          borderColor: mode === 'dark' ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
          boxShadow: mode === 'dark' ? '0 4px 24px rgba(0,0,0,0.4)' : '0 2px 16px rgba(0,0,0,0.04)',
          bgcolor: mode === 'dark' ? '#0F172A' : '#FFFFFF',
          minHeight: 0,
        }}
      >
        {/* Top Rail Subtitle / Prompt matching reference image */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            px: 2.5,
            py: 0.8,
            bgcolor: mode === 'dark' ? '#0F172A' : '#FAFAFA',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Typography
            sx={{
              fontFamily: "'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, monospace",
              fontSize: '0.78rem',
              color: mode === 'dark' ? '#94A3B8' : '#64748B',
              letterSpacing: '0.2px',
            }}
          >
            double-click a cell to edit it, or go full screen from the rail
          </Typography>
        </Box>

        {records.length === 0 && !search ? (
          <Box
            sx={{
              flexGrow: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              p: 6,
            }}
          >
            <TableView sx={{ fontSize: 56, color: 'text.secondary', opacity: 0.4, mb: 2 }} />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              No active records found.
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 400, textAlign: 'center', mt: 1, mb: 3 }}>
              This dynamic table currently has zero active records. Add your first record, add custom columns, or import data from an Excel spreadsheet.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={() => {
                  setSelectedRecordForEdit(null);
                  setIsRecordDrawerOpen(true);
                }}
              >
                + Add Row
              </Button>
              <Button
                variant="contained"
                color="secondary"
                startIcon={<PlaylistAdd />}
                onClick={handleOpenAddColumn}
              >
                + Add Column
              </Button>
              <Button
                variant="outlined"
                startIcon={<FileUploadOutlined />}
                onClick={() => navigate(`/imports/wizard?tableId=${table.id}`)}
              >
                Import Excel
              </Button>
              <Button
                variant="outlined"
                color="warning"
                startIcon={<RestoreFromTrashOutlined />}
                onClick={() => setIsDeletedRecordsOpen(true)}
              >
                View Recycle Bin
              </Button>
            </Box>
          </Box>
        ) : (
          /* Middle Section: Left Action Rail + AG Grid Canvas + Right Scroll Indicator */
          <Box
            sx={{
              flexGrow: 1,
              display: 'flex',
              minHeight: 0,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {/* Left Vertical Action Rail matching reference layout */}
            <Box
              sx={{
                width: 44,
                minWidth: 44,
                borderRight: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                py: 0.8,
                gap: 0.6,
                bgcolor: mode === 'dark' ? '#0F172A' : '#FAFAFA',
                userSelect: 'none',
                zIndex: 2,
              }}
            >
              {/* 1. Undo */}
              <Tooltip title="Undo last cell edit (Ctrl+Z)" placement="right">
                <span>
                  <IconButton
                    size="small"
                    onClick={handleUndo}
                    disabled={undoStack.length === 0}
                    sx={{ p: 0.7, color: undoStack.length > 0 ? 'primary.main' : 'text.disabled' }}
                  >
                    <Undo sx={{ fontSize: 18 }} />
                  </IconButton>
                </span>
              </Tooltip>

              {/* 2. Redo */}
              <Tooltip title="Redo cell edit (Ctrl+Y)" placement="right">
                <span>
                  <IconButton
                    size="small"
                    onClick={handleRedo}
                    disabled={redoStack.length === 0}
                    sx={{ p: 0.7, color: redoStack.length > 0 ? 'primary.main' : 'text.disabled' }}
                  >
                    <Redo sx={{ fontSize: 18 }} />
                  </IconButton>
                </span>
              </Tooltip>

              {/* 3. Refresh */}
              <Tooltip title="Refresh Table Data" placement="right">
                <IconButton
                  size="small"
                  onClick={fetchTableAndRecords}
                  sx={{ p: 0.7, color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
                >
                  <Refresh sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>

              {/* 4. Fullscreen from the rail */}
              <Tooltip title={isFullscreen ? 'Exit Full Screen' : 'Go Full Screen from the Rail'} placement="right">
                <IconButton
                  size="small"
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  sx={{ p: 0.7, color: isFullscreen ? 'primary.main' : 'text.secondary', '&:hover': { color: 'text.primary' } }}
                >
                  {isFullscreen ? <FullscreenExit sx={{ fontSize: 18 }} /> : <Fullscreen sx={{ fontSize: 18 }} />}
                </IconButton>
              </Tooltip>

              {/* 5. Export / Download */}
              <Tooltip title="Export Table (XLSX, CSV)" placement="right">
                <IconButton
                  size="small"
                  onClick={() => setIsExportOpen(true)}
                  sx={{ p: 0.7, color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
                >
                  <FileDownloadOutlined sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>

              {/* 6. Column Manager */}
              <Tooltip title="Column Visibility & Display" placement="right">
                <IconButton
                  size="small"
                  onClick={(e) => setColumnMenuAnchor(e.currentTarget)}
                  sx={{ p: 0.7, color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
                >
                  <ViewColumn sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>

              {/* 7. Duplicate / Clone Record */}
              <Tooltip title={selectedRows.length > 0 ? 'Duplicate Selected Row' : 'Select a row to duplicate'} placement="right">
                <span>
                  <IconButton
                    size="small"
                    onClick={handleDuplicateSelectedRow}
                    disabled={selectedRows.length === 0}
                    sx={{ p: 0.7, color: selectedRows.length > 0 ? 'text.secondary' : 'text.disabled', '&:hover': { color: 'text.primary' } }}
                  >
                    <ContentCopy sx={{ fontSize: 18 }} />
                  </IconButton>
                </span>
              </Tooltip>

              {/* 8. Print */}
              <Tooltip title="Print Table View" placement="right">
                <IconButton
                  size="small"
                  onClick={() => window.print()}
                  sx={{ p: 0.7, color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
                >
                  <Print sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>

              {/* 9. Edit in Drawer */}
              <Tooltip title={selectedRows.length > 0 ? 'Edit Record in Drawer' : 'Select a row to edit'} placement="right">
                <span>
                  <IconButton
                    size="small"
                    onClick={handleEditSelectedRow}
                    disabled={selectedRows.length === 0}
                    sx={{ p: 0.7, color: selectedRows.length > 0 ? 'primary.main' : 'text.disabled' }}
                  >
                    <EditOutlined sx={{ fontSize: 18 }} />
                  </IconButton>
                </span>
              </Tooltip>

              {/* 10. Inspect Record History */}
              <Tooltip title={selectedRows.length > 0 ? 'Inspect Record Audit & History' : 'Select a row to inspect'} placement="right">
                <span>
                  <IconButton
                    size="small"
                    onClick={handleInspectSelectedRow}
                    disabled={selectedRows.length === 0}
                    sx={{ p: 0.7, color: selectedRows.length > 0 ? 'text.secondary' : 'text.disabled', '&:hover': { color: 'text.primary' } }}
                  >
                    <OpenInNew sx={{ fontSize: 18 }} />
                  </IconButton>
                </span>
              </Tooltip>

              {/* 11. Select All / Toggle Selection */}
              <Tooltip title={selectedRows.length === records.length && records.length > 0 ? 'Deselect All' : 'Select All Rows'} placement="right">
                <IconButton
                  size="small"
                  onClick={handleToggleSelectAllOrFilters}
                  sx={{ p: 0.7, color: selectedRows.length > 0 ? 'primary.main' : 'text.secondary', '&:hover': { color: 'text.primary' } }}
                >
                  <CheckBoxOutlineBlank sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>

              {/* 12. Delete Selected (Minus icon) */}
              <Tooltip title={selectedRows.length > 0 ? `Delete Selected (${selectedRows.length})` : 'Select a row to delete'} placement="right">
                <span>
                  <IconButton
                    size="small"
                    color={selectedRows.length > 0 ? 'error' : 'default'}
                    onClick={() => setBulkDeleteConfirmOpen(true)}
                    disabled={selectedRows.length === 0}
                    sx={{ p: 0.7, '&:hover': { bgcolor: 'error.lighter' } }}
                  >
                    <Remove sx={{ fontSize: 18 }} />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>

            {/* Center AG Grid Canvas */}
            <Box
              className={mode === 'dark' ? 'ag-theme-quartz-dark' : 'ag-theme-quartz'}
              sx={{
                flexGrow: 1,
                minWidth: 0,
                height: '100%',
                overflow: 'hidden',
                '& .ag-root-wrapper': {
                  border: 'none !important',
                  borderRadius: 0,
                },
              }}
            >
              <AgGridReact
                rowData={records}
                columnDefs={columnDefs}
                defaultColDef={defaultColDef}
                rowSelection="multiple"
                rowHeight={densityHeights.row}
                headerHeight={densityHeights.header}
                animateRows={true}
                enableCellTextSelection={true}
                onGridReady={onGridReady}
                onSelectionChanged={onSelectionChanged}
                onRowDoubleClicked={onRowDoubleClicked}
                onCellValueChanged={handleCellValueChanged}
              />
            </Box>

            {/* Right Scrollbar Rail with Up/Down Arrow Indicators matching reference */}
            <Box
              sx={{
                width: 22,
                minWidth: 22,
                borderLeft: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                alignItems: 'center',
                py: 0.5,
                bgcolor: mode === 'dark' ? '#0F172A' : '#FAFAFA',
                userSelect: 'none',
                zIndex: 2,
              }}
            >
              <Tooltip title="Scroll up" placement="left">
                <IconButton
                  size="small"
                  onClick={() => handleScrollGrid('up')}
                  sx={{ p: 0.2, color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
                >
                  <ArrowDropUp sx={{ fontSize: 20 }} />
                </IconButton>
              </Tooltip>

              <Box
                sx={{
                  width: 4,
                  height: 48,
                  borderRadius: 2,
                  bgcolor: mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.14)',
                  my: 'auto',
                }}
              />

              <Tooltip title="Scroll down" placement="left">
                <IconButton
                  size="small"
                  onClick={() => handleScrollGrid('down')}
                  sx={{ p: 0.2, color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
                >
                  <ArrowDropDown sx={{ fontSize: 20 }} />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        )}

        {/* AG Grid Status & Pagination Bar Matching Reference Monospace Footer */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            px: 2.5,
            py: 1.2,
            bgcolor: mode === 'dark' ? '#0F172A' : '#FAFAFA',
            borderTop: '1px solid',
            borderColor: 'divider',
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          {/* Left: Monospace Status Bar matching reference design */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography
              sx={{
                fontFamily: "'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, monospace",
                fontSize: '0.8rem',
                color: mode === 'dark' ? '#94A3B8' : '#64748B',
                letterSpacing: '0.2px',
              }}
            >
              {totalRecords.toLocaleString()} {table.name.toLowerCase()} &nbsp;&nbsp;&nbsp;&nbsp; {editableColsCount} editable columns &nbsp;&nbsp;&nbsp;&nbsp; {selectedRows.length > 0 ? `${selectedRows.length} selected` : 'full screen marks up a couple of cells'}
            </Typography>
          </Box>

          {/* Right: AG Grid Page Navigation & Rows Per Page */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
                rows:
              </Typography>
              <Select
                size="small"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                sx={{
                  height: 26,
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  borderRadius: 1,
                  bgcolor: mode === 'dark' ? 'background.paper' : '#FFFFFF',
                  '& .MuiSelect-select': { py: 0.3, px: 1 },
                }}
              >
                <MenuItem value={10}>10</MenuItem>
                <MenuItem value={25}>25</MenuItem>
                <MenuItem value={50}>50</MenuItem>
                <MenuItem value={100}>100</MenuItem>
                <MenuItem value={500}>500</MenuItem>
                <MenuItem value={-1}>All ({totalRecords})</MenuItem>
              </Select>
            </Box>

            <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
              {pageSize === -1 ? 'all rows' : `${startEntry}-${endEntry} of ${totalRecords}`}
            </Typography>

            {pageSize !== -1 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <IconButton
                  size="small"
                  disabled={page === 1 || isAllRows}
                  onClick={() => setPage(1)}
                  sx={{ p: 0.4 }}
                >
                  <FirstPage fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  disabled={page === 1 || isAllRows}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  sx={{ p: 0.4 }}
                >
                  <ChevronLeft fontSize="small" />
                </IconButton>
                <Typography variant="caption" sx={{ fontFamily: 'monospace', px: 0.5, fontWeight: 600 }}>
                  {page}/{totalPages || 1}
                </Typography>
                <IconButton
                  size="small"
                  disabled={page >= totalPages || isAllRows}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  sx={{ p: 0.4 }}
                >
                  <ChevronRight fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  disabled={page >= totalPages || isAllRows}
                  onClick={() => setPage(totalPages)}
                  sx={{ p: 0.4 }}
                >
                  <LastPage fontSize="small" />
                </IconButton>
              </Box>
            )}
          </Box>
        </Box>
      </Paper>

      {/* Quick Add Column Modal */}
      <Dialog open={isAddColumnOpen} onClose={() => setIsAddColumnOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
          <PlaylistAdd color="secondary" />
          Add Additional Column
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Add a new column to table <strong>{table.display_name}</strong>. The new column will appear dynamically in all grid views and exports.
          </DialogContentText>

          {addingColError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {addingColError}
            </Alert>
          )}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Column Display Name"
              placeholder="e.g. Employee ID, Serial Code, Mixed Info"
              fullWidth
              size="small"
              required
              value={newColDisplayName}
              onChange={(e) => {
                setNewColDisplayName(e.target.value);
                if (!newColName) {
                  setNewColName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
                }
              }}
            />

            <TextField
              label="Column System Identifier / Key"
              placeholder="e.g. employee_id, serial_code"
              fullWidth
              size="small"
              value={newColName}
              onChange={(e) => setNewColName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
              helperText="Unique alphanumeric identifier (used in API and filters)"
            />

            <FormControl fullWidth size="small">
              <InputLabel>Data Type</InputLabel>
              <Select
                value={newColType}
                label="Data Type"
                onChange={(e) => setNewColType(e.target.value as ColumnType)}
              >
                {ALL_COLUMN_TYPES.map((t) => (
                  <MenuItem key={t.type} value={t.type}>
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                      <Typography variant="body2" sx={{ fontWeight: t.type === 'MIXED' ? 700 : 500, color: t.type === 'MIXED' ? 'secondary.main' : 'inherit' }}>
                        {t.label}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
                        {t.desc}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Default Value (Optional)"
              placeholder="e.g. N/A or 123"
              fullWidth
              size="small"
              value={newColDefaultValue}
              onChange={(e) => setNewColDefaultValue(e.target.value)}
            />

            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={newColRequired}
                    onChange={(e) => setNewColRequired(e.target.checked)}
                    color="primary"
                  />
                }
                label="Required Field"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={newColSensitive}
                    onChange={(e) => setNewColSensitive(e.target.checked)}
                    color="secondary"
                  />
                }
                label="Sensitive / Masked Vault"
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setIsAddColumnOpen(false)} disabled={addingColLoading}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="secondary"
            onClick={handleCreateColumn}
            disabled={addingColLoading || !newColDisplayName.trim()}
          >
            {addingColLoading ? <CircularProgress size={20} /> : 'Create Column'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Table Confirmation Dialog (Soft Delete -> Trash) */}
      <Dialog open={deleteTableConfirmOpen} onClose={() => setDeleteTableConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, color: 'error.main', display: 'flex', alignItems: 'center', gap: 1 }}>
          <DeleteForeverOutlined color="error" />
          Move Table to Trash?
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Moving table <strong>{table.display_name}</strong> to the Trash will hide it from the active list. You can restore it anytime from the <strong>Trash Tables</strong> tab in the Tables section.
          </DialogContentText>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
            Type <strong>DELETE</strong> to confirm:
          </Typography>
          <TextField
            fullWidth
            size="small"
            value={deleteTableConfirmText}
            onChange={(e) => setDeleteTableConfirmText(e.target.value)}
            placeholder="DELETE"
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDeleteTableConfirmOpen(false)} disabled={isDeletingTable}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDeleteTable}
            disabled={deleteTableConfirmText !== 'DELETE' || isDeletingTable}
          >
            {isDeletingTable ? <CircularProgress size={20} /> : 'Move to Trash'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Record Create/Edit Drawer */}
      <RecordDrawer
        open={isRecordDrawerOpen}
        onClose={() => setIsRecordDrawerOpen(false)}
        table={table}
        record={selectedRecordForEdit}
        onSaved={fetchTableAndRecords}
      />

      {/* Record Version History Modal */}
      <RecordHistoryModal
        open={Boolean(historyRecordId)}
        onClose={() => setHistoryRecordId(null)}
        recordId={historyRecordId}
        onRestored={fetchTableAndRecords}
      />

      {/* Deleted Records Recycle Bin Modal */}
      <DeletedRecordsModal
        open={isDeletedRecordsOpen}
        onClose={() => setIsDeletedRecordsOpen(false)}
        table={table}
        onRestored={fetchTableAndRecords}
      />

      {/* Table Columns & Structure Settings Modal */}
      <TableSettingsModal
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        table={table}
        onUpdated={fetchTableAndRecords}
      />

      {/* Table Access Control Permissions Modal */}
      <TablePermissionsModal
        open={isPermissionsOpen}
        onClose={() => setIsPermissionsOpen(false)}
        table={table}
      />

      {/* Export Modal */}
      <ExportModal
        open={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        table={table}
      />

      {/* Delete Single Record Confirmation Dialog */}
      <Dialog open={Boolean(deleteSingleRecordId)} onClose={() => setDeleteSingleRecordId(null)} maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700, color: 'error.main' }}>Move Record to Trash?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to move this record to the Recycle Bin? You can view and restore it anytime from the <strong>Deleted Records</strong> button.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDeleteSingleRecordId(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDeleteSingle}>
            Move to Trash
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Delete Dialog */}
      <Dialog open={bulkDeleteConfirmOpen} onClose={() => setBulkDeleteConfirmOpen(false)} maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700, color: 'error.main' }}>Move Selected Records to Trash?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to move <strong>{selectedRows.length}</strong> selected records to the Recycle Bin?
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setBulkDeleteConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleBulkDelete}>
            Move to Trash
          </Button>
        </DialogActions>
      </Dialog>

      {/* Feedback Snackbar */}
      <Snackbar
        open={Boolean(snackbarMessage)}
        autoHideDuration={3000}
        onClose={() => setSnackbarMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSnackbarMessage(null)} severity="success" sx={{ width: '100%' }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default DynamicGridPage;

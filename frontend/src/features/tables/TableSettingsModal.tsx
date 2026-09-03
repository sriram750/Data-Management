import React, { useState } from 'react';
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
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Switch,
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
  Add,
  ArrowDownward,
  ArrowUpward,
  DeleteOutlined,
  Edit,
  SaveOutlined,
  Settings,
  WarningAmberOutlined,
} from '@mui/icons-material';

import { apiClient } from '../../api/client';
import { ColumnType, DataColumn, DataTable } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  table: DataTable;
  onUpdated: () => void;
}

const COLUMN_TYPES: ColumnType[] = [
  'TEXT',
  'MIXED',
  'LONG_TEXT',
  'NUMBER',
  'DECIMAL',
  'CURRENCY',
  'DATE',
  'DATETIME',
  'EMAIL',
  'PHONE',
  'IP_ADDRESS',
  'URL',
  'PASSWORD',
  'BOOLEAN',
  'DROPDOWN',
  'MULTI_SELECT',
  'USER',
  'FILE',
];

export const TableSettingsModal: React.FC<Props> = ({ open, onClose, table, onUpdated }) => {
  const [displayName, setDisplayName] = useState(table.display_name);
  const [description, setDescription] = useState(table.description || '');
  const [columns, setColumns] = useState<DataColumn[]>(table.columns);

  // New column input
  const [isAddingCol, setIsAddingCol] = useState(false);
  const [newColDisplayName, setNewColDisplayName] = useState('');
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState<ColumnType>('TEXT');
  const [newColRequired, setNewColRequired] = useState(false);
  const [newColSensitive, setNewColSensitive] = useState(false);

  // Type change compatibility modal state
  const [typeCheckData, setTypeCheckData] = useState<{
    columnId: string;
    colName: string;
    currentType: ColumnType;
    targetType: ColumnType;
    report: any;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSaveMetadata = async () => {
    setLoading(true);
    setError(null);
    try {
      await apiClient.put(`/tables/${table.id}`, {
        display_name: displayName.trim(),
        description: description.trim() || null,
      });
      onUpdated();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update table metadata.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddColumn = async () => {
    if (!newColDisplayName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.post<DataColumn>(`/tables/${table.id}/columns`, {
        name: newColName.trim() || newColDisplayName.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        display_name: newColDisplayName.trim(),
        data_type: newColType,
        is_required: newColRequired,
        is_sensitive: newColSensitive,
        is_encrypted: newColSensitive || newColType === 'PASSWORD',
      });
      setColumns((prev) => [...prev, res.data]);
      setIsAddingCol(false);
      setNewColDisplayName('');
      setNewColName('');
      setNewColType('TEXT');
      setNewColRequired(false);
      setNewColSensitive(false);
      onUpdated();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to add column.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteColumn = async (columnId: string) => {
    if (columns.length <= 1) {
      setError('Table must have at least one column.');
      return;
    }
    setLoading(true);
    try {
      await apiClient.delete(`/columns/${columnId}`);
      setColumns((prev) => prev.filter((c) => c.id !== columnId));
      onUpdated();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete column.');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckTypeChange = async (col: DataColumn, targetType: ColumnType) => {
    if (col.data_type === targetType) return;
    try {
      const res = await apiClient.post(`/columns/${col.id}/check-type`, {
        target_type: targetType,
      });
      setTypeCheckData({
        columnId: col.id,
        colName: col.display_name,
        currentType: col.data_type,
        targetType,
        report: res.data,
      });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to check type compatibility.');
    }
  };

  const handleConfirmTypeChange = async () => {
    if (!typeCheckData) return;
    setLoading(true);
    try {
      await apiClient.put(`/columns/${typeCheckData.columnId}`, {
        data_type: typeCheckData.targetType,
      });
      setColumns((prev) =>
        prev.map((c) => (c.id === typeCheckData.columnId ? { ...c, data_type: typeCheckData.targetType } : c))
      );
      setTypeCheckData(null);
      onUpdated();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update column type.');
    } finally {
      setLoading(false);
    }
  };

  const handleReorder = async (fromIdx: number, toIdx: number) => {
    const updated = [...columns];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);
    const reorders = updated.map((c, i) => ({ id: c.id, display_order: i }));
    setColumns(updated);
    try {
      await apiClient.post(`/tables/${table.id}/columns/reorder`, { columns: reorders });
      onUpdated();
    } catch (err) {
      console.error('Failed to reorder columns', err);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Settings color="primary" /> Table Structure & Column Management
      </DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {/* General Info */}
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
          Table Details
        </Typography>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              size="small"
              label="Display Name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              size="small"
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Grid>
          <Grid size={12}>
            <Button size="small" variant="outlined" onClick={handleSaveMetadata} disabled={loading}>
              Save Table Details
            </Button>
          </Grid>
        </Grid>

        <Divider sx={{ my: 3 }} />

        {/* Columns Management */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Columns ({columns.length})
          </Typography>
          {!isAddingCol && (
            <Button size="small" variant="contained" startIcon={<Add />} onClick={() => setIsAddingCol(true)}>
              Add Column
            </Button>
          )}
        </Box>

        {/* Add Column Box */}
        {isAddingCol && (
          <Paper sx={{ p: 2, mb: 2.5, bgcolor: 'background.default', borderRadius: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
              New Column
            </Typography>
            <Grid container spacing={2} sx={{ alignItems: 'center' }}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  fullWidth
                  size="small"
                  label="Display Name"
                  value={newColDisplayName}
                  onChange={(e) => {
                    setNewColDisplayName(e.target.value);
                    setNewColName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
                  }}
                  required
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Type</InputLabel>
                  <Select
                    value={newColType}
                    label="Type"
                    onChange={(e) => setNewColType(e.target.value as ColumnType)}
                  >
                    {COLUMN_TYPES.map((t) => (
                      <MenuItem key={t} value={t}>
                        {t}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }} sx={{ display: 'flex', gap: 1 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={newColRequired}
                      onChange={(e) => setNewColRequired(e.target.checked)}
                    />
                  }
                  label="Required"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={newColSensitive}
                      onChange={(e) => setNewColSensitive(e.target.checked)}
                    />
                  }
                  label="Sensitive"
                />
              </Grid>
              <Grid size={12} sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                <Button size="small" onClick={() => setIsAddingCol(false)}>
                  Cancel
                </Button>
                <Button size="small" variant="contained" onClick={handleAddColumn} disabled={loading}>
                  Add to Table
                </Button>
              </Grid>
            </Grid>
          </Paper>
        )}

        {/* Existing Columns Table */}
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 60 }}>Order</TableCell>
                <TableCell>Display Name</TableCell>
                <TableCell>Name (Key)</TableCell>
                <TableCell>Type</TableCell>
                <TableCell align="center">Required</TableCell>
                <TableCell align="center">Sensitive</TableCell>
                <TableCell align="center" sx={{ width: 60 }}>
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {columns.map((col, idx) => (
                <TableRow key={col.id}>
                  <TableCell>
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                      <IconButton
                        size="small"
                        disabled={idx === 0}
                        onClick={() => handleReorder(idx, idx - 1)}
                        sx={{ p: 0.2 }}
                      >
                        <ArrowUpward fontSize="inherit" />
                      </IconButton>
                      <IconButton
                        size="small"
                        disabled={idx === columns.length - 1}
                        onClick={() => handleReorder(idx, idx + 1)}
                        sx={{ p: 0.2 }}
                      >
                        <ArrowDownward fontSize="inherit" />
                      </IconButton>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{col.display_name}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{col.name}</TableCell>
                  <TableCell>
                    <Select
                      size="small"
                      value={col.data_type}
                      onChange={(e) => handleCheckTypeChange(col, e.target.value as ColumnType)}
                      sx={{ fontSize: '0.85rem' }}
                    >
                      {COLUMN_TYPES.map((t) => (
                        <MenuItem key={t} value={t}>
                          {t}
                        </MenuItem>
                      ))}
                    </Select>
                  </TableCell>
                  <TableCell align="center">
                    <Checkbox size="small" checked={col.is_required} disabled />
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      size="small"
                      label={col.is_sensitive ? 'Encrypted' : 'Normal'}
                      color={col.is_sensitive ? 'secondary' : 'default'}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <IconButton
                      size="small"
                      color="error"
                      disabled={columns.length <= 1}
                      onClick={() => handleDeleteColumn(col.id)}
                    >
                      <DeleteOutlined fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose}>Done</Button>
      </DialogActions>

      {/* Type Change Compatibility Modal */}
      {typeCheckData && (
        <Dialog open={Boolean(typeCheckData)} onClose={() => setTypeCheckData(null)} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
            <WarningAmberOutlined color="warning" /> Confirm Column Type Change
          </DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ mb: 2 }}>
              Changing column <strong>{typeCheckData.colName}</strong> type from{' '}
              <Chip label={typeCheckData.currentType} size="small" /> to{' '}
              <Chip label={typeCheckData.targetType} size="small" color="primary" />:
            </Typography>

            <Paper sx={{ p: 2, bgcolor: 'background.default', mb: 2 }}>
              <Typography variant="body2">
                Total Records: <strong>{typeCheckData.report.total_records}</strong>
              </Typography>
              <Typography variant="body2" sx={{ color: 'success.main' }}>
                Compatible Records: <strong>{typeCheckData.report.compatible_count}</strong>
              </Typography>
              <Typography variant="body2" sx={{ color: typeCheckData.report.incompatible_count > 0 ? 'error.main' : 'inherit' }}>
                Incompatible Records: <strong>{typeCheckData.report.incompatible_count}</strong>
              </Typography>
            </Paper>

            {typeCheckData.report.incompatible_count > 0 && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                Warning: {typeCheckData.report.incompatible_count} records contain values that cannot be converted and will become empty.
                Sample incompatible values:{' '}
                {typeCheckData.report.sample_incompatible_values.slice(0, 3).join(', ')}
              </Alert>
            )}
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setTypeCheckData(null)}>Cancel</Button>
            <Button variant="contained" color="warning" onClick={handleConfirmTypeChange} disabled={loading}>
              Confirm Conversion
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Dialog>
  );
};

export default TableSettingsModal;

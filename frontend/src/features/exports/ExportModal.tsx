import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  Paper,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/material';
import { FileDownload } from '@mui/icons-material';

import { apiClient } from '../../api/client';
import { DataTable } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  table: DataTable;
}

export const ExportModal: React.FC<Props> = ({ open, onClose, table }) => {
  const [format, setFormat] = useState<'XLSX' | 'CSV'>('XLSX');
  const [selectedColumnIds, setSelectedColumnIds] = useState<string[]>(() =>
    table.columns.map((c) => c.id)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggleColumn = (id: string) => {
    setSelectedColumnIds((prev) =>
      prev.includes(id) ? prev.filter((colId) => colId !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedColumnIds(table.columns.map((c) => c.id));
    } else {
      setSelectedColumnIds([]);
    }
  };

  const handleExport = async () => {
    if (selectedColumnIds.length === 0) {
      setError('Select at least one column to export.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.post(
        '/exports/generate',
        {
          table_id: table.id,
          export_format: format,
          selected_column_ids: selectedColumnIds,
        },
        { responseType: 'blob' }
      );

      // Trigger browser download
      const blob = new Blob([response.data], {
        type:
          format === 'XLSX'
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'text/csv',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${table.name}_export.${format.toLowerCase()}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to export table data.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
        <FileDownload color="primary" /> Export Table Data
      </DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2.5 }}>
            {error}
          </Alert>
        )}

        {/* Format selector */}
        <FormControl sx={{ mb: 3 }}>
          <FormLabel sx={{ fontWeight: 600, mb: 0.5 }}>Export File Format</FormLabel>
          <RadioGroup row value={format} onChange={(e) => setFormat(e.target.value as 'XLSX' | 'CSV')}>
            <FormControlLabel value="XLSX" control={<Radio />} label="Excel (.xlsx)" />
            <FormControlLabel value="CSV" control={<Radio />} label="CSV (.csv)" />
          </RadioGroup>
        </FormControl>

        {/* Columns selector */}
        <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Select Columns to Include ({selectedColumnIds.length} / {table.columns.length})
          </Typography>
          <Button
            size="small"
            onClick={() => handleSelectAll(selectedColumnIds.length !== table.columns.length)}
          >
            {selectedColumnIds.length === table.columns.length ? 'Deselect All' : 'Select All'}
          </Button>
        </Box>

        <Paper variant="outlined" sx={{ p: 2, maxHeight: 200, overflowY: 'auto', borderRadius: 2 }}>
          {table.columns.map((col) => (
            <Box key={col.id} sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={selectedColumnIds.includes(col.id)}
                    onChange={() => handleToggleColumn(col.id)}
                  />
                }
                label={
                  <Typography variant="body2">
                    {col.display_name}{' '}
                    {col.is_sensitive && (
                      <Typography component="span" variant="caption" color="secondary">
                        (Sensitive)
                      </Typography>
                    )}
                  </Typography>
                }
              />
            </Box>
          ))}
        </Paper>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleExport} disabled={loading} startIcon={<FileDownload />}>
          {loading ? <CircularProgress size={20} /> : `Download ${format}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ExportModal;

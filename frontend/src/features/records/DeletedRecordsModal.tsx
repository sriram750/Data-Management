import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
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
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Close,
  DeleteForeverOutlined,
  DeleteOutlined,
  RestoreFromTrashOutlined,
} from '@mui/icons-material';

import { apiClient } from '../../api/client';
import { DataTable, DeletedRecordItem } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  table: DataTable;
  onRestored: () => void;
}

export const DeletedRecordsModal: React.FC<Props> = ({ open, onClose, table, onRestored }) => {
  const [deletedRecords, setDeletedRecords] = useState<DeletedRecordItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [permanentDeletingId, setPermanentDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchDeleted = async () => {
    if (!open || !table) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<DeletedRecordItem[]>(`/tables/${table.id}/deleted-records`);
      setDeletedRecords(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load deleted records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchDeleted();
      setMessage(null);
    }
  }, [open, table]);

  const handleRestore = async (recordId: string) => {
    setRestoringId(recordId);
    setError(null);
    try {
      await apiClient.post(`/tables/${table.id}/records/${recordId}/restore-deleted`, {});
      setMessage('Record restored to active grid successfully!');
      fetchDeleted();
      onRestored();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to restore record.');
    } finally {
      setRestoringId(null);
    }
  };

  const handlePermanentDelete = async (recordId: string) => {
    if (!window.confirm('Are you sure you want to permanently erase this record? This action cannot be undone.')) {
      return;
    }
    setPermanentDeletingId(recordId);
    setError(null);
    try {
      await apiClient.delete(`/tables/${table.id}/records/${recordId}/permanent`);
      setMessage('Record permanently deleted.');
      fetchDeleted();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to permanently delete record.');
    } finally {
      setPermanentDeletingId(null);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <DeleteOutlined color="error" />
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Deleted Records (Recycle Bin)
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Table: <strong>{table.display_name}</strong> &bull; {deletedRecords.length} record{deletedRecords.length !== 1 ? 's' : ''} in trash
            </Typography>
          </Box>
        </Box>
        <IconButton size="small" onClick={onClose}>
          <Close />
        </IconButton>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ p: 3 }}>
        {message && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMessage(null)}>
            {message}
          </Alert>
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={36} />
          </Box>
        ) : deletedRecords.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <DeleteOutlined sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.secondary' }}>
              Recycle Bin is Empty
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 400, mx: 'auto', mt: 0.5 }}>
              No deleted records were found in this table. When records are deleted, you can view, audit, and restore them here.
            </Typography>
          </Box>
        ) : (
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, maxHeight: 420 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>#</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Record Data Preview</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Deleted By</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Deleted At</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {deletedRecords.map((item, idx) => (
                  <TableRow key={item.id} hover>
                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.8rem' }}>
                      {idx + 1}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 280 }}>
                      <Box sx={{ display: 'flex', gap: 0.8, flexWrap: 'wrap' }}>
                        {Object.entries(item.data_snapshot || {})
                          .slice(0, 3)
                          .map(([k, v]) => (
                            <Chip
                              key={k}
                              label={`${k}: ${String(v)}`}
                              size="small"
                              variant="outlined"
                              sx={{ fontSize: '0.72rem', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}
                            />
                          ))}
                        {Object.keys(item.data_snapshot || {}).length > 3 && (
                          <Chip
                            label={`+${Object.keys(item.data_snapshot).length - 3} more`}
                            size="small"
                            sx={{ fontSize: '0.7rem' }}
                          />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>
                        {item.deleted_by_name || 'Admin'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {new Date(item.deleted_at).toLocaleString()}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                        <Button
                          size="small"
                          variant="contained"
                          color="primary"
                          startIcon={<RestoreFromTrashOutlined />}
                          onClick={() => handleRestore(item.record_id)}
                          disabled={restoringId === item.record_id}
                          sx={{ textTransform: 'none', fontWeight: 600, py: 0.3 }}
                        >
                          {restoringId === item.record_id ? 'Restoring...' : 'Restore'}
                        </Button>
                        <Tooltip title="Delete Permanently">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handlePermanentDelete(item.record_id)}
                            disabled={permanentDeletingId === item.record_id}
                            sx={{ opacity: 0.8, '&:hover': { opacity: 1 } }}
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
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default DeletedRecordsModal;

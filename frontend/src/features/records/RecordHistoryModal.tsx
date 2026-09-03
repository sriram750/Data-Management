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
  Paper,
  Typography,
} from '@mui/material';
import { History, Restore } from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';

import { apiClient } from '../../api/client';
import { RecordVersion } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  recordId: string | null;
  onRestored: () => void;
}

export const RecordHistoryModal: React.FC<Props> = ({ open, onClose, recordId, onRestored }) => {
  const [versions, setVersions] = useState<RecordVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async () => {
    if (!recordId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<RecordVersion[]>(`/records/${recordId}/history`);
      setVersions(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load record history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && recordId) {
      fetchHistory();
    }
  }, [open, recordId]);

  const handleRestore = async (versionNumber: number) => {
    if (!recordId) return;
    setRestoringVersion(versionNumber);
    try {
      await apiClient.post(`/records/${recordId}/restore/${versionNumber}`, {});
      onRestored();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to restore version.');
    } finally {
      setRestoringVersion(null);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
        <History color="primary" /> Record Version History & Diffs
      </DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress size={32} />
          </Box>
        ) : versions.length === 0 ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', py: 3 }}>
            No history found for this record.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {versions.map((ver, idx) => (
              <Paper
                key={ver.id}
                variant="outlined"
                sx={{
                  p: 2.5,
                  borderRadius: 2,
                  border: idx === 0 ? '1px solid #6366f1' : undefined,
                  bgcolor: idx === 0 ? 'rgba(99, 102, 241, 0.05)' : 'background.paper',
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Chip
                      label={`Version ${ver.version_number}`}
                      size="small"
                      color={idx === 0 ? 'primary' : 'default'}
                      sx={{ fontWeight: 700 }}
                    />
                    <Chip
                      label={ver.change_type}
                      size="small"
                      variant="outlined"
                      color={ver.change_type === 'CREATE' ? 'success' : 'default'}
                    />
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {formatDistanceToNow(new Date(ver.created_at), { addSuffix: true })}
                    </Typography>
                  </Box>
                  {idx !== 0 && (
                    <Button
                      size="small"
                      variant="outlined"
                      color="secondary"
                      startIcon={<Restore />}
                      disabled={restoringVersion === ver.version_number}
                      onClick={() => handleRestore(ver.version_number)}
                    >
                      {restoringVersion === ver.version_number ? 'Restoring...' : 'Restore This Version'}
                    </Button>
                  )}
                </Box>

                {/* Delta / Changes */}
                {ver.delta && Object.keys(ver.delta).length > 0 ? (
                  <Box sx={{ mt: 1.5, p: 1.5, bgcolor: 'background.default', borderRadius: 1.5 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 1, color: 'text.secondary' }}>
                      Field Changes in this revision:
                    </Typography>
                    {Object.entries(ver.delta).map(([k, v]: [string, any]) => (
                      <Box key={k} sx={{ display: 'flex', gap: 1, fontSize: '0.825rem', mb: 0.5 }}>
                        <Typography variant="caption" sx={{ fontWeight: 600, minWidth: 100 }}>
                          {k}:
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'error.main', textDecoration: 'line-through' }}>
                          {String(v?.old ?? 'null')}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          &rarr;
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600 }}>
                          {String(v?.new ?? 'null')}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                ) : (
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
                    Initial record creation snapshot.
                  </Typography>
                )}
              </Paper>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default RecordHistoryModal;

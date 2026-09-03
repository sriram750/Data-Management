import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { DeleteOutlined } from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';

import { apiClient } from '../../api/client';
import { SessionResponse } from '../../types';

export const SessionsPage: React.FC = () => {
  const [sessions, setSessions] = useState<SessionResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<SessionResponse[]>('/auth/sessions');
      setSessions(res.data);
    } catch (err) {
      console.error('Failed to load sessions', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleRevoke = async (id: string) => {
    try {
      await apiClient.delete(`/auth/sessions/${id}`);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error('Failed to revoke session', err);
    }
  };

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>
          Active User Sessions
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          Monitor and revoke active authenticated client sessions.
        </Typography>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
          <CircularProgress size={36} />
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Client IP</TableCell>
                <TableCell>User Agent / Device</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Expires</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="center">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {s.ip_address || '127.0.0.1'}
                  </TableCell>
                  <TableCell sx={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.user_agent || 'Standard Web Browser'}
                  </TableCell>
                  <TableCell>
                    {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                  </TableCell>
                  <TableCell>
                    {formatDistanceToNow(new Date(s.expires_at), { addSuffix: true })}
                  </TableCell>
                  <TableCell>
                    {s.is_current ? (
                      <Chip label="CURRENT SESSION" size="small" color="primary" />
                    ) : (
                      <Chip label="ACTIVE" size="small" color="success" variant="outlined" />
                    )}
                  </TableCell>
                  <TableCell align="center">
                    {!s.is_current && (
                      <Button
                        size="small"
                        color="error"
                        variant="outlined"
                        startIcon={<DeleteOutlined />}
                        onClick={() => handleRevoke(s.id)}
                      >
                        Revoke
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default SessionsPage;

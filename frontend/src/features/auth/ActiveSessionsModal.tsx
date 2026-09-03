import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Typography,
} from '@mui/material';
import { DeleteOutlined, DevicesOutlined } from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';

import { apiClient } from '../../api/client';
import { SessionResponse } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
}

export const ActiveSessionsModal: React.FC<Props> = ({ open, onClose }) => {
  const [sessions, setSessions] = useState<SessionResponse[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<SessionResponse[]>('/auth/sessions');
      setSessions(res.data);
    } catch (e) {
      console.error('Failed to load sessions', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchSessions();
    }
  }, [open]);

  const handleRevoke = async (id: string) => {
    try {
      await apiClient.delete(`/auth/sessions/${id}`);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      console.error('Failed to revoke session', e);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Active Logged-in Sessions</DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress size={32} />
          </Box>
        ) : sessions.length === 0 ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', py: 3 }}>
            No active sessions found.
          </Typography>
        ) : (
          <List disablePadding>
            {sessions.map((s) => (
              <ListItem
                key={s.id}
                sx={{
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 2,
                  mb: 1.5,
                  display: 'flex',
                  alignItems: 'center',
                }}
                secondaryAction={
                  !s.is_current ? (
                    <IconButton edge="end" color="error" size="small" onClick={() => handleRevoke(s.id)}>
                      <DeleteOutlined fontSize="small" />
                    </IconButton>
                  ) : (
                    <Chip label="Current Session" size="small" color="primary" />
                  )
                }
              >
                <Box sx={{ mr: 2, color: 'text.secondary' }}>
                  <DevicesOutlined />
                </Box>
                <ListItemText
                  primary={
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      IP: {s.ip_address || 'Unknown IP'}
                    </Typography>
                  }
                  secondary={
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {s.user_agent ? s.user_agent.substring(0, 50) + '...' : 'Browser session'} &bull; Created{' '}
                      {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                    </Typography>
                  }
                />
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ActiveSessionsModal;

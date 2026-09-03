import React, { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Pagination,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { KeyOutlined } from '@mui/icons-material';
import { format } from 'date-fns';

import { apiClient } from '../../api/client';
import { AuditLogItem } from '../../types';

export const SensitiveAccessLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        const res = await apiClient.get<{ items: AuditLogItem[]; total: number }>('/audit/logs', {
          params: {
            page,
            page_size: 25,
            is_sensitive_only: true,
          },
        });
        setLogs(res.data.items);
        setTotal(res.data.total);
      } catch (err) {
        console.error('Failed to load sensitive access logs', err);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, [page]);

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>
          Sensitive Access & Secret Audit
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          Dedicated log of all sensitive operations: password reveals (PASSWORD_VIEWED), credential changes, and sensitive data exports.
        </Typography>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
          <CircularProgress size={36} />
        </Box>
      ) : logs.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 3, borderStyle: 'dashed' }}>
          <KeyOutlined sx={{ fontSize: 50, color: 'text.secondary', opacity: 0.4, mb: 1.5 }} />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            No sensitive access events recorded yet.
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            When users view passwords or export sensitive columns, audit entries appear here.
          </Typography>
        </Paper>
      ) : (
        <Box>
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3, mb: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Timestamp (UTC)</TableCell>
                  <TableCell>User</TableCell>
                  <TableCell>Sensitive Action</TableCell>
                  <TableCell>Table Name</TableCell>
                  <TableCell>Field Name</TableCell>
                  <TableCell>Client IP</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss')}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{log.username}</TableCell>
                    <TableCell>
                      <Chip
                        label={log.action}
                        size="small"
                        color={log.action === 'PASSWORD_VIEWED' ? 'secondary' : 'primary'}
                      />
                    </TableCell>
                    <TableCell>{log.table_name || '-'}</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: 'secondary.main' }}>
                      {log.field_name || '-'}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {log.ip_address || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <Pagination
              count={Math.ceil(total / 25)}
              page={page}
              onChange={(_, p) => setPage(p)}
              color="primary"
            />
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default SensitiveAccessLogsPage;

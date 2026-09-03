import React, { useEffect, useState } from 'react';
import {
  Box,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Pagination,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { FactCheckOutlined } from '@mui/icons-material';
import { format } from 'date-fns';

import { apiClient } from '../../api/client';
import { AuditLogItem } from '../../types';

export const AuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [actionFilter, setActionFilter] = useState('');
  const [usernameFilter, setUsernameFilter] = useState('');
  const [tableFilter, setTableFilter] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<{ items: AuditLogItem[]; total: number }>('/audit/logs', {
        params: {
          page,
          page_size: 25,
          action: actionFilter || undefined,
          username: usernameFilter || undefined,
          table_name: tableFilter || undefined,
        },
      });
      setLogs(res.data.items);
      setTotal(res.data.total);
    } catch (err) {
      console.error('Failed to load audit logs', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, actionFilter, usernameFilter, tableFilter]);

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>
          Audit Trail & Governance
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          Append-only, tamper-resistant record of every system event, record mutation, schema modification, and authentication event.
        </Typography>
      </Box>

      {/* Filter Bar */}
      <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              fullWidth
              size="small"
              label="Filter by Username"
              value={usernameFilter}
              onChange={(e) => {
                setUsernameFilter(e.target.value);
                setPage(1);
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              fullWidth
              size="small"
              label="Filter by Table Name"
              value={tableFilter}
              onChange={(e) => {
                setTableFilter(e.target.value);
                setPage(1);
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Filter by Action</InputLabel>
              <Select
                value={actionFilter}
                label="Filter by Action"
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setPage(1);
                }}
              >
                <MenuItem value="">All Actions</MenuItem>
                <MenuItem value="LOGIN">LOGIN</MenuItem>
                <MenuItem value="LOGOUT">LOGOUT</MenuItem>
                <MenuItem value="LOGIN_FAILED">LOGIN_FAILED</MenuItem>
                <MenuItem value="CREATE">CREATE (Record)</MenuItem>
                <MenuItem value="UPDATE">UPDATE (Record)</MenuItem>
                <MenuItem value="DELETE">DELETE (Record)</MenuItem>
                <MenuItem value="TABLE_CREATED">TABLE_CREATED</MenuItem>
                <MenuItem value="TABLE_UPDATED">TABLE_UPDATED</MenuItem>
                <MenuItem value="TABLE_DELETED">TABLE_DELETED</MenuItem>
                <MenuItem value="COLUMN_CREATED">COLUMN_CREATED</MenuItem>
                <MenuItem value="COLUMN_UPDATED">COLUMN_UPDATED</MenuItem>
                <MenuItem value="COLUMN_DELETED">COLUMN_DELETED</MenuItem>
                <MenuItem value="PASSWORD_VIEWED">PASSWORD_VIEWED</MenuItem>
                <MenuItem value="IMPORT">IMPORT</MenuItem>
                <MenuItem value="EXPORT">EXPORT</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {/* Audit Table */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
          <CircularProgress size={36} />
        </Box>
      ) : logs.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 3, borderStyle: 'dashed' }}>
          <FactCheckOutlined sx={{ fontSize: 50, color: 'text.secondary', opacity: 0.4, mb: 1.5 }} />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            No audit logs found.
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
                  <TableCell>Action</TableCell>
                  <TableCell>Target Table</TableCell>
                  <TableCell>Field / Details</TableCell>
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
                        color={
                          log.action.includes('DELETE') || log.action === 'LOGIN_FAILED'
                            ? 'error'
                            : log.action.includes('PASSWORD')
                            ? 'secondary'
                            : log.action.includes('CREATE') || log.action === 'LOGIN'
                            ? 'success'
                            : 'primary'
                        }
                        variant="outlined"
                        sx={{ fontSize: '0.75rem', fontWeight: 600 }}
                      />
                    </TableCell>
                    <TableCell>{log.table_name || '-'}</TableCell>
                    <TableCell sx={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {log.field_name && (
                        <Typography component="span" variant="caption" sx={{ fontWeight: 700, mr: 1 }}>
                          [{log.field_name}]
                        </Typography>
                      )}
                      {log.details ? JSON.stringify(log.details) : log.old_value ? `Old: ${log.old_value}` : '-'}
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

export default AuditLogsPage;

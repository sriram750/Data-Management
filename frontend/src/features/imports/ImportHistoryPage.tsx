import React, { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
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
import { FileUploadOutlined } from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';

import { apiClient } from '../../api/client';
import { ImportHistoryItem } from '../../types';

export const ImportHistoryPage: React.FC = () => {
  const [history, setHistory] = useState<ImportHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await apiClient.get<ImportHistoryItem[]>('/imports/history');
        setHistory(res.data);
      } catch (err) {
        console.error('Failed to load import history', err);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>
          Import History
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          Audit trail of all spreadsheet import jobs, row validation summaries, and execution statuses.
        </Typography>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
          <CircularProgress size={36} />
        </Box>
      ) : history.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 3, borderStyle: 'dashed' }}>
          <FileUploadOutlined sx={{ fontSize: 50, color: 'text.secondary', opacity: 0.4, mb: 1.5 }} />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            No import history yet.
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            When users import Excel files, records will be logged here.
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Date & Time</TableCell>
                <TableCell>Table Name</TableCell>
                <TableCell>File Name</TableCell>
                <TableCell align="center">Imported</TableCell>
                <TableCell align="center">Warnings</TableCell>
                <TableCell align="center">Errors</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Imported By</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {history.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{item.table_name}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{item.file_name}</TableCell>
                  <TableCell align="center">
                    <Chip label={item.imported_rows} size="small" color="success" />
                  </TableCell>
                  <TableCell align="center">
                    <Chip label={item.warning_rows} size="small" color={item.warning_rows > 0 ? 'warning' : 'default'} />
                  </TableCell>
                  <TableCell align="center">
                    <Chip label={item.error_rows} size="small" color={item.error_rows > 0 ? 'error' : 'default'} />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={item.status}
                      size="small"
                      variant="outlined"
                      color={item.status === 'COMPLETED' ? 'success' : 'warning'}
                    />
                  </TableCell>
                  <TableCell>{item.imported_by_username || 'System'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default ImportHistoryPage;

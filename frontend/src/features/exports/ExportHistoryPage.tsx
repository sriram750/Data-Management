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
import { FileDownloadOutlined } from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';

import { apiClient } from '../../api/client';
import { ExportHistoryItem } from '../../types';

export const ExportHistoryPage: React.FC = () => {
  const [history, setHistory] = useState<ExportHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await apiClient.get<ExportHistoryItem[]>('/exports/history');
        setHistory(res.data);
      } catch (err) {
        console.error('Failed to load export history', err);
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
          Export History
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          Audit records of all data exports, formats, permitted column subsets, and exporting users.
        </Typography>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
          <CircularProgress size={36} />
        </Box>
      ) : history.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 3, borderStyle: 'dashed' }}>
          <FileDownloadOutlined sx={{ fontSize: 50, color: 'text.secondary', opacity: 0.4, mb: 1.5 }} />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            No export history yet.
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            When users export data to XLSX or CSV, audit logs are tracked here.
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Date & Time</TableCell>
                <TableCell>Table Name</TableCell>
                <TableCell>Format</TableCell>
                <TableCell align="center">Rows Exported</TableCell>
                <TableCell>Exported Columns</TableCell>
                <TableCell>Exported By</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {history.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{item.table_name}</TableCell>
                  <TableCell>
                    <Chip
                      label={item.export_format}
                      size="small"
                      color={item.export_format === 'XLSX' ? 'primary' : 'secondary'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {item.total_rows}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {item.exported_columns.map((c) => (
                        <Chip key={c} label={c} size="small" sx={{ height: 20, fontSize: '0.7rem' }} />
                      ))}
                    </Box>
                  </TableCell>
                  <TableCell>{item.exported_by_username || 'System'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default ExportHistoryPage;

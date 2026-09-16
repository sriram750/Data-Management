import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Paper,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  AddCircleOutlined,
  AssessmentOutlined,
  CloudSyncOutlined,
  EditNoteOutlined,
  FileUploadOutlined,
  HistoryOutlined,
  LockOutlined,
  PeopleAltOutlined,
  TableChartOutlined,
  TableView,
} from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';

import { apiClient } from '../../api/client';
import { DashboardMetrics } from '../../types';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = async () => {
    try {
      const res = await apiClient.get<DashboardMetrics>('/dashboard/metrics');
      setMetrics(res.data);
    } catch (e) {
      console.error('Failed to load dashboard metrics', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <CircularProgress size={40} />
      </Box>
    );
  }

  const statCards = [
    {
      title: 'Total Tables',
      value: metrics?.total_tables ?? 0,
      icon: <TableChartOutlined fontSize="medium" />,
      color: '#6366f1',
      bgGradient: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(99, 102, 241, 0.05) 100%)',
    },
    {
      title: 'Total Records',
      value: metrics?.total_records ?? 0,
      icon: <AssessmentOutlined fontSize="medium" />,
      color: '#10b981',
      bgGradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(16, 185, 129, 0.05) 100%)',
    },
    {
      title: 'Active Users',
      value: `${metrics?.active_users ?? 0} / ${metrics?.total_users ?? 0}`,
      icon: <PeopleAltOutlined fontSize="medium" />,
      color: '#0ea5e9',
      bgGradient: 'linear-gradient(135deg, rgba(14, 165, 233, 0.15) 0%, rgba(14, 165, 233, 0.05) 100%)',
    },
    {
      title: 'Changes Today',
      value: metrics?.changes_today ?? 0,
      icon: <EditNoteOutlined fontSize="medium" />,
      color: '#f59e0b',
      bgGradient: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(245, 158, 11, 0.05) 100%)',
    },
    {
      title: 'Imports Today List',
      value: metrics?.imports_today ?? 0,
      icon: <FileUploadOutlined fontSize="medium" />,
      color: '#8b5cf6',
      bgGradient: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(139, 92, 246, 0.05) 100%)',
    },
    {
      title: 'Exports Today',
      value: metrics?.exports_today ?? 0,
      icon: <CloudSyncOutlined fontSize="medium" />,
      color: '#ec4899',
      bgGradient: 'linear-gradient(135deg, rgba(236, 72, 153, 0.15) 0%, rgba(236, 72, 153, 0.05) 100%)',
    },
  ];

  return (
    <Box>
      {/* Header Banner */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3.5, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            Enterprise Data Management
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Real-time PostgreSQL metrics and live dynamic table activity.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button
            variant="outlined"
            startIcon={<FileUploadOutlined />}
            onClick={() => navigate('/imports/wizard')}
          >
            Import Excel
          </Button>
          <Button
            variant="contained"
            startIcon={<AddCircleOutlined />}
            onClick={() => navigate('/tables/create')}
          >
            Create Table
          </Button>
        </Box>
      </Box>

      {/* Metric Cards Grid */}
      <Grid container spacing={2.5} sx={{ mb: 4 }}>
        {statCards.map((card, idx) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={idx}>
            <Card
              sx={{
                background: card.bgGradient,
                border: `1px solid ${card.color}30`,
                transition: 'transform 0.2s, box-shadow 0.2s',
                '&:hover': {
                  transform: 'translateY(-3px)',
                  boxShadow: `0 8px 24px ${card.color}25`,
                },
              }}
            >
              <CardContent sx={{ p: 2.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                    {card.title}
                  </Typography>
                  <Avatar
                    variant="rounded"
                    sx={{
                      bgcolor: `${card.color}20`,
                      color: card.color,
                      width: 42,
                      height: 42,
                    }}
                  >
                    {card.icon}
                  </Avatar>
                </Box>
                <Typography variant="h4" sx={{ fontWeight: 800, mt: 1.5, color: 'text.primary' }}>
                  {card.value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Main Bottom Section: Recent Activity & Quick Hub */}
      <Grid container spacing={3}>
        {/* Recent Real Activity */}
        <Grid size={{ xs: 12, md: 7 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Recent Activity Stream
                </Typography>
                <Button size="small" onClick={() => navigate('/audit/logs')} endIcon={<HistoryOutlined />}>
                  View All Logs
                </Button>
              </Box>
              <Divider sx={{ mb: 2 }} />

              {!metrics?.recent_activities || metrics.recent_activities.length === 0 ? (
                <Box sx={{ py: 6, textAlign: 'center' }}>
                  <HistoryOutlined sx={{ fontSize: 48, color: 'text.secondary', opacity: 0.4, mb: 1 }} />
                  <Typography variant="body1" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                    No activity yet.
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Import an Excel file or create records to see real activity logs.
                  </Typography>
                </Box>
              ) : (
                <List disablePadding>
                  {metrics.recent_activities.slice(0, 8).map((act) => (
                    <ListItem
                      key={act.id}
                      sx={{
                        px: 1.5,
                        py: 1,
                        borderRadius: 2,
                        mb: 1,
                        bgcolor: 'background.default',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                      }}
                    >
                      <ListItemAvatar>
                        <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: '0.8rem' }}>
                          {act.username?.charAt(0)?.toUpperCase() || 'U'}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {act.username} &bull;{' '}
                            <Typography component="span" variant="body2" color="primary.main">
                              {act.description}
                            </Typography>
                          </Typography>
                        }
                        secondary={
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {formatDistanceToNow(new Date(act.timestamp), { addSuffix: true })}
                          </Typography>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Quick Launch & Zero State Guidance */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                Dynamic Table Hub
              </Typography>
              <Divider sx={{ mb: 2 }} />

              {metrics?.total_tables === 0 ? (
                <Paper
                  variant="outlined"
                  sx={{
                    p: 3,
                    textAlign: 'center',
                    borderRadius: 2,
                    bgcolor: 'background.default',
                    borderStyle: 'dashed',
                  }}
                >
                  <TableView sx={{ fontSize: 44, color: 'text.secondary', opacity: 0.5, mb: 1.5 }} />
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    No tables created yet.
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2.5 }}>
                    Upload an existing Excel spreadsheet to auto-detect columns, or build a new custom dynamic schema from scratch.
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Button
                      variant="contained"
                      fullWidth
                      startIcon={<FileUploadOutlined />}
                      onClick={() => navigate('/imports/wizard')}
                    >
                      Import Spreadsheet (.xlsx)
                    </Button>
                    <Button
                      variant="outlined"
                      fullWidth
                      startIcon={<AddCircleOutlined />}
                      onClick={() => navigate('/tables/create')}
                    >
                      Build Table Manually
                    </Button>
                  </Box>
                </Paper>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Paper
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      bgcolor: 'background.default',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                    onClick={() => navigate('/tables')}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <TableChartOutlined color="primary" />
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                          Browse All Tables
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          View and manage {metrics?.total_tables} dynamic tables
                        </Typography>
                      </Box>
                    </Box>
                    <Button size="small">Open</Button>
                  </Paper>

                  <Paper
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      bgcolor: 'background.default',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                    onClick={() => navigate('/imports/wizard')}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <FileUploadOutlined color="secondary" />
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                          Import Additional Data
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          Upload and validate spreadsheet data
                        </Typography>
                      </Box>
                    </Box>
                    <Button size="small">Import</Button>
                  </Paper>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardPage;

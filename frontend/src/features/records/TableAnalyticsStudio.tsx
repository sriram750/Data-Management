import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  Chip,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Tooltip as MuiTooltip,
  Typography,
} from '@mui/material';
import {
  BarChart as BarChartIcon,
  Close,
  Download,
  Equalizer,
  PieChart as PieChartIcon,
  Refresh,
  ShowChart,
  Storage,
  TableChart,
  Timeline,
  TrendingUp,
  Tune,
} from '@mui/icons-material';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useThemeMode } from '../../context/ThemeContext';
import { DataColumn, DataRecord, DataTable } from '../../types';

interface TableAnalyticsStudioProps {
  table: DataTable;
  records: DataRecord[];
  totalRecords: number;
  onSwitchToGrid?: () => void;
}

const PALETTE = [
  '#2563eb', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#6366f1', // Indigo
];

export const TableAnalyticsStudio: React.FC<TableAnalyticsStudioProps> = ({
  table,
  records,
  totalRecords,
  onSwitchToGrid,
}) => {
  const { mode } = useThemeMode();

  // Extract pure rows
  const rowData = useMemo(() => records.map((r) => r.data || {}), [records]);

  // Separate column types
  const numericColumns = useMemo(
    () =>
      table.columns.filter((c) =>
        ['NUMBER', 'DECIMAL', 'CURRENCY'].includes(c.data_type)
      ),
    [table.columns]
  );

  const categoricalColumns = useMemo(
    () =>
      table.columns.filter(
        (c) =>
          !['FILE', 'PASSWORD'].includes(c.data_type) &&
          !c.is_hidden
      ),
    [table.columns]
  );

  // Configuration Drawer State
  const [configDrawerOpen, setConfigDrawerOpen] = useState(false);
  const [chartType, setChartType] = useState<'bar' | 'line' | 'area' | 'donut'>('bar');
  const [selectedXCol, setSelectedXCol] = useState<string>(() => {
    return categoricalColumns[0]?.name || '';
  });
  const [selectedYCol, setSelectedYCol] = useState<string>(() => {
    return numericColumns[0]?.name || '__count__';
  });
  const [aggregation, setAggregation] = useState<'sum' | 'avg' | 'count' | 'max' | 'min'>('sum');

  // KPI 1: Primary Numeric Metric (Sum & Avg of 1st numeric col)
  const primaryMetric = useMemo(() => {
    if (!numericColumns.length || !rowData.length) {
      return { colName: 'Count', sum: rowData.length, avg: 1 };
    }
    const targetCol = numericColumns[0].name;
    let sum = 0;
    let validCount = 0;
    rowData.forEach((row) => {
      const val = parseFloat(row[targetCol]);
      if (!isNaN(val)) {
        sum += val;
        validCount++;
      }
    });
    const avg = validCount > 0 ? sum / validCount : 0;
    return {
      colName: numericColumns[0].display_name,
      sum,
      avg,
    };
  }, [numericColumns, rowData]);

  // KPI 2: Top Category in dataset
  const topCategoryStat = useMemo(() => {
    if (!categoricalColumns.length || !rowData.length) {
      return { colName: 'Category', topVal: 'N/A', count: 0, percent: 0 };
    }
    const targetCol = categoricalColumns[0].name;
    const frequency: Record<string, number> = {};
    rowData.forEach((row) => {
      const val = String(row[targetCol] ?? '').trim();
      if (val) {
        frequency[val] = (frequency[val] || 0) + 1;
      }
    });
    let topVal = 'N/A';
    let maxCount = 0;
    Object.entries(frequency).forEach(([val, count]) => {
      if (count > maxCount) {
        maxCount = count;
        topVal = val;
      }
    });
    const percent = rowData.length ? Math.round((maxCount / rowData.length) * 100) : 0;
    return {
      colName: categoricalColumns[0].display_name,
      topVal,
      count: maxCount,
      percent,
    };
  }, [categoricalColumns, rowData]);

  // KPI 3: Data Health / Completeness Rate
  const dataHealth = useMemo(() => {
    if (!rowData.length || !table.columns.length) return 100;
    const totalCells = rowData.length * table.columns.length;
    let filledCells = 0;
    rowData.forEach((row) => {
      table.columns.forEach((col) => {
        const val = row[col.name];
        if (val !== null && val !== undefined && String(val).trim() !== '') {
          filledCells++;
        }
      });
    });
    return Math.round((filledCells / totalCells) * 100);
  }, [rowData, table.columns]);

  // Process data for the main customizable chart
  const customChartData = useMemo(() => {
    if (!rowData.length || !selectedXCol) return [];

    const grouped: Record<string, { total: number; count: number; max: number; min: number }> = {};

    rowData.forEach((row) => {
      const xRaw = row[selectedXCol];
      const xKey = xRaw !== null && xRaw !== undefined && String(xRaw).trim() !== ''
        ? String(xRaw)
        : '(Empty)';

      let yVal = 1;
      if (selectedYCol !== '__count__') {
        const parsed = parseFloat(row[selectedYCol]);
        yVal = isNaN(parsed) ? 0 : parsed;
      }

      if (!grouped[xKey]) {
        grouped[xKey] = { total: yVal, count: 1, max: yVal, min: yVal };
      } else {
        grouped[xKey].total += yVal;
        grouped[xKey].count += 1;
        grouped[xKey].max = Math.max(grouped[xKey].max, yVal);
        grouped[xKey].min = Math.min(grouped[xKey].min, yVal);
      }
    });

    return Object.entries(grouped)
      .map(([key, stats]) => {
        let value = stats.total;
        if (selectedYCol === '__count__' || aggregation === 'count') {
          value = stats.count;
        } else if (aggregation === 'avg') {
          value = stats.count > 0 ? stats.total / stats.count : 0;
        } else if (aggregation === 'max') {
          value = stats.max;
        } else if (aggregation === 'min') {
          value = stats.min;
        }
        return {
          name: key.length > 20 ? key.slice(0, 18) + '...' : key,
          fullName: key,
          value: parseFloat(value.toFixed(2)),
          count: stats.count,
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 14); // Top 14 categories for visual clarity
  }, [rowData, selectedXCol, selectedYCol, aggregation]);

  // Donut chart distribution (top categories)
  const donutData = useMemo(() => {
    if (!rowData.length || !categoricalColumns.length) return [];
    const targetCol = selectedXCol || categoricalColumns[0].name;
    const counts: Record<string, number> = {};
    rowData.forEach((row) => {
      const val = String(row[targetCol] ?? '').trim() || 'Other';
      counts[val] = (counts[val] || 0) + 1;
    });

    const sorted = Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Group items after top 4 into 'Others'
    if (sorted.length > 5) {
      const top4 = sorted.slice(0, 4);
      const othersVal = sorted.slice(4).reduce((sum, item) => sum + item.value, 0);
      return [...top4, { name: 'Others', value: othersVal }];
    }
    return sorted;
  }, [rowData, categoricalColumns, selectedXCol]);

  // Record growth over time (timeline area chart)
  const timelineData = useMemo(() => {
    if (!records.length) return [];
    const dateCounts: Record<string, number> = {};

    records.forEach((r) => {
      const d = r.created_at ? new Date(r.created_at) : new Date();
      const dateKey = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      dateCounts[dateKey] = (dateCounts[dateKey] || 0) + 1;
    });

    let runningTotal = 0;
    return Object.entries(dateCounts).map(([date, count]) => {
      runningTotal += count;
      return {
        date,
        newRecords: count,
        totalCumulative: runningTotal,
      };
    });
  }, [records]);

  const customTooltipStyle = {
    backgroundColor: mode === 'dark' ? '#1e293b' : '#ffffff',
    border: mode === 'dark' ? '1px solid rgba(255,255,255,0.1)' : '1px solid #e2e8f0',
    borderRadius: '12px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
    padding: '10px 14px',
    fontSize: '0.82rem',
    color: mode === 'dark' ? '#f8fafc' : '#0f172a',
  };

  return (
    <Box sx={{ width: '100%', py: 1 }}>
      {/* Top Action Subheader */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 3,
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
            <Typography
              variant="h5"
              sx={{ fontWeight: 800, letterSpacing: '-0.02em', color: 'text.primary' }}
            >
              {table.display_name} • Analytics Studio
            </Typography>
            <Chip
              label="Real-time Visuals"
              size="small"
              sx={{
                bgcolor: mode === 'dark' ? 'rgba(37, 99, 235, 0.2)' : '#eff6ff',
                color: '#2563eb',
                fontWeight: 700,
                fontSize: '0.75rem',
              }}
            />
          </Box>
          <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
            Dynamic KPI summaries, distribution charts, and multi-dimensional analytics for {totalRecords} records.
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          {onSwitchToGrid && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<TableChart />}
              onClick={onSwitchToGrid}
              sx={{
                borderRadius: '9999px',
                textTransform: 'none',
                fontWeight: 600,
                px: 2,
              }}
            >
              Switch to Grid View
            </Button>
          )}

          {/* Chart Configuration Drawer Toggle */}
          <Button
            variant="contained"
            size="small"
            startIcon={<Tune />}
            onClick={() => setConfigDrawerOpen(true)}
            sx={{
              borderRadius: '9999px',
              px: 2.4,
              py: 0.8,
              textTransform: 'none',
              fontWeight: 700,
              fontSize: '0.85rem',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
              bgcolor: '#2563eb',
              '&:hover': { bgcolor: '#1d4ed8' },
            }}
          >
            Chart Configurations
          </Button>
        </Box>
      </Box>

      {/* TOP 4 SUMMARY KPI CARDS (Matching Reference Image) */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
          gap: 2.5,
          mb: 3.5,
        }}
      >
        {/* Card 1: Total Records */}
        <Paper
          elevation={0}
          sx={{
            p: 2.5,
            borderRadius: '20px',
            border: mode === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid #eef2f6',
            bgcolor: mode === 'dark' ? '#0f172a' : '#ffffff',
            boxShadow: '0 4px 20px rgba(0,0,0,0.02)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
          }}
        >
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              Total Rows / Records
            </Typography>
            <Typography
              variant="h4"
              sx={{ fontWeight: 800, mt: 0.5, mb: 0.5, color: 'text.primary', letterSpacing: '-0.02em' }}
            >
              {totalRecords.toLocaleString()}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <TrendingUp sx={{ color: '#10b981', fontSize: 16 }} />
              <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 700 }}>
                100% Active Dataset
              </Typography>
            </Box>
          </Box>
          <Box
            sx={{
              p: 1.2,
              borderRadius: '14px',
              bgcolor: mode === 'dark' ? 'rgba(37, 99, 235, 0.15)' : '#eff6ff',
              color: '#2563eb',
            }}
          >
            <TableChart fontSize="small" />
          </Box>
        </Paper>

        {/* Card 2: Average / Metric */}
        <Paper
          elevation={0}
          sx={{
            p: 2.5,
            borderRadius: '20px',
            border: mode === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid #eef2f6',
            bgcolor: mode === 'dark' ? '#0f172a' : '#ffffff',
            boxShadow: '0 4px 20px rgba(0,0,0,0.02)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
          }}
        >
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              Average {primaryMetric.colName}
            </Typography>
            <Typography
              variant="h4"
              sx={{ fontWeight: 800, mt: 0.5, mb: 0.5, color: 'text.primary', letterSpacing: '-0.02em' }}
            >
              {primaryMetric.avg > 1000
                ? primaryMetric.avg.toLocaleString(undefined, { maximumFractionDigits: 1 })
                : primaryMetric.avg.toFixed(2)}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
              Sum: {primaryMetric.sum.toLocaleString()}
            </Typography>
          </Box>
          <Box
            sx={{
              p: 1.2,
              borderRadius: '14px',
              bgcolor: mode === 'dark' ? 'rgba(16, 185, 129, 0.15)' : '#ecfdf5',
              color: '#10b981',
            }}
          >
            <Equalizer fontSize="small" />
          </Box>
        </Paper>

        {/* Card 3: Top Category */}
        <Paper
          elevation={0}
          sx={{
            p: 2.5,
            borderRadius: '20px',
            border: mode === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid #eef2f6',
            bgcolor: mode === 'dark' ? '#0f172a' : '#ffffff',
            boxShadow: '0 4px 20px rgba(0,0,0,0.02)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              Top {topCategoryStat.colName}
            </Typography>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 800,
                mt: 0.8,
                mb: 0.5,
                color: 'text.primary',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                letterSpacing: '-0.02em',
              }}
              title={topCategoryStat.topVal}
            >
              {topCategoryStat.topVal}
            </Typography>
            <Typography variant="caption" sx={{ color: '#2563eb', fontWeight: 700 }}>
              {topCategoryStat.percent}% of records ({topCategoryStat.count})
            </Typography>
          </Box>
          <Box
            sx={{
              p: 1.2,
              borderRadius: '14px',
              bgcolor: mode === 'dark' ? 'rgba(245, 158, 11, 0.15)' : '#fffbeb',
              color: '#f59e0b',
            }}
          >
            <PieChartIcon fontSize="small" />
          </Box>
        </Paper>

        {/* Card 4: Data Completeness Health */}
        <Paper
          elevation={0}
          sx={{
            p: 2.5,
            borderRadius: '20px',
            border: mode === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid #eef2f6',
            bgcolor: mode === 'dark' ? '#0f172a' : '#ffffff',
            boxShadow: '0 4px 20px rgba(0,0,0,0.02)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
          }}
        >
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              Data Quality Rate
            </Typography>
            <Typography
              variant="h4"
              sx={{ fontWeight: 800, mt: 0.5, mb: 0.5, color: 'text.primary', letterSpacing: '-0.02em' }}
            >
              {dataHealth}%
            </Typography>
            <Typography variant="caption" sx={{ color: dataHealth >= 90 ? '#10b981' : '#f59e0b', fontWeight: 700 }}>
              {dataHealth >= 90 ? 'Excellent integrity' : 'Some missing values'}
            </Typography>
          </Box>
          <Box
            sx={{
              p: 1.2,
              borderRadius: '14px',
              bgcolor: mode === 'dark' ? 'rgba(139, 92, 246, 0.15)' : '#f5f3ff',
              color: '#8b5cf6',
            }}
          >
            <Storage fontSize="small" />
          </Box>
        </Paper>
      </Box>

      {/* Empty State when zero records */}
      {records.length === 0 ? (
        <Paper
          elevation={0}
          sx={{
            p: 8,
            textAlign: 'center',
            borderRadius: '24px',
            border: '1px dashed',
            borderColor: mode === 'dark' ? 'rgba(255,255,255,0.1)' : '#e2e8f0',
            bgcolor: mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#f8fafc',
          }}
        >
          <Equalizer sx={{ fontSize: 60, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            No Data Available for Visualization
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 450, mx: 'auto', mt: 1, mb: 3 }}>
            This table currently has zero active records. Add records via grid or import an Excel spreadsheet to start viewing real-time charts.
          </Typography>
          {onSwitchToGrid && (
            <Button variant="contained" onClick={onSwitchToGrid} sx={{ borderRadius: '9999px', textTransform: 'none' }}>
              Go to Grid View
            </Button>
          )}
        </Paper>
      ) : (
        /* MAIN CHARTS GRID */
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 3 }}>
          {/* Main Configured Chart Widget */}
          <Paper
            elevation={0}
            sx={{
              p: 3,
              borderRadius: '24px',
              border: mode === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid #eef2f6',
              bgcolor: mode === 'dark' ? '#0f172a' : '#ffffff',
              boxShadow: '0 4px 20px rgba(0,0,0,0.02)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'text.primary' }}>
                  {aggregation.toUpperCase()} of {selectedYCol === '__count__' ? 'Record Count' : selectedYCol} by {selectedXCol}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Showing top {customChartData.length} distribution categories
                </Typography>
              </Box>

              <MuiTooltip title="Configure chart axes & type">
                <IconButton size="small" onClick={() => setConfigDrawerOpen(true)}>
                  <Tune fontSize="small" />
                </IconButton>
              </MuiTooltip>
            </Box>

            <Box sx={{ width: '100%', height: 340 }}>
              <ResponsiveContainer width="100%" height="100%">
                {chartType === 'bar' ? (
                  <BarChart data={customChartData} margin={{ top: 10, right: 20, left: -10, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={mode === 'dark' ? 'rgba(255,255,255,0.06)' : '#f1f5f9'} />
                    <XAxis
                      dataKey="name"
                      stroke={mode === 'dark' ? '#94a3b8' : '#64748b'}
                      fontSize={11}
                      tickLine={false}
                      angle={-25}
                      textAnchor="end"
                    />
                    <YAxis stroke={mode === 'dark' ? '#94a3b8' : '#64748b'} fontSize={11} tickLine={false} />
                    <Tooltip contentStyle={customTooltipStyle} />
                    <Bar dataKey="value" fill="#2563eb" radius={[6, 6, 0, 0]}>
                      {customChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PALETTE[index % PALETTE.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                ) : chartType === 'line' ? (
                  <LineChart data={customChartData} margin={{ top: 10, right: 20, left: -10, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={mode === 'dark' ? 'rgba(255,255,255,0.06)' : '#f1f5f9'} />
                    <XAxis dataKey="name" stroke={mode === 'dark' ? '#94a3b8' : '#64748b'} fontSize={11} angle={-25} textAnchor="end" />
                    <YAxis stroke={mode === 'dark' ? '#94a3b8' : '#64748b'} fontSize={11} />
                    <Tooltip contentStyle={customTooltipStyle} />
                    <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                ) : chartType === 'area' ? (
                  <AreaChart data={customChartData} margin={{ top: 10, right: 20, left: -10, bottom: 25 }}>
                    <defs>
                      <linearGradient id="primaryAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={mode === 'dark' ? 'rgba(255,255,255,0.06)' : '#f1f5f9'} />
                    <XAxis dataKey="name" stroke={mode === 'dark' ? '#94a3b8' : '#64748b'} fontSize={11} angle={-25} textAnchor="end" />
                    <YAxis stroke={mode === 'dark' ? '#94a3b8' : '#64748b'} fontSize={11} />
                    <Tooltip contentStyle={customTooltipStyle} />
                    <Area type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2.5} fillOpacity={1} fill="url(#primaryAreaGrad)" />
                  </AreaChart>
                ) : (
                  <PieChart>
                    <Tooltip contentStyle={customTooltipStyle} />
                    <Legend />
                    <Pie data={customChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={110} paddingAngle={3}>
                      {customChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PALETTE[index % PALETTE.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                )}
              </ResponsiveContainer>
            </Box>
          </Paper>

          {/* Donut Distribution Breakdown Widget */}
          <Paper
            elevation={0}
            sx={{
              p: 3,
              borderRadius: '24px',
              border: mode === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid #eef2f6',
              bgcolor: mode === 'dark' ? '#0f172a' : '#ffffff',
              boxShadow: '0 4px 20px rgba(0,0,0,0.02)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'text.primary' }}>
                Distribution Breakdown
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Proportional share by {selectedXCol}
              </Typography>
            </Box>

            <Box sx={{ width: '100%', height: 260, my: 1 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip contentStyle={customTooltipStyle} />
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={95}
                    paddingAngle={3}
                  >
                    {donutData.map((_, index) => (
                      <Cell key={`donut-${index}`} fill={PALETTE[index % PALETTE.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </Box>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center' }}>
              {donutData.map((item, idx) => (
                <Chip
                  key={idx}
                  size="small"
                  label={`${item.name}: ${item.value}`}
                  sx={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    bgcolor: mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#f8fafc',
                    borderLeft: `4px solid ${PALETTE[idx % PALETTE.length]}`,
                  }}
                />
              ))}
            </Box>
          </Paper>

          {/* Record Cumulative Growth / Creation Timeline (Full Width) */}
          <Paper
            elevation={0}
            sx={{
              gridColumn: { xs: '1', lg: '1 / -1' },
              p: 3,
              borderRadius: '24px',
              border: mode === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid #eef2f6',
              bgcolor: mode === 'dark' ? '#0f172a' : '#ffffff',
              boxShadow: '0 4px 20px rgba(0,0,0,0.02)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'text.primary' }}>
                  Record Timeline & Cumulative Growth
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Ingestion and update timeline tracking active database records
                </Typography>
              </Box>
              <Chip
                icon={<Timeline fontSize="small" />}
                label="Timeline View"
                size="small"
                variant="outlined"
                sx={{ fontWeight: 600 }}
              />
            </Box>

            <Box sx={{ width: '100%', height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timelineData} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                  <defs>
                    <linearGradient id="growthAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={mode === 'dark' ? 'rgba(255,255,255,0.06)' : '#f1f5f9'} />
                  <XAxis dataKey="date" stroke={mode === 'dark' ? '#94a3b8' : '#64748b'} fontSize={11} tickLine={false} />
                  <YAxis stroke={mode === 'dark' ? '#94a3b8' : '#64748b'} fontSize={11} tickLine={false} />
                  <Tooltip contentStyle={customTooltipStyle} />
                  <Area
                    type="monotone"
                    dataKey="totalCumulative"
                    name="Cumulative Records"
                    stroke="#8b5cf6"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#growthAreaGrad)"
                  />
                  <Line type="monotone" dataKey="newRecords" name="New Ingested" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          </Paper>
        </Box>
      )}

      {/* CHART CONFIGURATIONS DRAWER (Matching Reference Mockup Sidebar) */}
      <Drawer
        anchor="right"
        open={configDrawerOpen}
        onClose={() => setConfigDrawerOpen(false)}
        slotProps={{
          paper: {
            sx: {
              width: { xs: 300, sm: 360 },
              p: 3,
              bgcolor: mode === 'dark' ? '#0f172a' : '#ffffff',
              borderLeft: mode === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid #eef2f6',
            },
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            Chart Configurations
          </Typography>
          <IconButton size="small" onClick={() => setConfigDrawerOpen(false)}>
            <Close fontSize="small" />
          </IconButton>
        </Box>

        <Divider sx={{ mb: 3 }} />

        {/* Chart Type Picker */}
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1 }}>
          CHART TYPE
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.2, mb: 3 }}>
          <Button
            variant={chartType === 'bar' ? 'contained' : 'outlined'}
            onClick={() => setChartType('bar')}
            startIcon={<BarChartIcon />}
            sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, fontSize: '0.8rem', py: 1 }}
          >
            Bar Chart
          </Button>
          <Button
            variant={chartType === 'line' ? 'contained' : 'outlined'}
            onClick={() => setChartType('line')}
            startIcon={<ShowChart />}
            sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, fontSize: '0.8rem', py: 1 }}
          >
            Line Chart
          </Button>
          <Button
            variant={chartType === 'area' ? 'contained' : 'outlined'}
            onClick={() => setChartType('area')}
            startIcon={<Timeline />}
            sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, fontSize: '0.8rem', py: 1 }}
          >
            Area Chart
          </Button>
          <Button
            variant={chartType === 'donut' ? 'contained' : 'outlined'}
            onClick={() => setChartType('donut')}
            startIcon={<PieChartIcon />}
            sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, fontSize: '0.8rem', py: 1 }}
          >
            Donut Chart
          </Button>
        </Box>

        {/* X-Axis / Group By Column */}
        <FormControl fullWidth size="small" sx={{ mb: 2.5 }}>
          <InputLabel id="x-col-label">X-Axis (Group By)</InputLabel>
          <Select
            labelId="x-col-label"
            label="X-Axis (Group By)"
            value={selectedXCol}
            onChange={(e) => setSelectedXCol(e.target.value)}
          >
            {categoricalColumns.map((col) => (
              <MenuItem key={col.id} value={col.name}>
                {col.display_name} ({col.data_type})
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Y-Axis / Metric Column */}
        <FormControl fullWidth size="small" sx={{ mb: 2.5 }}>
          <InputLabel id="y-col-label">Y-Axis (Metric Field)</InputLabel>
          <Select
            labelId="y-col-label"
            label="Y-Axis (Metric Field)"
            value={selectedYCol}
            onChange={(e) => setSelectedYCol(e.target.value)}
          >
            <MenuItem value="__count__">Row Count (Record Frequency)</MenuItem>
            {numericColumns.map((col) => (
              <MenuItem key={col.id} value={col.name}>
                {col.display_name} ({col.data_type})
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Aggregation Function */}
        {selectedYCol !== '__count__' && (
          <FormControl fullWidth size="small" sx={{ mb: 3 }}>
            <InputLabel id="agg-label">Aggregation Function</InputLabel>
            <Select
              labelId="agg-label"
              label="Aggregation Function"
              value={aggregation}
              onChange={(e) => setAggregation(e.target.value as any)}
            >
              <MenuItem value="sum">Sum (Total Value)</MenuItem>
              <MenuItem value="avg">Average (Mean Value)</MenuItem>
              <MenuItem value="count">Count (Occurrences)</MenuItem>
              <MenuItem value="max">Maximum</MenuItem>
              <MenuItem value="min">Minimum</MenuItem>
            </Select>
          </FormControl>
        )}

        <Box sx={{ mt: 'auto', pt: 2 }}>
          <Button
            variant="contained"
            fullWidth
            onClick={() => setConfigDrawerOpen(false)}
            sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, py: 1.2 }}
          >
            Apply Visuals
          </Button>
        </Box>
      </Drawer>
    </Box>
  );
};
export default TableAnalyticsStudio;

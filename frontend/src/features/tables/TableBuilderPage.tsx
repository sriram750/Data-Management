import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Select,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  Add,
  ArrowDownward,
  ArrowUpward,
  DeleteOutlined,
  KeyOutlined,
  LockOutlined,
  LockOpenOutlined,
  SaveOutlined,
  SecurityOutlined,
  TableChartOutlined,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';

import { apiClient } from '../../api/client';
import { ColumnType, DataTable } from '../../types';

const COLUMN_TYPES: { type: ColumnType; label: string; desc: string }[] = [
  { type: 'TEXT', label: 'Single Line Text', desc: 'Short string e.g. names, codes' },
  { type: 'MIXED', label: 'Mixed / Alphanumeric', desc: 'Mixed data e.g. 123, N@R, DFJR, symbols' },
  { type: 'LONG_TEXT', label: 'Long Text / Notes', desc: 'Multi-line notes and descriptions' },
  { type: 'NUMBER', label: 'Integer Number', desc: 'Whole numbers e.g. count, port' },
  { type: 'DECIMAL', label: 'Decimal Number', desc: 'Floating point numbers' },
  { type: 'CURRENCY', label: 'Currency', desc: 'Monetary values e.g. $1,250.00' },
  { type: 'DATE', label: 'Date', desc: 'Calendar date YYYY-MM-DD' },
  { type: 'DATETIME', label: 'Date & Time', desc: 'Full timestamp with time' },
  { type: 'EMAIL', label: 'Email Address', desc: 'Validated email format' },
  { type: 'PHONE', label: 'Phone Number', desc: 'Telephone number' },
  { type: 'IP_ADDRESS', label: 'IP Address', desc: 'IPv4 network address' },
  { type: 'URL', label: 'Web URL', desc: 'Hyperlink' },
  { type: 'PASSWORD', label: 'Password / Secret', desc: 'AES-256 encrypted, masked secret' },
  { type: 'BOOLEAN', label: 'Boolean (Yes/No)', desc: 'Toggle switch' },
  { type: 'DROPDOWN', label: 'Dropdown Select', desc: 'Single choice from configured list' },
  { type: 'MULTI_SELECT', label: 'Multi-Select', desc: 'Multiple choices from list' },
  { type: 'USER', label: 'User Assignment', desc: 'Reference to system user' },
  { type: 'FILE', label: 'File Attachment', desc: 'Secure document or image' },
];

interface ColumnDraft {
  id: string;
  name: string;
  display_name: string;
  data_type: ColumnType;
  is_required: boolean;
  is_sensitive: boolean;
  default_value: string;
  options_str: string;
}

export const TableBuilderPage: React.FC = () => {
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState('');
  const [tableName, setTableName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [columns, setColumns] = useState<ColumnDraft[]>([
    {
      id: 'col_1',
      name: 'name',
      display_name: 'Name',
      data_type: 'TEXT',
      is_required: true,
      is_sensitive: false,
      default_value: '',
      options_str: '',
    },
  ]);

  const handleDisplayNameChange = (val: string) => {
    setDisplayName(val);
    if (!tableName || tableName === displayName.toLowerCase().replace(/[^a-z0-9_]/g, '_')) {
      setTableName(
        val
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9_]/g, '_')
      );
    }
  };

  const handleAddColumn = () => {
    const newId = `col_${Date.now()}`;
    setColumns((prev) => [
      ...prev,
      {
        id: newId,
        name: `column_${prev.length + 1}`,
        display_name: `Column ${prev.length + 1}`,
        data_type: 'TEXT',
        is_required: false,
        is_sensitive: false,
        default_value: '',
        options_str: '',
      },
    ]);
  };

  const handleRemoveColumn = (index: number) => {
    if (columns.length <= 1) {
      setError('A table must have at least one column.');
      return;
    }
    setColumns((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setColumns((prev) => {
      const next = [...prev];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  const handleMoveDown = (index: number) => {
    if (index === columns.length - 1) return;
    setColumns((prev) => {
      const next = [...prev];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  const handleColumnChange = (index: number, field: keyof ColumnDraft, val: any) => {
    setColumns((prev) =>
      prev.map((col, i) => {
        if (i !== index) return col;
        const updated = { ...col, [field]: val };
        if (field === 'display_name' && (!col.name || col.name === col.display_name.toLowerCase().replace(/[^a-z0-9_]/g, '_'))) {
          updated.name = String(val).toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');
        }
        if (field === 'data_type' && val === 'PASSWORD') {
          updated.is_sensitive = true;
        }
        return updated;
      })
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!displayName.trim()) {
      setError('Table display name is required.');
      return;
    }

    if (columns.length === 0) {
      setError('Add at least one column.');
      return;
    }

    setLoading(true);

    try {
      const formattedColumns = columns.map((col, idx) => {
        let validation_rules: Record<string, any> | null = null;
        if (col.data_type === 'DROPDOWN' || col.data_type === 'MULTI_SELECT') {
          const opts = col.options_str
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          validation_rules = { options: opts };
        }

        return {
          name: col.name.trim() || `col_${idx + 1}`,
          display_name: col.display_name.trim() || `Column ${idx + 1}`,
          data_type: col.data_type,
          is_required: col.is_required,
          is_sensitive: col.is_sensitive,
          is_encrypted: col.is_sensitive || col.data_type === 'PASSWORD',
          default_value: col.default_value.trim() || null,
          validation_rules,
          display_order: idx,
        };
      });

      const res = await apiClient.post<DataTable>('/tables', {
        name: tableName.trim() || displayName.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        display_name: displayName.trim(),
        description: description.trim() || null,
        is_private: isPrivate,
        is_locked: isLocked || Boolean(password.trim()),
        password: password.trim() || null,
        columns: formattedColumns,
      });

      navigate(`/tables/${res.data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create table.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            Visual Table Builder
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Design a custom dynamic schema with arbitrary data types and granular security flags.
          </Typography>
        </Box>
        <Button variant="outlined" onClick={() => navigate('/tables')}>
          Cancel
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <form onSubmit={handleSubmit}>
        {/* Table General Info Card */}
        <Card sx={{ mb: 3.5, borderRadius: 3 }}>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <TableChartOutlined color="primary" /> Table Metadata
            </Typography>
            <Divider sx={{ mb: 2.5 }} />

            <Grid container spacing={2.5}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="Table Display Name"
                  placeholder="e.g. Production Servers"
                  value={displayName}
                  onChange={(e) => handleDisplayNameChange(e.target.value)}
                  required
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="Table Identifier (System Name)"
                  placeholder="e.g. production_servers"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  required
                  helperText="Unique database slug identifier"
                />
              </Grid>
              <Grid size={12}>
                <TextField
                  fullWidth
                  label="Description"
                  placeholder="Explain the purpose and contents of this table..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  multiline
                  rows={2}
                />
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* Dynamic Columns Configuration Table */}
        <Card sx={{ mb: 3.5, borderRadius: 3 }}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Schema Columns ({columns.length})
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Define column types, validation rules, required status, and encryption flags.
                </Typography>
              </Box>
              <Button variant="contained" size="small" startIcon={<Add />} onClick={handleAddColumn}>
                Add Column
              </Button>
            </Box>

            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 60 }}>Order</TableCell>
                    <TableCell>Display Name</TableCell>
                    <TableCell>Column Name</TableCell>
                    <TableCell sx={{ minWidth: 180 }}>Data Type</TableCell>
                    <TableCell align="center">Required</TableCell>
                    <TableCell align="center">Sensitive / Encrypted</TableCell>
                    <TableCell>Default / Options</TableCell>
                    <TableCell align="center" sx={{ width: 60 }}>
                      Action
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {columns.map((col, idx) => (
                    <TableRow key={col.id}>
                      <TableCell>
                        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                          <IconButton
                            size="small"
                            disabled={idx === 0}
                            onClick={() => handleMoveUp(idx)}
                            sx={{ p: 0.2 }}
                          >
                            <ArrowUpward fontSize="inherit" />
                          </IconButton>
                          <IconButton
                            size="small"
                            disabled={idx === columns.length - 1}
                            onClick={() => handleMoveDown(idx)}
                            sx={{ p: 0.2 }}
                          >
                            <ArrowDownward fontSize="inherit" />
                          </IconButton>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          fullWidth
                          value={col.display_name}
                          onChange={(e) => handleColumnChange(idx, 'display_name', e.target.value)}
                          required
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          fullWidth
                          value={col.name}
                          onChange={(e) => handleColumnChange(idx, 'name', e.target.value)}
                          required
                        />
                      </TableCell>
                      <TableCell>
                        <FormControl fullWidth size="small">
                          <Select
                            value={col.data_type}
                            onChange={(e) => handleColumnChange(idx, 'data_type', e.target.value)}
                          >
                            {COLUMN_TYPES.map((t) => (
                              <MenuItem key={t.type} value={t.type}>
                                <Box>
                                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                    {t.label}
                                  </Typography>
                                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                    {t.desc}
                                  </Typography>
                                </Box>
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </TableCell>
                      <TableCell align="center">
                        <Checkbox
                          size="small"
                          checked={col.is_required}
                          onChange={(e) => handleColumnChange(idx, 'is_required', e.target.checked)}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip title="AES-256-GCM Encrypted & Masked in UI">
                          <Switch
                            size="small"
                            color="secondary"
                            checked={col.is_sensitive}
                            onChange={(e) => handleColumnChange(idx, 'is_sensitive', e.target.checked)}
                          />
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        {col.data_type === 'DROPDOWN' || col.data_type === 'MULTI_SELECT' ? (
                          <TextField
                            size="small"
                            fullWidth
                            placeholder="Option 1, Option 2, Option 3"
                            value={col.options_str}
                            onChange={(e) => handleColumnChange(idx, 'options_str', e.target.value)}
                            helperText="Comma separated"
                          />
                        ) : (
                          <TextField
                            size="small"
                            fullWidth
                            placeholder="Default value (optional)"
                            value={col.default_value}
                            onChange={(e) => handleColumnChange(idx, 'default_value', e.target.value)}
                          />
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <IconButton
                          size="small"
                          color="error"
                          disabled={columns.length <= 1}
                          onClick={() => handleRemoveColumn(idx)}
                        >
                          <DeleteOutlined fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>

        {/* Security, Lock & Privacy Access Card */}
        <Card sx={{ mb: 3.5, borderRadius: 3, border: isPrivate ? '1px solid #7c4dff' : undefined }}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <SecurityOutlined color={isPrivate ? 'secondary' : 'primary'} />
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Table Access Security & Lock Controls
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2.5 }}>
              Configure visibility restrictions, table locks, and password protection for this dataset.
            </Typography>
            <Divider sx={{ mb: 3 }} />

            <Grid container spacing={3}>
              {/* Privacy Toggle */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2.5,
                    borderRadius: 2.5,
                    height: '100%',
                    bgcolor: isPrivate ? 'rgba(124, 77, 255, 0.05)' : 'background.paper',
                    borderColor: isPrivate ? 'secondary.main' : 'divider',
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {isPrivate ? <LockOutlined color="secondary" /> : <LockOpenOutlined color="action" />}
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        {isPrivate ? 'Private Table (Locked to Creator & Super Admin)' : 'Public Table (Standard RBAC)'}
                      </Typography>
                    </Box>
                    <Switch
                      checked={isPrivate}
                      onChange={(e) => setIsPrivate(e.target.checked)}
                      color="secondary"
                    />
                  </Box>
                  <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
                    {isPrivate
                      ? '🔒 Only you (the creator) and Super Administrators will be able to see or access this table. Other users and roles will NOT see this table at all.'
                      : '🌐 Table visibility follows standard role-based access rules (RBAC). Permitted roles will be able to see and interact with it.'}
                  </Typography>
                </Paper>
              </Grid>

              {/* Password Protection Lock */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2.5,
                    borderRadius: 2.5,
                    height: '100%',
                    bgcolor: isLocked ? 'rgba(255, 152, 0, 0.05)' : 'background.paper',
                    borderColor: isLocked ? 'warning.main' : 'divider',
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <KeyOutlined color={isLocked ? 'warning' : 'action'} />
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        {isLocked ? 'Password Protection Enabled' : 'Optional Password Lock'}
                      </Typography>
                    </Box>
                    <Switch
                      checked={isLocked}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setIsLocked(checked);
                        if (!checked) setPassword('');
                      }}
                      color="warning"
                    />
                  </Box>
                  <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                    Require a security password to unlock and view the table records.
                  </Typography>

                  {isLocked && (
                    <TextField
                      fullWidth
                      size="small"
                      type={showPassword ? 'text' : 'password'}
                      label="Table Access Password"
                      placeholder="Enter a secret password or PIN..."
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      helperText="Anyone without Super Admin or Creator role must enter this password to view table data."
                      slotProps={{
                        input: {
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton
                                size="small"
                                onClick={() => setShowPassword(!showPassword)}
                                edge="end"
                              >
                                {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                              </IconButton>
                            </InputAdornment>
                          ),
                        },
                      }}
                    />
                  )}
                </Paper>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* Submit Actions */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mb: 4 }}>
          <Button variant="outlined" size="large" onClick={() => navigate('/tables')}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={loading}
            startIcon={<SaveOutlined />}
            sx={{ px: 4, fontWeight: 700 }}
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Create Dynamic Table'}
          </Button>
        </Box>
      </form>
    </Box>
  );
};

export default TableBuilderPage;

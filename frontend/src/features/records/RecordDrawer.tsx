import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  FormControl,
  FormControlLabel,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import {
  AccessTimeOutlined,
  AccountCircleOutlined,
  AttachFile,
  Close,
  FileUpload,
  HistoryOutlined,
  LockOutlined,
  SaveOutlined,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';

import { apiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { DataColumn, DataRecord, DataTable } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  table: DataTable;
  record?: DataRecord | null;
  onSaved: () => void;
}

export const RecordDrawer: React.FC<Props> = ({ open, onClose, table, record, onSaved }) => {
  const { user } = useAuth();
  const isEditing = Boolean(record);

  const [formData, setFormData] = useState<Record<string, any>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, string>>({});
  const [revealingSecret, setRevealingSecret] = useState<string | null>(null);
  const [uploadingCol, setUploadingCol] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (record) {
        setFormData({ ...record.data });
      } else {
        const initial: Record<string, any> = {};
        table.columns.forEach((col) => {
          if (col.default_value) {
            initial[col.name] = col.default_value;
          } else if (col.data_type === 'BOOLEAN') {
            initial[col.name] = false;
          } else if (col.data_type === 'MULTI_SELECT') {
            initial[col.name] = [];
          } else {
            initial[col.name] = '';
          }
        });
        setFormData(initial);
      }
      setError(null);
      setRevealedSecrets({});
    }
  }, [open, record, table]);

  const handleChange = (columnName: string, value: any) => {
    setFormData((prev) => ({ ...prev, [columnName]: value }));
  };

  const handleRevealSecret = async (col: DataColumn) => {
    if (!record) return;
    setRevealingSecret(col.id);
    try {
      const res = await apiClient.post<{ plaintext_value: string }>(
        `/tables/${table.id}/records/${record.id}/columns/${col.id}/reveal-secret`,
        {}
      );
      setRevealedSecrets((prev) => ({ ...prev, [col.name]: res.data.plaintext_value }));

      setTimeout(() => {
        setRevealedSecrets((prev) => {
          const next = { ...prev };
          delete next[col.name];
          return next;
        });
      }, 30000);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to reveal secret.');
    } finally {
      setRevealingSecret(null);
    }
  };

  const handleFileUpload = async (col: DataColumn, file: File) => {
    setUploadingCol(col.id);
    try {
      const body = new FormData();
      body.append('table_id', table.id);
      if (record) body.append('record_id', record.id);
      body.append('column_id', col.id);
      body.append('file', file);

      const res = await apiClient.post('/attachments/upload', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      handleChange(col.name, {
        id: res.data.id,
        filename: res.data.original_filename,
        size: res.data.file_size_bytes,
      });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to upload file.');
    } finally {
      setUploadingCol(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isEditing && record) {
        await apiClient.put(`/records/${record.id}`, {
          data: formData,
        });
      } else {
        await apiClient.post(`/tables/${table.id}/records`, {
          data: formData,
        });
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save record.');
    } finally {
      setLoading(false);
    }
  };

  const renderFieldInput = (col: DataColumn) => {
    const value = formData[col.name] ?? '';
    const isSecretRevealed = Boolean(revealedSecrets[col.name]);

    if (col.data_type === 'PASSWORD' || col.is_sensitive) {
      return (
        <TextField
          fullWidth
          label={col.display_name}
          type={isSecretRevealed ? 'text' : 'password'}
          value={isSecretRevealed ? revealedSecrets[col.name] : value}
          onChange={(e) => handleChange(col.name, e.target.value)}
          required={col.is_required && !isEditing}
          helperText={
            isSecretRevealed
              ? 'Visible for 30s (PASSWORD_VIEWED audited)'
              : 'Encrypted via AES-256-GCM'
          }
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <LockOutlined fontSize="small" color="secondary" />
                </InputAdornment>
              ),
              endAdornment: isEditing ? (
                <InputAdornment position="end">
                  <Button
                    size="small"
                    variant="text"
                    disabled={revealingSecret === col.id}
                    onClick={() => handleRevealSecret(col)}
                  >
                    {revealingSecret === col.id ? (
                      <CircularProgress size={16} />
                    ) : isSecretRevealed ? (
                      <VisibilityOff fontSize="small" />
                    ) : (
                      <Visibility fontSize="small" />
                    )}
                  </Button>
                </InputAdornment>
              ) : undefined,
            },
          }}
        />
      );
    }

    if (col.data_type === 'BOOLEAN') {
      return (
        <FormControlLabel
          control={
            <Switch
              checked={Boolean(value)}
              onChange={(e) => handleChange(col.name, e.target.checked)}
              color="primary"
            />
          }
          label={col.display_name}
        />
      );
    }

    if (col.data_type === 'DROPDOWN') {
      const options: string[] = col.validation_rules?.options || [];
      return (
        <FormControl fullWidth required={col.is_required}>
          <InputLabel>{col.display_name}</InputLabel>
          <Select
            value={value}
            label={col.display_name}
            onChange={(e) => handleChange(col.name, e.target.value)}
          >
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {options.map((opt) => (
              <MenuItem key={opt} value={opt}>
                {opt}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      );
    }

    if (col.data_type === 'MULTI_SELECT') {
      const options: string[] = col.validation_rules?.options || [];
      const selectedList: string[] = Array.isArray(value) ? value : [];
      return (
        <FormControl fullWidth required={col.is_required}>
          <InputLabel>{col.display_name}</InputLabel>
          <Select
            multiple
            value={selectedList}
            label={col.display_name}
            onChange={(e) => handleChange(col.name, e.target.value)}
            renderValue={(selected) => (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {(selected as string[]).map((val) => (
                  <Chip key={val} label={val} size="small" />
                ))}
              </Box>
            )}
          >
            {options.map((opt) => (
              <MenuItem key={opt} value={opt}>
                {opt}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      );
    }

    if (col.data_type === 'FILE') {
      const fileInfo = typeof value === 'object' ? value : null;
      return (
        <Box sx={{ border: '1px dashed rgba(255,255,255,0.2)', p: 2, borderRadius: 2 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 1 }}>
            {col.display_name} {col.is_required && '*'}
          </Typography>
          {fileInfo ? (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Chip icon={<AttachFile />} label={fileInfo.filename} color="primary" variant="outlined" />
              <Button size="small" color="error" onClick={() => handleChange(col.name, null)}>
                Remove
              </Button>
            </Box>
          ) : (
            <Button
              variant="outlined"
              component="label"
              size="small"
              startIcon={<FileUpload />}
              disabled={uploadingCol === col.id}
            >
              {uploadingCol === col.id ? 'Uploading...' : 'Attach File'}
              <input
                type="file"
                hidden
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFileUpload(col, e.target.files[0]);
                }}
              />
            </Button>
          )}
        </Box>
      );
    }

    if (col.data_type === 'LONG_TEXT') {
      return (
        <TextField
          fullWidth
          label={col.display_name}
          value={value}
          onChange={(e) => handleChange(col.name, e.target.value)}
          required={col.is_required}
          multiline
          rows={3}
        />
      );
    }

    // Default: text, number, date, email, ip, url, currency
    let inputType = 'text';
    if (col.data_type === 'NUMBER' || col.data_type === 'DECIMAL' || col.data_type === 'CURRENCY') {
      inputType = 'number';
    } else if (col.data_type === 'DATE') {
      inputType = 'date';
    } else if (col.data_type === 'DATETIME') {
      inputType = 'datetime-local';
    } else if (col.data_type === 'EMAIL') {
      inputType = 'email';
    } else if (col.data_type === 'URL') {
      inputType = 'url';
    }

    return (
      <TextField
        fullWidth
        label={col.display_name}
        type={inputType}
        value={value}
        onChange={(e) => handleChange(col.name, e.target.value)}
        required={col.is_required}
        slotProps={{
          inputLabel:
            inputType === 'date' || inputType === 'datetime-local' ? { shrink: true } : undefined,
        }}
      />
    );
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: { width: { xs: '100%', sm: 500 }, p: 3 },
        },
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {isEditing ? `Edit Record (v${record?.version})` : 'Add New Record'}
        </Typography>
        <Button onClick={onClose} size="small" sx={{ minWidth: 'auto' }}>
          <Close />
        </Button>
      </Box>
      <Divider sx={{ mb: 3 }} />

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2.5, pr: 1 }}>
          {table.columns.map((col) => (
            <Box key={col.id}>{renderFieldInput(col)}</Box>
          ))}

          {/* Audit & Edit Tracking Card (Who Updated This) */}
          {isEditing && record && (
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                mt: 1,
                borderRadius: 2.5,
                bgcolor: 'rgba(99, 102, 241, 0.04)',
                borderColor: 'divider',
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 0.8,
                  color: 'primary.main',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.6,
                  mb: 1.5,
                }}
              >
                <HistoryOutlined sx={{ fontSize: 16 }} />
                Record Audit & Edit Tracking
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <AccountCircleOutlined sx={{ fontSize: 15 }} /> Last Updated By:
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary' }}>
                    {record.updated_by_name || record.created_by_name || 'Administrator'}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <AccessTimeOutlined sx={{ fontSize: 15 }} /> Last Updated At:
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                    {new Date(record.updated_at).toLocaleString()}
                  </Typography>
                </Box>

                <Divider sx={{ my: 0.5, borderStyle: 'dashed' }} />

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Created By:
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                    {record.created_by_name || 'Administrator'} ({new Date(record.created_at).toLocaleDateString()})
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Record Version:
                  </Typography>
                  <Chip
                    label={`v${record.version}`}
                    size="small"
                    color="primary"
                    variant="outlined"
                    sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700 }}
                  />
                </Box>
              </Box>
            </Paper>
          )}
        </Box>

        <Divider sx={{ my: 3 }} />

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
          <Button variant="outlined" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={loading} startIcon={<SaveOutlined />}>
            {loading ? <CircularProgress size={20} /> : isEditing ? 'Save Changes' : 'Create Record'}
          </Button>
        </Box>
      </form>
    </Drawer>
  );
};

export default RecordDrawer;

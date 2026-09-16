import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Step,
  StepLabel,
  Stepper,
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
  CheckCircleOutlined,
  CloudUpload,
  DeleteOutlined,
  FileUpload,
  FlashOn,
  LayersOutlined,
  PlaylistAddCheck,
  TableChartOutlined,
  TableView,
  VisibilityOutlined,
} from '@mui/icons-material';

import { apiClient } from '../../api/client';
import {
  BatchImportExecuteResponse,
  ColumnMappingConfig,
  ColumnType,
  DataTable,
  ExcelPreviewResponse,
  ImportHistoryItem,
  ImportValidationSummary,
} from '../../types';

const COLUMN_TYPES: ColumnType[] = [
  'TEXT',
  'MIXED',
  'LONG_TEXT',
  'NUMBER',
  'DECIMAL',
  'CURRENCY',
  'DATE',
  'DATETIME',
  'EMAIL',
  'PHONE',
  'IP_ADDRESS',
  'URL',
  'PASSWORD',
  'BOOLEAN',
  'DROPDOWN',
  'MULTI_SELECT',
  'USER',
  'FILE',
];

const STEPS = ['Upload Spreadsheet', 'Map & Configure Columns', 'Validation Report', 'Confirm & Execute'];

export const ExcelImportWizard: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const searchParams = new URLSearchParams(location.search);
  const preselectedTableId = searchParams.get('tableId');

  const [activeStep, setActiveStep] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<ExcelPreviewResponse | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [batchSheetConfigs, setBatchSheetConfigs] = useState<
    Record<string, { table_display_name: string; table_name: string }>
  >({});
  const [batchImportResult, setBatchImportResult] = useState<BatchImportExecuteResponse | null>(null);
  const [columnConfigs, setColumnConfigs] = useState<ColumnMappingConfig[]>([]);

  // Import Mode
  const [importMode, setImportMode] = useState<
    'INSERT_NEW_TABLE' | 'APPEND_EXISTING' | 'UPDATE_EXISTING' | 'UPSERT_EXISTING'
  >(preselectedTableId ? 'APPEND_EXISTING' : 'INSERT_NEW_TABLE');

  const [newTableName, setNewTableName] = useState('');
  const [newTableDisplayName, setNewTableDisplayName] = useState('');
  const [newTableDescription, setNewTableDescription] = useState('');

  const [existingTables, setExistingTables] = useState<DataTable[]>([]);
  const [selectedExistingTableId, setSelectedExistingTableId] = useState<string>(preselectedTableId || '');
  const [matchingKeyColumn, setMatchingKeyColumn] = useState<string>('');

  const [validationSummary, setValidationSummary] = useState<ImportValidationSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportHistoryItem | null>(null);

  useEffect(() => {
    const fetchExisting = async () => {
      try {
        const res = await apiClient.get<{ items: DataTable[] }>('/tables');
        setExistingTables(res.data.items);
      } catch (err) {
        console.error('Failed to load tables', err);
      }
    };
    fetchExisting();
  }, []);

  const handleToggleMultiSelect = (enabled: boolean) => {
    setIsMultiSelect(enabled);
    if (!enabled) {
      setSelectedSheets([selectedSheet]);
    } else {
      if (selectedSheets.length === 0 && selectedSheet) {
        setSelectedSheets([selectedSheet]);
      }
    }
  };

  const handleSelectAllSheets = () => {
    if (!preview) return;
    setIsMultiSelect(true);
    setSelectedSheets([...preview.sheets]);
  };

  const handleClearSheets = () => {
    if (selectedSheet) {
      setSelectedSheets([selectedSheet]);
    }
  };

  const handleRemoveSelectedSheet = (sheet: string) => {
    if (selectedSheets.length <= 1) return;
    const next = selectedSheets.filter((s) => s !== sheet);
    setSelectedSheets(next);
    if (selectedSheet === sheet) {
      handleSheetChange(next[0]);
    }
  };

  const handleBatchConfigChange = (
    sheet: string,
    field: 'table_display_name' | 'table_name',
    val: string
  ) => {
    setBatchSheetConfigs((prev) => {
      const current = prev[sheet] || {
        table_display_name: sheet,
        table_name: sheet.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      };
      if (field === 'table_display_name') {
        return {
          ...prev,
          [sheet]: {
            table_display_name: val,
            table_name: val.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
          },
        };
      }
      return {
        ...prev,
        [sheet]: {
          ...current,
          table_name: val,
        },
      };
    });
  };

  const handleUploadFile = async (file: File) => {
    setSelectedFile(file);
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiClient.post<ExcelPreviewResponse>('/imports/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setPreview(res.data);
      setSelectedSheet(res.data.selected_sheet);
      setSelectedSheets([res.data.selected_sheet]);

      const initialConfigs: Record<string, { table_display_name: string; table_name: string }> = {};
      res.data.sheets.forEach((s) => {
        initialConfigs[s] = {
          table_display_name: s,
          table_name: s.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        };
      });
      setBatchSheetConfigs(initialConfigs);

      const baseName = file.name.replace(/\.[^/.]+$/, '');
      setNewTableDisplayName(baseName);
      setNewTableName(baseName.toLowerCase().replace(/[^a-z0-9_]/g, '_'));

      const configs: ColumnMappingConfig[] = res.data.detected_columns.map((c) => ({
        source_column: c.original_name,
        target_column: c.suggested_name,
        data_type: c.suggested_type,
        is_required: false,
        is_sensitive: c.is_sensitive,
        is_encrypted: c.is_sensitive || c.suggested_type === 'PASSWORD',
      }));
      setColumnConfigs(configs);

      setActiveStep(1);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to parse Excel file.');
    } finally {
      setLoading(false);
    }
  };

  const handleSheetChange = async (sheet: string) => {
    if (!selectedFile) return;
    setSelectedSheet(sheet);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('sheet_name', sheet);

      const res = await apiClient.post<ExcelPreviewResponse>('/imports/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPreview(res.data);

      // Auto-name table after the selected sheet (only when single sheet mode)
      if (!isMultiSelect || selectedSheets.length <= 1) {
        setNewTableDisplayName(sheet);
        setNewTableName(sheet.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
      }

      const configs: ColumnMappingConfig[] = res.data.detected_columns.map((c) => ({
        source_column: c.original_name,
        target_column: c.suggested_name,
        data_type: c.suggested_type,
        is_required: false,
        is_sensitive: c.is_sensitive,
        is_encrypted: c.is_sensitive || c.suggested_type === 'PASSWORD',
      }));
      setColumnConfigs(configs);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to switch sheet.');
    } finally {
      setLoading(false);
    }
  };

  const handleSetAllToMixed = () => {
    const updated = columnConfigs.map((c) => ({
      ...c,
      data_type: 'MIXED' as ColumnType,
    }));
    setColumnConfigs(updated);
  };

  const handleAutoConvertFailingToMixed = async () => {
    if (!preview || !validationSummary) return;
    const failingTargets = new Set(validationSummary.errors.map((e) => e.column_name));
    const updatedConfigs = columnConfigs.map((c) => {
      if (failingTargets.has(c.target_column) || failingTargets.has(c.source_column)) {
        return { ...c, data_type: 'MIXED' as ColumnType };
      }
      return c;
    });
    setColumnConfigs(updatedConfigs);
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file_token', preview.file_token);
      formData.append('sheet_name', selectedSheet);
      formData.append('columns_json', JSON.stringify(updatedConfigs));

      const res = await apiClient.post<ImportValidationSummary>('/imports/validate', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setValidationSummary(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Re-validation failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleValidate = async () => {
    if (!preview) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file_token', preview.file_token);
      formData.append('sheet_name', selectedSheet);
      formData.append('columns_json', JSON.stringify(columnConfigs));

      const res = await apiClient.post<ImportValidationSummary>('/imports/validate', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setValidationSummary(res.data);
      setActiveStep(2);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Validation failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteBatchImport = async () => {
    if (!preview || selectedSheets.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const payload = {
        file_token: preview.file_token,
        sheets: selectedSheets.map((s) => ({
          sheet_name: s,
          table_display_name: batchSheetConfigs[s]?.table_display_name?.trim() || s,
          table_name:
            batchSheetConfigs[s]?.table_name?.trim() || s.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        })),
      };

      const res = await apiClient.post<BatchImportExecuteResponse>('/imports/batch-execute', payload);
      setBatchImportResult(res.data);
      setActiveStep(3);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Batch import execution failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteImport = async () => {
    if (isMultiSelect && selectedSheets.length > 1) {
      return handleExecuteBatchImport();
    }
    if (!preview) return;
    setLoading(true);
    setError(null);
    try {
      const payload = {
        file_token: preview.file_token,
        sheet_name: selectedSheet,
        mode: importMode,
        new_table_name: importMode === 'INSERT_NEW_TABLE' ? newTableName : undefined,
        new_table_display_name: importMode === 'INSERT_NEW_TABLE' ? newTableDisplayName : undefined,
        new_table_description: importMode === 'INSERT_NEW_TABLE' ? newTableDescription : undefined,
        existing_table_id: importMode !== 'INSERT_NEW_TABLE' ? selectedExistingTableId : undefined,
        matching_key_column:
          importMode === 'UPDATE_EXISTING' || importMode === 'UPSERT_EXISTING' ? matchingKeyColumn : undefined,
        columns: columnConfigs,
      };

      const res = await apiClient.post<ImportHistoryItem>('/imports/execute', payload);
      setImportResult(res.data);
      setActiveStep(3);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Import execution failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>
          Excel Import Wizard
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          Upload an Excel spreadsheet (.xlsx), auto-detect schema, validate data, and import transactionally.
        </Typography>
      </Box>

      {/* Stepper */}
      <Paper sx={{ p: 1.5, mb: 2, borderRadius: 2 }}>
        <Stepper activeStep={activeStep}>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Step 1: Upload File */}
      {activeStep === 0 && (
        <Card sx={{ borderRadius: 2 }}>
          <CardContent sx={{ p: { xs: 2.5, sm: 3.5 }, textAlign: 'center' }}>
            <Box
              component="label"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(false);
                if (e.dataTransfer.files?.[0]) {
                  handleUploadFile(e.dataTransfer.files[0]);
                }
              }}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                boxSizing: 'border-box',
                border: '2px dashed',
                borderColor: isDragging ? 'primary.main' : 'rgba(99, 102, 241, 0.4)',
                borderRadius: 2,
                p: { xs: 3, sm: 4.5 },
                bgcolor: isDragging ? 'action.hover' : 'background.default',
                cursor: 'pointer',
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                  borderColor: 'primary.main',
                  bgcolor: 'action.hover',
                },
              }}
            >
              <CloudUpload sx={{ fontSize: 48, color: 'primary.main', mb: 1.5 }} />
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
                Choose or Drop an Excel File (.xlsx)
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, maxWidth: 550 }}>
                Supports standard Excel workbooks. The system will auto-detect worksheets and column data types.
              </Typography>
              <Button variant="contained" size="medium" component="span" disabled={loading} startIcon={<FileUpload />}>
                {loading ? <CircularProgress size={20} color="inherit" /> : 'Select Spreadsheet'}
              </Button>
              <input
                type="file"
                hidden
                accept=".xlsx,.xlsm"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleUploadFile(e.target.files[0]);
                }}
              />
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Configure & Map Columns */}
      {activeStep === 1 && preview && (
        <Box>
          {/* Multi-Sheet Excel Workbook Tabs Bar */}
          {preview.sheets.length > 1 && (
            <Paper
              elevation={0}
              variant="outlined"
              sx={{
                mb: 3,
                p: 2,
                borderRadius: 3,
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'primary.light',
                boxShadow: '0 2px 12px rgba(99, 102, 241, 0.08)',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TableChartOutlined color="primary" />
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    Worksheets in Workbook ({preview.sheets.length} Sheets Detected)
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Chip
                    label={`Previewing: ${selectedSheet}`}
                    color="primary"
                    size="small"
                    sx={{ fontWeight: 700 }}
                  />
                  {isMultiSelect && (
                    <Chip
                      label={`${selectedSheets.length} of ${preview.sheets.length} queued for import`}
                      color="secondary"
                      size="small"
                      sx={{ fontWeight: 700 }}
                    />
                  )}
                  <Button
                    size="small"
                    variant={isMultiSelect ? 'contained' : 'outlined'}
                    color="secondary"
                    onClick={() => handleToggleMultiSelect(!isMultiSelect)}
                    sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.75rem' }}
                  >
                    {isMultiSelect ? 'Disable Multi-Select' : 'Enable Multi-Select'}
                  </Button>
                </Box>
              </Box>

              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, fontSize: '0.84rem' }}>
                {isMultiSelect
                  ? 'Multi-select is enabled. Click sheet tabs below to toggle selection for batch import, or click to preview columns:'
                  : 'This Excel file contains multiple worksheets. Click any sheet tab below to switch, preview its columns, and configure import:'}
              </Typography>

              {/* Excel-style Sheet Tabs */}
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                {preview.sheets.map((sheet) => {
                  const isCurrent = selectedSheet === sheet;
                  const isChecked = selectedSheets.includes(sheet);
                  return (
                    <Button
                      key={sheet}
                      variant={isCurrent ? 'contained' : isChecked ? 'outlined' : 'text'}
                      color={isCurrent ? 'primary' : isChecked ? 'secondary' : 'inherit'}
                      onClick={() => {
                        if (isMultiSelect) {
                          if (isChecked) {
                            if (selectedSheets.length > 1) {
                              handleRemoveSelectedSheet(sheet);
                            }
                          } else {
                            setSelectedSheets((prev) => [...prev, sheet]);
                            handleSheetChange(sheet);
                          }
                        } else {
                          handleSheetChange(sheet);
                        }
                      }}
                      startIcon={
                        isMultiSelect ? (
                          <Checkbox
                            checked={isChecked}
                            size="small"
                            sx={{ p: 0, mr: 0.5, color: isCurrent ? 'inherit' : undefined }}
                          />
                        ) : (
                          <TableView fontSize="small" />
                        )
                      }
                      sx={{
                        borderRadius: 2,
                        textTransform: 'none',
                        fontWeight: isCurrent || isChecked ? 700 : 500,
                        px: 2,
                        py: 0.8,
                        borderColor: isCurrent ? 'primary.main' : isChecked ? 'secondary.main' : 'divider',
                        boxShadow: isCurrent ? '0 2px 8px rgba(99, 102, 241, 0.3)' : 'none',
                      }}
                    >
                      {sheet}
                    </Button>
                  );
                })}
              </Box>
            </Paper>
          )}

          <Card sx={{ mb: 3, borderRadius: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                1. Select Destination & Mode
              </Typography>
              <Grid container spacing={2.5}>
                {/* Worksheet Selector with Multi-Select option */}
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.8 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Worksheet
                      </Typography>
                      {isMultiSelect && (
                        <Chip
                          label={`${selectedSheets.length} Selected`}
                          size="small"
                          color="primary"
                          sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700 }}
                        />
                      )}
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <FormControlLabel
                        control={
                          <Switch
                            size="small"
                            checked={isMultiSelect}
                            onChange={(e) => handleToggleMultiSelect(e.target.checked)}
                            color="primary"
                          />
                        }
                        label={
                          <Typography variant="caption" sx={{ fontWeight: 600, color: isMultiSelect ? 'primary.main' : 'text.secondary' }}>
                            Multi-Select
                          </Typography>
                        }
                        sx={{ m: 0 }}
                      />
                      {isMultiSelect && (
                        <Button
                          size="small"
                          variant="text"
                          onClick={handleSelectAllSheets}
                          sx={{ fontSize: '0.75rem', p: 0, minWidth: 'auto', textTransform: 'none', fontWeight: 600 }}
                        >
                          Select All
                        </Button>
                      )}
                    </Box>
                  </Box>

                  {isMultiSelect ? (
                    <FormControl fullWidth size="small">
                      <InputLabel id="worksheet-multi-select-label">Worksheets</InputLabel>
                      <Select
                        labelId="worksheet-multi-select-label"
                        multiple
                        value={selectedSheets}
                        label="Worksheets"
                        onChange={(e) => {
                          const val = typeof e.target.value === 'string' ? e.target.value.split(',') : (e.target.value as string[]);
                          if (val.length > 0) {
                            setSelectedSheets(val);
                            if (!val.includes(selectedSheet)) {
                              handleSheetChange(val[0]);
                            }
                          }
                        }}
                        renderValue={(selected) => (
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, py: 0.2 }}>
                            {(selected as string[]).map((s) => (
                              <Chip
                                key={s}
                                label={s}
                                size="small"
                                color={s === selectedSheet ? 'primary' : 'default'}
                                variant={s === selectedSheet ? 'filled' : 'outlined'}
                                onDelete={
                                  (selected as string[]).length > 1
                                    ? (e) => {
                                        e.stopPropagation();
                                        handleRemoveSelectedSheet(s);
                                      }
                                    : undefined
                                }
                                onMouseDown={(e) => e.stopPropagation()}
                                sx={{ height: 24, fontSize: '0.75rem' }}
                              />
                            ))}
                          </Box>
                        )}
                      >
                        <Box sx={{ px: 2, py: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider' }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                            SELECT WORKSHEETS
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <Button size="small" sx={{ fontSize: '0.7rem', py: 0 }} onClick={handleSelectAllSheets}>
                              Select All
                            </Button>
                            <Button
                              size="small"
                              color="secondary"
                              sx={{ fontSize: '0.7rem', py: 0 }}
                              onClick={handleClearSheets}
                              disabled={selectedSheets.length <= 1}
                            >
                              Reset
                            </Button>
                          </Box>
                        </Box>
                        {preview.sheets.map((s) => {
                          const checked = selectedSheets.includes(s);
                          return (
                            <MenuItem key={s} value={s}>
                              <Checkbox checked={checked} size="small" />
                              <ListItemText
                                primary={s}
                                secondary={s === selectedSheet ? 'Currently previewing columns' : undefined}
                              />
                            </MenuItem>
                          );
                        })}
                      </Select>
                    </FormControl>
                  ) : (
                    <FormControl fullWidth size="small">
                      <InputLabel>Worksheet</InputLabel>
                      <Select
                        value={selectedSheet}
                        label="Worksheet"
                        onChange={(e) => handleSheetChange(e.target.value)}
                      >
                        {preview.sheets.map((s) => (
                          <MenuItem key={s} value={s}>
                            {s}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                </Grid>

                {/* Import Mode */}
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', height: 24, mb: 0.8 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Import Mode
                    </Typography>
                  </Box>
                  {isMultiSelect && selectedSheets.length > 1 ? (
                    <FormControl fullWidth size="small">
                      <InputLabel>Import Mode</InputLabel>
                      <Select
                        value="BATCH_NEW_TABLES"
                        label="Import Mode"
                        disabled
                      >
                        <MenuItem value="BATCH_NEW_TABLES">
                          Create Brand New Tables (Batch Import - {selectedSheets.length} Tables)
                        </MenuItem>
                      </Select>
                    </FormControl>
                  ) : (
                    <FormControl fullWidth size="small">
                      <InputLabel>Import Mode</InputLabel>
                      <Select
                        value={importMode}
                        label="Import Mode"
                        onChange={(e) => setImportMode(e.target.value as any)}
                      >
                        <MenuItem value="INSERT_NEW_TABLE">Create Brand New Table</MenuItem>
                        <MenuItem value="APPEND_EXISTING">Append to Existing Table</MenuItem>
                        <MenuItem value="UPDATE_EXISTING">Update Matching Records in Table</MenuItem>
                        <MenuItem value="UPSERT_EXISTING">Upsert (Update or Insert) into Table</MenuItem>
                      </Select>
                    </FormControl>
                  )}
                </Grid>

                {/* Destination configuration: Multi-Sheet batch mapping or Single sheet options */}
                {isMultiSelect && selectedSheets.length > 1 ? (
                  <Grid size={{ xs: 12 }}>
                    <Paper
                      variant="outlined"
                      sx={{
                        p: 2,
                        borderRadius: 2,
                        bgcolor: 'background.default',
                        border: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
                        <Box>
                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                            Worksheet to Dynamic Table Mapping ({selectedSheets.length} Tables)
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                            Each selected worksheet will be imported as its own dynamic table. Customize names and identifiers below:
                          </Typography>
                        </Box>
                        <Chip
                          icon={<LayersOutlined />}
                          label="Multi-Table Batch Mode"
                          size="small"
                          color="primary"
                          variant="outlined"
                          sx={{ fontWeight: 600 }}
                        />
                      </Box>

                      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow sx={{ bgcolor: 'action.hover' }}>
                              <TableCell sx={{ fontWeight: 700 }}>Worksheet</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>New Table Display Name *</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>Table Slug Identifier *</TableCell>
                              <TableCell align="center" sx={{ fontWeight: 700 }}>Preview Columns</TableCell>
                              <TableCell align="center" sx={{ fontWeight: 700 }}>Action</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {selectedSheets.map((sheet) => {
                              const isCurrent = sheet === selectedSheet;
                              const cfg = batchSheetConfigs[sheet] || {
                                table_display_name: sheet,
                                table_name: sheet.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                              };
                              return (
                                <TableRow key={sheet} selected={isCurrent}>
                                  <TableCell sx={{ fontWeight: 600 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                      <TableView fontSize="small" color={isCurrent ? 'primary' : 'action'} />
                                      {sheet}
                                      {isCurrent && (
                                        <Chip
                                          label="Viewing Columns"
                                          size="small"
                                          color="primary"
                                          variant="outlined"
                                          sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }}
                                        />
                                      )}
                                    </Box>
                                  </TableCell>
                                  <TableCell>
                                    <TextField
                                      size="small"
                                      fullWidth
                                      value={cfg.table_display_name}
                                      onChange={(e) => handleBatchConfigChange(sheet, 'table_display_name', e.target.value)}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <TextField
                                      size="small"
                                      fullWidth
                                      value={cfg.table_name}
                                      onChange={(e) => handleBatchConfigChange(sheet, 'table_name', e.target.value)}
                                    />
                                  </TableCell>
                                  <TableCell align="center">
                                    <Button
                                      size="small"
                                      variant={isCurrent ? 'contained' : 'outlined'}
                                      color="primary"
                                      onClick={() => handleSheetChange(sheet)}
                                      startIcon={<VisibilityOutlined />}
                                      sx={{ fontSize: '0.75rem', textTransform: 'none', py: 0.4 }}
                                    >
                                      {isCurrent ? 'Viewing' : 'Inspect'}
                                    </Button>
                                  </TableCell>
                                  <TableCell align="center">
                                    <Tooltip title={selectedSheets.length <= 1 ? 'At least one sheet must remain selected' : 'Remove from batch'}>
                                      <span>
                                        <IconButton
                                          size="small"
                                          color="error"
                                          disabled={selectedSheets.length <= 1}
                                          onClick={() => handleRemoveSelectedSheet(sheet)}
                                        >
                                          <DeleteOutlined fontSize="small" />
                                        </IconButton>
                                      </span>
                                    </Tooltip>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Paper>
                  </Grid>
                ) : importMode === 'INSERT_NEW_TABLE' ? (
                  <>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        fullWidth
                        size="small"
                        label="New Table Display Name"
                        value={newTableDisplayName}
                        onChange={(e) => {
                          setNewTableDisplayName(e.target.value);
                          setNewTableName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
                        }}
                        required
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Table Slug Identifier"
                        value={newTableName}
                        onChange={(e) => setNewTableName(e.target.value)}
                        required
                      />
                    </Grid>
                  </>
                ) : (
                  <>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <FormControl fullWidth size="small" required>
                        <InputLabel>Select Target Table</InputLabel>
                        <Select
                          value={selectedExistingTableId}
                          label="Select Target Table"
                          onChange={(e) => setSelectedExistingTableId(e.target.value)}
                        >
                          {existingTables.map((t) => (
                            <MenuItem key={t.id} value={t.id}>
                              {t.display_name} ({t.name})
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                    {(importMode === 'UPDATE_EXISTING' || importMode === 'UPSERT_EXISTING') && (
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <FormControl fullWidth size="small" required>
                          <InputLabel>Matching Key Column</InputLabel>
                          <Select
                            value={matchingKeyColumn}
                            label="Matching Key Column"
                            onChange={(e) => setMatchingKeyColumn(e.target.value)}
                          >
                            {columnConfigs.map((c) => (
                              <MenuItem key={c.target_column} value={c.target_column}>
                                {c.target_column} ({c.source_column})
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>
                    )}
                  </>
                )}
              </Grid>
            </CardContent>
          </Card>

          {/* Columns Table */}
          <Card sx={{ mb: 3, borderRadius: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    2. Detected Columns & Data Types ({preview.detected_columns.length})
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                    Review detected headers and override types or mark sensitive fields as needed.
                  </Typography>
                </Box>
                <Button
                  size="small"
                  variant="outlined"
                  color="secondary"
                  onClick={handleSetAllToMixed}
                  sx={{ fontWeight: 600, textTransform: 'none' }}
                >
                  ⚡ Set All Columns to MIXED
                </Button>
              </Box>

              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Excel Header</TableCell>
                      <TableCell>Target Column Key</TableCell>
                      <TableCell>Data Type</TableCell>
                      <TableCell align="center">Required</TableCell>
                      <TableCell align="center">Sensitive (AES-256)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {columnConfigs.map((cfg, idx) => (
                      <TableRow key={cfg.source_column}>
                        <TableCell sx={{ fontWeight: 600 }}>{cfg.source_column}</TableCell>
                        <TableCell>
                          <TextField
                            size="small"
                            value={cfg.target_column}
                            onChange={(e) => {
                              const updated = [...columnConfigs];
                              updated[idx].target_column = e.target.value;
                              setColumnConfigs(updated);
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            size="small"
                            value={cfg.data_type}
                            onChange={(e) => {
                              const updated = [...columnConfigs];
                              updated[idx].data_type = e.target.value as ColumnType;
                              if (e.target.value === 'PASSWORD') {
                                updated[idx].is_sensitive = true;
                                updated[idx].is_encrypted = true;
                              }
                              setColumnConfigs(updated);
                            }}
                            sx={{ minWidth: 140 }}
                          >
                            {COLUMN_TYPES.map((t) => (
                              <MenuItem key={t} value={t}>
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontWeight: t === 'MIXED' ? 700 : 400,
                                    color: t === 'MIXED' ? 'secondary.main' : 'inherit',
                                  }}
                                >
                                  {t === 'MIXED' ? 'MIXED (Alphanumeric/Codes)' : t}
                                </Typography>
                              </MenuItem>
                            ))}
                          </Select>
                        </TableCell>
                        <TableCell align="center">
                          <Checkbox
                            size="small"
                            checked={cfg.is_required}
                            onChange={(e) => {
                              const updated = [...columnConfigs];
                              updated[idx].is_required = e.target.checked;
                              setColumnConfigs(updated);
                            }}
                          />
                        </TableCell>
                        <TableCell align="center">
                          <Switch
                            size="small"
                            color="secondary"
                            checked={cfg.is_sensitive}
                            onChange={(e) => {
                              const updated = [...columnConfigs];
                              updated[idx].is_sensitive = e.target.checked;
                              updated[idx].is_encrypted = e.target.checked;
                              setColumnConfigs(updated);
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>

          {/* Buttons */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4, flexWrap: 'wrap', gap: 1.5 }}>
            <Button variant="outlined" onClick={() => setActiveStep(0)}>
              Back
            </Button>
            {isMultiSelect && selectedSheets.length > 1 ? (
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                <Button
                  variant="outlined"
                  color="secondary"
                  onClick={handleValidate}
                  disabled={loading}
                >
                  Validate Active Sheet ({selectedSheet})
                </Button>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleExecuteBatchImport}
                  disabled={loading}
                  startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <FlashOn />}
                  sx={{ fontWeight: 700 }}
                >
                  {loading ? 'Importing...' : `Execute Batch Import (${selectedSheets.length} Tables)`}
                </Button>
              </Box>
            ) : (
              <Button variant="contained" onClick={handleValidate} disabled={loading}>
                {loading ? <CircularProgress size={24} color="inherit" /> : 'Validate Spreadsheet Rows'}
              </Button>
            )}
          </Box>
        </Box>
      )}

      {/* Step 3: Validation Report */}
      {activeStep === 2 && validationSummary && (
        <Box>
          <Card sx={{ mb: 3, borderRadius: 3 }}>
            <CardContent sx={{ p: 4 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                Row Validation Breakdown
              </Typography>

              {isMultiSelect && selectedSheets.length > 1 && (
                <Alert severity="info" sx={{ mb: 3 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    Active Sheet: {selectedSheet} &bull; Batch Mode Active
                  </Typography>
                  <Typography variant="caption">
                    You have selected {selectedSheets.length} worksheets for import ({selectedSheets.join(', ')}). Clicking confirm below will batch import all selected sheets into their designated tables.
                  </Typography>
                </Alert>
              )}

              <Grid container spacing={2.5} sx={{ mb: 3 }}>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'background.default' }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                      TOTAL ROWS
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 800 }}>
                      {validationSummary.total_rows}
                    </Typography>
                  </Paper>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'rgba(16, 185, 129, 0.1)' }}>
                    <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600 }}>
                      VALID ROWS
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 800, color: 'success.main' }}>
                      {validationSummary.valid_rows}
                    </Typography>
                  </Paper>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'rgba(245, 158, 11, 0.1)' }}>
                    <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 600 }}>
                      WARNING ROWS
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 800, color: 'warning.main' }}>
                      {validationSummary.warning_rows}
                    </Typography>
                  </Paper>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'rgba(244, 63, 94, 0.1)' }}>
                    <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 600 }}>
                      ERROR ROWS
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 800, color: 'error.main' }}>
                      {validationSummary.error_rows}
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>

              {validationSummary.error_rows > 0 && (
                <>
                  <Alert
                    severity="warning"
                    sx={{ mb: 3, alignItems: 'center' }}
                    action={
                      <Button
                        color="warning"
                        variant="contained"
                        size="small"
                        onClick={handleAutoConvertFailingToMixed}
                        disabled={loading}
                        sx={{ fontWeight: 700, textTransform: 'none' }}
                      >
                        ⚡ Auto-Fix: Convert Failing to MIXED & Re-Validate
                      </Button>
                    }
                  >
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Data Type Conversion Errors Detected ({validationSummary.error_rows} rows)
                    </Typography>
                    <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                      Some rows contain mixed alphanumeric text, codes, or formulas (e.g. '#N/A' or letters). Click the button to automatically switch these columns to MIXED data type.
                    </Typography>
                  </Alert>

                  <Box sx={{ mb: 3 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'error.main', mb: 1 }}>
                      Sample Validation Errors:
                    </Typography>
                    <Paper variant="outlined" sx={{ p: 2, maxHeight: 180, overflowY: 'auto', borderRadius: 2 }}>
                      {validationSummary.errors.map((err, i) => (
                        <Typography key={i} variant="caption" sx={{ display: 'block', color: 'error.main', mb: 0.5 }}>
                          &bull; Row {err.row_number} [{err.column_name}]: {err.message}
                        </Typography>
                      ))}
                    </Paper>
                  </Box>
                </>
              )}
            </CardContent>
          </Card>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 4 }}>
            <Button variant="outlined" onClick={() => setActiveStep(1)}>
              Back to Column Mapping
            </Button>
            <Button
              variant="contained"
              color="primary"
              onClick={handleExecuteImport}
              disabled={loading || validationSummary.error_rows > 0}
            >
              {loading ? (
                <CircularProgress size={24} color="inherit" />
              ) : isMultiSelect && selectedSheets.length > 1 ? (
                `Confirm & Batch Import (${selectedSheets.length} Tables)`
              ) : (
                'Confirm & Import Records'
              )}
            </Button>
          </Box>
        </Box>
      )}

      {/* Step 4: Import Complete */}
      {activeStep === 3 && (batchImportResult || importResult) && (
        <Card sx={{ borderRadius: 3 }}>
          <CardContent sx={{ p: 5 }}>
            <Box sx={{ textAlign: 'center', mb: 4 }}>
              <CheckCircleOutlined sx={{ fontSize: 72, color: 'success.main', mb: 2 }} />
              <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>
                {batchImportResult ? 'Batch Import Completed Successfully!' : 'Import Completed Successfully!'}
              </Typography>
              <Typography variant="body1" sx={{ color: 'text.secondary' }}>
                {batchImportResult ? (
                  <>
                    Successfully processed <strong>{batchImportResult.total_sheets_processed}</strong> worksheets and
                    created <strong>{batchImportResult.successful_tables.length}</strong> dynamic table
                    {batchImportResult.successful_tables.length !== 1 ? 's' : ''}.
                  </>
                ) : (
                  <>
                    Imported <strong>{importResult?.imported_rows}</strong> records into dynamic table{' '}
                    <strong>{importResult?.table_name}</strong>.
                  </>
                )}
              </Typography>
            </Box>

            {batchImportResult && (
              <Box sx={{ mb: 4 }}>
                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'action.hover' }}>
                        <TableCell sx={{ fontWeight: 700 }}>Worksheet</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Created Table</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700 }}>Columns</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700 }}>Imported Rows</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700 }}>Status</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700 }}>Action</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {batchImportResult.successful_tables.map((t) => (
                        <TableRow key={t.table_name}>
                          <TableCell sx={{ fontWeight: 600 }}>{t.sheet_name}</TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                              {t.table_display_name}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                              {t.table_name}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">{t.total_columns}</TableCell>
                          <TableCell align="center">
                            <Chip
                              label={`${t.imported_rows} rows`}
                              size="small"
                              color="success"
                              variant="outlined"
                              sx={{ fontWeight: 600 }}
                            />
                          </TableCell>
                          <TableCell align="center">
                            <Chip label={t.status} size="small" color="success" sx={{ fontWeight: 700 }} />
                          </TableCell>
                          <TableCell align="center">
                            {t.table_id && (
                              <Button
                                variant="contained"
                                size="small"
                                onClick={() => navigate(`/tables/${t.table_id}`)}
                                sx={{ textTransform: 'none' }}
                              >
                                Open Grid
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {batchImportResult && batchImportResult.failed_sheets.length > 0 && (
              <Alert severity="error" sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                  Some sheets could not be imported:
                </Typography>
                {batchImportResult.failed_sheets.map((f, i) => (
                  <Typography key={i} variant="caption" sx={{ display: 'block' }}>
                    &bull; Sheet '{f.sheet_name}': {f.error_message}
                  </Typography>
                ))}
              </Alert>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap', mt: 2 }}>
              {importResult?.table_id && (
                <Button
                  variant="contained"
                  size="large"
                  onClick={() => navigate(`/tables/${importResult.table_id}`)}
                >
                  Open Table Grid
                </Button>
              )}
              {batchImportResult?.successful_tables[0]?.table_id && (
                <Button
                  variant="contained"
                  size="large"
                  onClick={() => navigate(`/tables/${batchImportResult.successful_tables[0].table_id}`)}
                >
                  Open First Table Grid
                </Button>
              )}
              <Button variant="outlined" size="large" onClick={() => navigate('/imports/history')}>
                View Import History
              </Button>
              <Button
                variant="outlined"
                size="large"
                onClick={() => {
                  setActiveStep(0);
                  setSelectedFile(null);
                  setPreview(null);
                  setImportResult(null);
                  setBatchImportResult(null);
                  setSelectedSheets([]);
                  setIsMultiSelect(false);
                }}
              >
                Import Another File
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default ExcelImportWizard;

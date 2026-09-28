import React, { useEffect, useState } from 'react';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Slide,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import { TransitionProps } from '@mui/material/transitions';
import {
  Close,
  DescriptionOutlined,
  Download,
  EditNote,
  History,
  PictureAsPdf,
  Restore,
  Visibility,
} from '@mui/icons-material';
import { apiClient } from '../../api/client';
import { DocumentItem } from '../../types';
import { PdfStudio } from './PdfStudio';
import { WordStudio } from './WordStudio';

interface DocumentStudioModalProps {
  documentId: string | null;
  open: boolean;
  initialMode?: 'read' | 'edit';
  onClose: () => void;
  onDocumentUpdated?: () => void;
}

export const DocumentStudioModal: React.FC<DocumentStudioModalProps> = ({
  documentId,
  open,
  initialMode = 'read',
  onClose,
  onDocumentUpdated,
}) => {
  const [doc, setDoc] = useState<DocumentItem | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'read' | 'edit'>(initialMode);
  const [versionDrawerOpen, setVersionDrawerOpen] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);

  // Fetch document info
  const fetchDoc = async () => {
    if (!documentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<DocumentItem>(`/attachments/${documentId}`);
      setDoc(res.data);
      setSelectedVersion(res.data.version);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch document.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && documentId) {
      setMode(initialMode);
      fetchDoc();
    } else {
      setDoc(null);
      setSelectedVersion(null);
      setSaveSuccessMsg(null);
    }
  }, [open, documentId, initialMode]);

  if (!open || !documentId) return null;

  const isPdf =
    doc?.content_type.toLowerCase().includes('pdf') ||
    doc?.original_filename.toLowerCase().endsWith('.pdf');

  const isWord =
    doc?.content_type.toLowerCase().includes('word') ||
    doc?.content_type.toLowerCase().includes('officedocument') ||
    doc?.original_filename.toLowerCase().endsWith('.docx') ||
    doc?.original_filename.toLowerCase().endsWith('.doc');

  const fileUrl = `/attachments/${documentId}/preview${
    selectedVersion && selectedVersion !== doc?.version ? `?version=${selectedVersion}` : ''
  }`;

  // Handle Save
  const handleSave = async (newBytes: Uint8Array, summary: string) => {
    setSaving(true);
    setSaveSuccessMsg(null);
    try {
      const formData = new FormData();
      const ext = isPdf ? 'pdf' : 'docx';
      const mime = isPdf
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

      const file = new File([newBytes as any], doc?.original_filename || `document.${ext}`, {
        type: mime,
      });
      formData.append('file', file);
      formData.append('change_summary', summary);

      const res = await apiClient.put<DocumentItem>(`/attachments/${documentId}/save`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setDoc(res.data);
      setSelectedVersion(res.data.version);
      setSaveSuccessMsg(`Saved successfully as Version ${res.data.version}!`);
      onDocumentUpdated?.();

      setTimeout(() => {
        setSaveSuccessMsg(null);
      }, 4000);
    } catch (err: any) {
      alert(`Save failed: ${err.response?.data?.detail || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Handle Revert
  const handleRevert = async (versionId: string, verNum: number) => {
    if (
      !window.confirm(
        `Are you sure you want to revert to Version ${verNum}? A new point-in-time version snapshot will be created.`
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.post<DocumentItem>(
        `/attachments/${documentId}/revert/${versionId}`
      );
      setDoc(res.data);
      setSelectedVersion(res.data.version);
      setVersionDrawerOpen(false);
      setSaveSuccessMsg(`Reverted to Version ${verNum} successfully! (Active: v${res.data.version})`);
      onDocumentUpdated?.();

      setTimeout(() => {
        setSaveSuccessMsg(null);
      }, 4000);
    } catch (err: any) {
      alert(`Revert failed: ${err.response?.data?.detail || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    const token = localStorage.getItem('auth_token');
    const url = `/api/v1/attachments/${documentId}/download?token=${token || ''}${
      selectedVersion ? `&version=${selectedVersion}` : ''
    }`;
    window.open(url, '_blank');
  };

  return (
    <Dialog
      fullScreen
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            bgcolor: '#0B1120',
          },
        },
      }}
    >
      {/* Studio Header Bar */}
      <AppBar
        position="relative"
        elevation={3}
        sx={{
          bgcolor: '#0F172A',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <Toolbar sx={{ justifyContent: 'space-between', gap: 2 }}>
          {/* File Title & Icon */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
            {isPdf ? (
              <PictureAsPdf sx={{ color: '#EF4444', fontSize: 28 }} />
            ) : (
              <DescriptionOutlined sx={{ color: '#3B82F6', fontSize: 28 }} />
            )}

            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="subtitle1"
                sx={{
                  fontWeight: 700,
                  color: '#F8FAFC',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 400,
                }}
              >
                {doc?.original_filename || 'Document Studio'}
              </Typography>
              <Typography variant="caption" sx={{ color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 1 }}>
                <span>
                  {doc ? `${(doc.file_size_bytes / 1024).toFixed(1)} KB` : ''}
                </span>
                <span>•</span>
                <span>Uploaded by {doc?.uploaded_by_username || 'User'}</span>
              </Typography>
            </Box>

            {doc && (
              <Tooltip title="Click to view Version History snapshots">
                <Chip
                  label={`v${selectedVersion || doc.version}${
                    selectedVersion && selectedVersion !== doc.version ? ' (Historical)' : ' (Active)'
                  }`}
                  size="small"
                  color={selectedVersion && selectedVersion !== doc.version ? 'warning' : 'primary'}
                  onClick={() => setVersionDrawerOpen(true)}
                  sx={{ fontWeight: 700, cursor: 'pointer', ml: 1 }}
                />
              </Tooltip>
            )}
          </Box>

          {/* Mode Switcher & Actions */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {saveSuccessMsg && (
              <Alert severity="success" sx={{ py: 0, px: 1.5, fontSize: '0.82rem' }}>
                {saveSuccessMsg}
              </Alert>
            )}

            {/* Mode Switch Buttons */}
            <Box
              sx={{
                bgcolor: 'rgba(255,255,255,0.06)',
                p: 0.4,
                borderRadius: 2,
                display: 'flex',
                gap: 0.5,
              }}
            >
              <Button
                size="small"
                variant={mode === 'read' ? 'contained' : 'text'}
                color={mode === 'read' ? 'primary' : 'inherit'}
                startIcon={<Visibility fontSize="small" />}
                onClick={() => setMode('read')}
                sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem', px: 1.5 }}
              >
                Reading Mode
              </Button>
              <Button
                size="small"
                variant={mode === 'edit' ? 'contained' : 'text'}
                color={mode === 'edit' ? 'primary' : 'inherit'}
                startIcon={<EditNote fontSize="small" />}
                onClick={() => setMode('edit')}
                sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem', px: 1.5 }}
              >
                Editing Studio
              </Button>
            </Box>

            <Tooltip title="Version History Snapshots">
              <Button
                size="small"
                variant="outlined"
                color="inherit"
                startIcon={<History fontSize="small" />}
                onClick={() => setVersionDrawerOpen(true)}
                sx={{ borderColor: 'rgba(255,255,255,0.2)', textTransform: 'none' }}
              >
                History ({doc?.versions.length || 1})
              </Button>
            </Tooltip>

            <Tooltip title="Download Active Document">
              <IconButton size="small" onClick={handleDownload} sx={{ color: '#E2E8F0' }}>
                <Download fontSize="small" />
              </IconButton>
            </Tooltip>

            <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.15)' }} />

            <Tooltip title="Close Document Studio">
              <IconButton edge="end" color="inherit" onClick={onClose} aria-label="close">
                <Close />
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Main Studio Body */}
      <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {loading && (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
              gap: 2,
            }}
          >
            <CircularProgress size={50} />
            <Typography variant="body2" sx={{ color: '#94A3B8' }}>
              Loading document studio...
            </Typography>
          </Box>
        )}

        {error && (
          <Box sx={{ p: 4, textAlign: 'center', color: '#F87171' }}>
            <Typography variant="h6">Unable to load document</Typography>
            <Typography variant="body2">{error}</Typography>
          </Box>
        )}

        {!loading && !error && doc && (
          <>
            {isPdf ? (
              <PdfStudio
                fileUrl={fileUrl}
                isEditing={mode === 'edit'}
                onSave={handleSave}
                saving={saving}
              />
            ) : isWord ? (
              <WordStudio
                fileUrl={fileUrl}
                isEditing={mode === 'edit'}
                onSave={handleSave}
                saving={saving}
              />
            ) : (
              <Box sx={{ p: 5, textAlign: 'center', color: '#94A3B8' }}>
                <Typography variant="h6">Unsupported Document Format</Typography>
                <Typography variant="body2">
                  DataMatrix Studio currently supports PDF (.pdf) and Word (.docx) files.
                </Typography>
                <Button variant="contained" sx={{ mt: 2 }} onClick={handleDownload}>
                  Download File
                </Button>
              </Box>
            )}
          </>
        )}
      </Box>

      {/* Version History Drawer */}
      <Drawer
        anchor="right"
        open={versionDrawerOpen}
        onClose={() => setVersionDrawerOpen(false)}
        slotProps={{
          paper: {
            sx: {
              width: 360,
              bgcolor: '#1E293B',
              color: '#F8FAFC',
              p: 2.5,
            },
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <History color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Version History
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setVersionDrawerOpen(false)} sx={{ color: '#94A3B8' }}>
            <Close fontSize="small" />
          </IconButton>
        </Box>

        <Typography variant="caption" sx={{ color: '#94A3B8', display: 'block', mb: 2 }}>
          Every edit creates an immutable point-in-time revision snapshot with 1-click restore.
        </Typography>

        <List sx={{ p: 0 }}>
          {doc?.versions.map((ver) => {
            const isCurrentActive = ver.version_number === doc.version;
            const isSelected = ver.version_number === selectedVersion;

            return (
              <ListItem
                key={ver.id}
                sx={{
                  bgcolor: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid',
                  borderColor: isSelected ? '#3B82F6' : 'rgba(255, 255, 255, 0.08)',
                  borderRadius: 2,
                  mb: 1.5,
                  p: 1.5,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', mb: 0.8 }}>
                  <Chip
                    label={`v${ver.version_number}`}
                    size="small"
                    color={isCurrentActive ? 'success' : 'default'}
                    sx={{ fontWeight: 700, fontSize: '0.75rem' }}
                  />
                  <Typography variant="caption" sx={{ color: '#94A3B8' }}>
                    {new Date(ver.created_at).toLocaleString()}
                  </Typography>
                </Box>

                <Typography variant="body2" sx={{ fontWeight: 600, color: '#E2E8F0', mb: 0.5 }}>
                  {ver.change_summary || 'Document update'}
                </Typography>

                <Typography variant="caption" sx={{ color: '#94A3B8', mb: 1.5 }}>
                  By: {ver.created_by_username || 'System'} • {(ver.file_size_bytes / 1024).toFixed(1)} KB
                </Typography>

                <Box sx={{ display: 'flex', gap: 1, width: '100%' }}>
                  <Button
                    size="small"
                    variant={isSelected ? 'contained' : 'outlined'}
                    onClick={() => {
                      setSelectedVersion(ver.version_number);
                      setVersionDrawerOpen(false);
                    }}
                    sx={{ flex: 1, textTransform: 'none', fontSize: '0.75rem' }}
                  >
                    {isSelected ? 'Viewing' : 'Preview'}
                  </Button>

                  {!isCurrentActive && (
                    <Button
                      size="small"
                      variant="outlined"
                      color="warning"
                      startIcon={<Restore fontSize="small" />}
                      onClick={() => handleRevert(ver.id, ver.version_number)}
                      sx={{ flex: 1, textTransform: 'none', fontSize: '0.75rem' }}
                    >
                      Revert
                    </Button>
                  )}
                </Box>
              </ListItem>
            );
          })}
        </List>
      </Drawer>
    </Dialog>
  );
};

import React from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  IconButton,
  Typography,
} from '@mui/material';
import { Close } from '@mui/icons-material';
import { useThemeMode } from '../../context/ThemeContext';

interface ConfirmDeleteModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  open,
  onClose,
  onConfirm,
  title = 'Do you really want to delete the file?',
  description,
  confirmText = 'Yes delete the file',
  cancelText = 'Cancel.this time',
  loading = false,
}) => {
  const { mode } = useThemeMode();

  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: {
          elevation: 8,
          sx: {
            borderRadius: '24px',
            p: { xs: 2.5, sm: 3.5 },
            position: 'relative',
            bgcolor: mode === 'dark' ? '#0f172a' : '#ffffff',
            backgroundImage: 'none',
            border: mode === 'dark' ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #f1f5f9',
            boxShadow:
              mode === 'dark'
                ? '0 20px 60px rgba(0, 0, 0, 0.6)'
                : '0 20px 60px rgba(15, 23, 42, 0.12)',
            overflow: 'hidden',
          },
        },
      }}
    >
      {/* Close 'X' Button */}
      <IconButton
        onClick={onClose}
        disabled={loading}
        size="small"
        sx={{
          position: 'absolute',
          top: 18,
          right: 18,
          color: mode === 'dark' ? '#94a3b8' : '#64748b',
          bgcolor: mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : '#f8fafc',
          '&:hover': {
            bgcolor: mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : '#f1f5f9',
            color: mode === 'dark' ? '#ffffff' : '#0f172a',
          },
        }}
      >
        <Close fontSize="small" />
      </IconButton>

      <DialogContent sx={{ p: 0, textAlign: 'center' }}>
        {/* Modal Title */}
        <Typography
          variant="h6"
          sx={{
            fontWeight: 800,
            fontSize: { xs: '1.15rem', sm: '1.3rem' },
            letterSpacing: '-0.02em',
            color: mode === 'dark' ? '#f8fafc' : '#1e293b',
            mt: 1,
            mb: description ? 0.75 : 2,
            px: 3,
            lineHeight: 1.35,
          }}
        >
          {title}
        </Typography>

        {/* Subtitle / File Name (if provided) */}
        {description && (
          <Typography
            variant="body2"
            sx={{
              color: mode === 'dark' ? '#94a3b8' : '#64748b',
              fontWeight: 500,
              fontSize: '0.85rem',
              mb: 2,
              px: 2,
              wordBreak: 'break-word',
            }}
          >
            {description}
          </Typography>
        )}

        {/* Trash Can Vector Illustration matching user reference */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            my: { xs: 2, sm: 2.5 },
          }}
        >
          <svg
            width="220"
            height="180"
            viewBox="0 0 220 180"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Background Soft Blobs & Cloud Shapes */}
            <ellipse cx="110" cy="98" rx="65" ry="60" fill={mode === 'dark' ? 'rgba(59, 130, 246, 0.12)' : '#eff6ff'} />
            <rect x="52" y="80" width="36" height="12" rx="6" fill={mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#f1f5f9'} />
            <rect x="135" y="66" width="30" height="10" rx="5" fill={mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#f1f5f9'} />
            <rect x="50" y="112" width="120" height="14" rx="7" fill={mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#f1f5f9'} />
            <rect x="140" y="118" width="14" height="14" rx="4" fill={mode === 'dark' ? 'rgba(255,255,255,0.06)' : '#e2e8f0'} />
            <circle cx="152" cy="74" r="3" fill="#cbd5e1" />
            <circle cx="68" cy="74" r="2.5" fill="#cbd5e1" />
            <circle cx="85" cy="50" r="2" fill="#cbd5e1" />

            {/* Document sheet falling into trash */}
            <g transform="rotate(-8 116 75)">
              {/* Paper shadow */}
              <rect x="99" y="44" width="40" height="52" rx="3.5" fill="rgba(0,0,0,0.06)" />
              {/* Paper body */}
              <rect x="97" y="42" width="40" height="52" rx="3.5" fill="#ffffff" stroke="#e2e8f0" strokeWidth="1" />
              {/* Text lines */}
              <rect x="103" y="49" width="18" height="3" rx="1.5" fill="#334155" />
              <rect x="103" y="55" width="28" height="2.5" rx="1.25" fill="#475569" />
              <rect x="103" y="60" width="26" height="2.5" rx="1.25" fill="#475569" />
              <rect x="103" y="65" width="24" height="2.5" rx="1.25" fill="#475569" />
              <rect x="103" y="70" width="28" height="2.5" rx="1.25" fill="#475569" />
              <rect x="103" y="75" width="20" height="2.5" rx="1.25" fill="#94a3b8" />
            </g>

            {/* Trash Can Lid (Tilted back-left) */}
            <g transform="rotate(-38 98 62)">
              {/* Lid knob */}
              <ellipse cx="98" cy="46" rx="6" ry="4" fill="#2563eb" />
              {/* Lid rim */}
              <rect x="68" y="50" width="60" height="12" rx="6" fill="#3b82f6" />
              <path d="M74 56 C74 52, 122 52, 122 56 Z" fill="#2563eb" opacity="0.25" />
            </g>

            {/* Trash Can Body */}
            <g>
              {/* Main bin container (tapered) */}
              <path
                d="M80 82 L86 148 C86.5 151.5 89.5 154 93 154 L127 154 C130.5 154 133.5 151.5 134 148 L140 82 Z"
                fill="#3b82f6"
              />
              {/* Bin top opening shadow */}
              <ellipse cx="110" cy="82" rx="30" ry="6" fill="#2563eb" />

              {/* Vertical ribs on the bin */}
              <path d="M96 90 L98 144" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" />
              <path d="M110 90 L110 144" stroke="#2563eb" strokeWidth="4.5" strokeLinecap="round" />
              <path d="M124 90 L122 144" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" />

              {/* Subtle light reflection on left side of can */}
              <path
                d="M84 86 L89 146"
                stroke="#60a5fa"
                strokeWidth="2.5"
                strokeLinecap="round"
                opacity="0.6"
              />
            </g>
          </svg>
        </Box>

        {/* Action Buttons matching screenshot */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            mt: 2,
            mb: 0.5,
          }}
        >
          {/* Coral / Red Delete Button */}
          <Button
            variant="contained"
            onClick={onConfirm}
            disabled={loading}
            sx={{
              flex: 1,
              py: 1.15,
              borderRadius: '8px',
              textTransform: 'none',
              fontWeight: 700,
              fontSize: '0.88rem',
              bgcolor: '#e15263',
              color: '#ffffff',
              boxShadow: '0 4px 12px rgba(225, 82, 99, 0.35)',
              transition: 'all 0.18s ease-in-out',
              '&:hover': {
                bgcolor: '#d24153',
                boxShadow: '0 6px 16px rgba(225, 82, 99, 0.5)',
                transform: 'translateY(-1px)',
              },
            }}
          >
            {loading ? <CircularProgress size={20} sx={{ color: '#ffffff' }} /> : confirmText}
          </Button>

          {/* Blue Cancel Button */}
          <Button
            variant="contained"
            onClick={onClose}
            disabled={loading}
            sx={{
              flex: 1,
              py: 1.15,
              borderRadius: '8px',
              textTransform: 'none',
              fontWeight: 700,
              fontSize: '0.88rem',
              bgcolor: '#4c8bf5',
              color: '#ffffff',
              boxShadow: '0 4px 12px rgba(76, 139, 245, 0.35)',
              transition: 'all 0.18s ease-in-out',
              '&:hover': {
                bgcolor: '#3777e4',
                boxShadow: '0 6px 16px rgba(76, 139, 245, 0.5)',
                transform: 'translateY(-1px)',
              },
            }}
          >
            {cancelText}
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
};
export default ConfirmDeleteModal;

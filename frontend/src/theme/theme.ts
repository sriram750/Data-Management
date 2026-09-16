import { createTheme, type ThemeOptions } from '@mui/material/styles';

export const getAppTheme = (mode: 'dark' | 'light') => {
  const isDark = mode === 'dark';

  const themeOptions: ThemeOptions = {
    palette: {
      mode,
      primary: {
        main: '#6366f1',
        light: '#818cf8',
        dark: '#4f46e5',
        contrastText: '#ffffff',
      },
      secondary: {
        main: '#0ea5e9',
        light: '#38bdf8',
        dark: '#0284c7',
        contrastText: '#ffffff',
      },
      success: {
        main: '#10b981',
        light: '#34d399',
        dark: '#059669',
      },
      warning: {
        main: '#f59e0b',
        light: '#fbbf24',
        dark: '#d97706',
      },
      error: {
        main: '#f43f5e',
        light: '#fb7185',
        dark: '#e11d48',
      },
      background: {
        default: isDark ? '#090d16' : '#f8fafc',
        paper: isDark ? '#111827' : '#ffffff',
      },
      text: {
        primary: isDark ? '#f1f5f9' : '#0f172a',
        secondary: isDark ? '#94a3b8' : '#64748b',
      },
      divider: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
    },
    typography: {
      fontFamily: [
        'Inter',
        '-apple-system',
        'BlinkMacSystemFont',
        '"Segoe UI"',
        'Roboto',
        'sans-serif',
      ].join(','),
      fontSize: 13,
      h1: { fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.25 },
      h2: { fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.3 },
      h3: { fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.35 },
      h4: { fontSize: '1.125rem', fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.4 },
      h5: { fontSize: '0.975rem', fontWeight: 600, lineHeight: 1.4 },
      h6: { fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.45 },
      subtitle1: { fontSize: '0.875rem', fontWeight: 500, lineHeight: 1.4 },
      subtitle2: { fontSize: '0.8125rem', fontWeight: 500, lineHeight: 1.4 },
      body1: { fontSize: '0.84rem', lineHeight: 1.5 },
      body2: { fontSize: '0.78rem', lineHeight: 1.5 },
      caption: { fontSize: '0.72rem', lineHeight: 1.4 },
      button: { textTransform: 'none', fontWeight: 600, fontSize: '0.8125rem' },
    },
    shape: {
      borderRadius: 8,
    },
    components: {
      MuiButton: {
        defaultProps: {
          size: 'small',
        },
        styleOverrides: {
          root: {
            borderRadius: 6,
            padding: '5px 12px',
            fontSize: '0.8125rem',
            boxShadow: 'none',
            '&:hover': {
              boxShadow: '0 2px 8px rgba(99, 102, 241, 0.25)',
            },
          },
          sizeSmall: {
            padding: '3px 8px',
            fontSize: '0.75rem',
          },
          sizeMedium: {
            padding: '6px 14px',
            fontSize: '0.8125rem',
          },
          sizeLarge: {
            padding: '8px 18px',
            fontSize: '0.875rem',
          },
          contained: {
            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            border: isDark ? '1px solid rgba(255, 255, 255, 0.07)' : '1px solid rgba(0, 0, 0, 0.06)',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            borderRadius: 10,
            border: isDark ? '1px solid rgba(255, 255, 255, 0.07)' : '1px solid rgba(0, 0, 0, 0.06)',
            boxShadow: isDark
              ? '0 2px 12px rgba(0, 0, 0, 0.25)'
              : '0 2px 12px rgba(0, 0, 0, 0.03)',
          },
        },
      },
      MuiCardContent: {
        styleOverrides: {
          root: {
            padding: '16px',
            '&:last-child': {
              paddingBottom: '16px',
            },
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: isDark ? 'rgba(17, 24, 39, 0.9)' : 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(12px)',
            borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
            boxShadow: 'none',
            color: isDark ? '#f1f5f9' : '#0f172a',
          },
        },
      },
      MuiToolbar: {
        styleOverrides: {
          root: {
            minHeight: '52px !important',
            paddingLeft: '16px !important',
            paddingRight: '16px !important',
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: isDark ? '#0c1220' : '#ffffff',
            borderRight: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            padding: '7px 12px',
            fontSize: '0.8rem',
            borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)',
          },
          head: {
            fontWeight: 600,
            fontSize: '0.78rem',
            padding: '8px 12px',
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            backgroundColor: isDark ? '#111827' : '#f8fafc',
            color: isDark ? '#94a3b8' : '#475569',
          },
          sizeSmall: {
            padding: '4px 8px',
            fontSize: '0.75rem',
          },
        },
      },
      MuiOutlinedInput: {
        defaultProps: {
          size: 'small',
        },
        styleOverrides: {
          root: {
            borderRadius: 6,
            fontSize: '0.8125rem',
          },
          input: {
            padding: '7px 10px',
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: {
            fontSize: '0.8125rem',
          },
          sizeSmall: {
            fontSize: '0.78rem',
          },
        },
      },
      MuiSelect: {
        defaultProps: {
          size: 'small',
        },
        styleOverrides: {
          select: {
            padding: '6.5px 10px',
            fontSize: '0.8125rem',
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 5,
            fontWeight: 500,
            height: 22,
            fontSize: '0.72rem',
          },
          sizeSmall: {
            height: 18,
            fontSize: '0.68rem',
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            padding: 6,
          },
          sizeSmall: {
            padding: 4,
          },
        },
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: {
            padding: '12px 18px',
            fontSize: '0.975rem',
            fontWeight: 600,
          },
        },
      },
      MuiDialogContent: {
        styleOverrides: {
          root: {
            padding: '14px 18px',
          },
        },
      },
      MuiDialogActions: {
        styleOverrides: {
          root: {
            padding: '8px 18px 12px 18px',
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            minHeight: 38,
            padding: '5px 12px',
            fontSize: '0.8rem',
            textTransform: 'none',
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          root: {
            minHeight: 38,
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            paddingTop: 4,
            paddingBottom: 4,
            borderRadius: 6,
          },
        },
      },
    },
  };

  return createTheme(themeOptions);
};

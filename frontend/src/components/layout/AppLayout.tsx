import React, { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  DashboardOutlined,
  TableChartOutlined,
  StarBorder,
  AddCircleOutlined,
  FileUploadOutlined,
  HistoryOutlined,
  FileDownloadOutlined,
  SecurityOutlined,
  PeopleOutlined,
  AdminPanelSettingsOutlined,
  DevicesOutlined,
  FactCheckOutlined,
  KeyOutlined,
  SettingsOutlined,
  DarkModeOutlined,
  LightModeOutlined,
  LogoutOutlined,
  PersonOutlined,
  LockResetOutlined,
  Menu as MenuIcon,
  ExpandLess,
  ExpandMore,
  TableView,
} from '@mui/icons-material';

import { useAuth } from '../../context/AuthContext';
import { useThemeMode } from '../../context/ThemeContext';
import ChangePasswordModal from '../../features/auth/ChangePasswordModal';
import ActiveSessionsModal from '../../features/auth/ActiveSessionsModal';

const DRAWER_WIDTH = 260;

export const AppLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const { mode, toggleTheme } = useThemeMode();
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileAnchor, setProfileAnchor] = useState<null | HTMLElement>(null);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isSessionsModalOpen, setIsSessionsModalOpen] = useState(false);

  // Group collapses
  const [openTables, setOpenTables] = useState(true);
  const [openImportExport, setOpenImportExport] = useState(true);
  const [openSecurity, setOpenSecurity] = useState(true);
  const [openAudit, setOpenAudit] = useState(true);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const isCurrent = (path: string) => location.pathname === path;

  const roleTitle = user?.is_super_admin
    ? 'Super Admin'
    : user?.roles?.[0]
    ? typeof user.roles[0] === 'object'
      ? (user.roles[0] as any).display_name || 'User'
      : user.roles[0]
    : 'User';

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Brand Header */}
      <Box
        sx={{
          p: 2.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          cursor: 'pointer',
        }}
        onClick={() => navigate('/dashboard')}
      >
        <Avatar
          variant="rounded"
          sx={{
            bgcolor: 'primary.main',
            color: '#fff',
            width: 38,
            height: 38,
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)',
          }}
        >
          <TableView fontSize="medium" />
        </Avatar>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            DataMatrix
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', letterSpacing: 0.5 }}>
            ENTERPRISE PLATFORM
          </Typography>
        </Box>
      </Box>

      <Divider sx={{ mx: 2, mb: 1 }} />

      {/* Navigation Groups */}
      <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 1.5 }}>
        <List component="nav" dense>
          {/* Dashboard */}
          <ListItemButton
            selected={isCurrent('/dashboard')}
            onClick={() => navigate('/dashboard')}
            sx={{ borderRadius: 2, mb: 0.5 }}
          >
            <ListItemIcon sx={{ minWidth: 38, color: isCurrent('/dashboard') ? 'primary.main' : 'inherit' }}>
              <DashboardOutlined fontSize="small" />
            </ListItemIcon>
            <ListItemText primary={<Typography sx={{ fontWeight: 500, fontSize: '0.9rem' }}>Dashboard</Typography>} />
          </ListItemButton>

          {/* Tables Section */}
          <ListItemButton onClick={() => setOpenTables(!openTables)} sx={{ borderRadius: 2, mt: 1 }}>
            <ListItemIcon sx={{ minWidth: 38 }}>
              <TableChartOutlined fontSize="small" />
            </ListItemIcon>
            <ListItemText primary={<Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>Tables</Typography>} />
            {openTables ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
          </ListItemButton>
          <Collapse in={openTables} timeout="auto" unmountOnExit>
            <List component="div" disablePadding dense sx={{ pl: 2 }}>
              <ListItemButton
                selected={isCurrent('/tables') && !location.search.includes('favorites=true')}
                onClick={() => navigate('/tables')}
                sx={{ borderRadius: 1.5, mb: 0.5 }}
              >
                <ListItemText primary="All Tables" />
              </ListItemButton>
              <ListItemButton
                selected={location.search.includes('favorites=true')}
                onClick={() => navigate('/tables?favorites=true')}
                sx={{ borderRadius: 1.5, mb: 0.5 }}
              >
                <ListItemIcon sx={{ minWidth: 30 }}>
                  <StarBorder fontSize="small" />
                </ListItemIcon>
                <ListItemText primary="Favorites" />
              </ListItemButton>
              <ListItemButton
                selected={isCurrent('/tables/create')}
                onClick={() => navigate('/tables/create')}
                sx={{ borderRadius: 1.5, mb: 0.5 }}
              >
                <ListItemIcon sx={{ minWidth: 30 }}>
                  <AddCircleOutlined fontSize="small" />
                </ListItemIcon>
                <ListItemText primary="Create Table" />
              </ListItemButton>
            </List>
          </Collapse>

          {/* Import / Export Section */}
          <ListItemButton onClick={() => setOpenImportExport(!openImportExport)} sx={{ borderRadius: 2, mt: 1 }}>
            <ListItemIcon sx={{ minWidth: 38 }}>
              <FileUploadOutlined fontSize="small" />
            </ListItemIcon>
            <ListItemText primary={<Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>Import / Export</Typography>} />
            {openImportExport ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
          </ListItemButton>
          <Collapse in={openImportExport} timeout="auto" unmountOnExit>
            <List component="div" disablePadding dense sx={{ pl: 2 }}>
              <ListItemButton
                selected={isCurrent('/imports/wizard')}
                onClick={() => navigate('/imports/wizard')}
                sx={{ borderRadius: 1.5, mb: 0.5 }}
              >
                <ListItemText primary="Import Excel" />
              </ListItemButton>
              <ListItemButton
                selected={isCurrent('/imports/history')}
                onClick={() => navigate('/imports/history')}
                sx={{ borderRadius: 1.5, mb: 0.5 }}
              >
                <ListItemText primary="Import History" />
              </ListItemButton>
              <ListItemButton
                selected={isCurrent('/exports/history')}
                onClick={() => navigate('/exports/history')}
                sx={{ borderRadius: 1.5, mb: 0.5 }}
              >
                <ListItemText primary="Export History" />
              </ListItemButton>
            </List>
          </Collapse>

          {/* Security & RBAC */}
          <ListItemButton onClick={() => setOpenSecurity(!openSecurity)} sx={{ borderRadius: 2, mt: 1 }}>
            <ListItemIcon sx={{ minWidth: 38 }}>
              <SecurityOutlined fontSize="small" />
            </ListItemIcon>
            <ListItemText primary={<Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>Security</Typography>} />
            {openSecurity ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
          </ListItemButton>
          <Collapse in={openSecurity} timeout="auto" unmountOnExit>
            <List component="div" disablePadding dense sx={{ pl: 2 }}>
              <ListItemButton
                selected={isCurrent('/security/users')}
                onClick={() => navigate('/security/users')}
                sx={{ borderRadius: 1.5, mb: 0.5 }}
              >
                <ListItemIcon sx={{ minWidth: 30 }}>
                  <PeopleOutlined fontSize="small" />
                </ListItemIcon>
                <ListItemText primary="Users" />
              </ListItemButton>
              <ListItemButton
                selected={isCurrent('/security/roles')}
                onClick={() => navigate('/security/roles')}
                sx={{ borderRadius: 1.5, mb: 0.5 }}
              >
                <ListItemIcon sx={{ minWidth: 30 }}>
                  <AdminPanelSettingsOutlined fontSize="small" />
                </ListItemIcon>
                <ListItemText primary="Roles & RBAC" />
              </ListItemButton>
              <ListItemButton
                selected={isCurrent('/security/sessions')}
                onClick={() => navigate('/security/sessions')}
                sx={{ borderRadius: 1.5, mb: 0.5 }}
              >
                <ListItemIcon sx={{ minWidth: 30 }}>
                  <DevicesOutlined fontSize="small" />
                </ListItemIcon>
                <ListItemText primary="Active Sessions" />
              </ListItemButton>
            </List>
          </Collapse>

          {/* Audit & Governance */}
          <ListItemButton onClick={() => setOpenAudit(!openAudit)} sx={{ borderRadius: 2, mt: 1 }}>
            <ListItemIcon sx={{ minWidth: 38 }}>
              <FactCheckOutlined fontSize="small" />
            </ListItemIcon>
            <ListItemText primary={<Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>Audit</Typography>} />
            {openAudit ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
          </ListItemButton>
          <Collapse in={openAudit} timeout="auto" unmountOnExit>
            <List component="div" disablePadding dense sx={{ pl: 2 }}>
              <ListItemButton
                selected={isCurrent('/audit/logs')}
                onClick={() => navigate('/audit/logs')}
                sx={{ borderRadius: 1.5, mb: 0.5 }}
              >
                <ListItemText primary="Audit Logs" />
              </ListItemButton>
              <ListItemButton
                selected={isCurrent('/audit/sensitive')}
                onClick={() => navigate('/audit/sensitive')}
                sx={{ borderRadius: 1.5, mb: 0.5 }}
              >
                <ListItemIcon sx={{ minWidth: 30 }}>
                  <KeyOutlined fontSize="small" />
                </ListItemIcon>
                <ListItemText primary="Sensitive Access" />
              </ListItemButton>
            </List>
          </Collapse>

          {/* System Settings */}
          {user?.is_super_admin && (
            <ListItemButton
              selected={isCurrent('/settings')}
              onClick={() => navigate('/settings')}
              sx={{ borderRadius: 2, mt: 1 }}
            >
              <ListItemIcon sx={{ minWidth: 38 }}>
                <SettingsOutlined fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={<Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>Administration</Typography>} />
            </ListItemButton>
          )}
        </List>
      </Box>

      {/* Footer Profile Box */}
      <Divider sx={{ mx: 2 }} />
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box
          sx={{ display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer' }}
          onClick={(e) => setProfileAnchor(e.currentTarget)}
        >
          <Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.dark', fontSize: '0.875rem' }}>
            {user?.full_name?.charAt(0) || 'U'}
          </Avatar>
          <Box sx={{ overflow: 'hidden' }}>
            <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
              {user?.full_name}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              {roleTitle}
            </Typography>
          </Box>
        </Box>
        <IconButton size="small" onClick={toggleTheme} color="inherit">
          {mode === 'dark' ? <LightModeOutlined fontSize="small" /> : <DarkModeOutlined fontSize="small" />}
        </IconButton>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Top Navigation Bar */}
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { sm: `${DRAWER_WIDTH}px` },
        }}
      >
        <Toolbar sx={{ minHeight: 64, px: 3, display: 'flex', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <IconButton
              color="inherit"
              edge="start"
              onClick={handleDrawerToggle}
              sx={{ mr: 2, display: { sm: 'none' } }}
            >
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" sx={{ fontWeight: 700, display: { xs: 'none', md: 'block' } }}>
              {location.pathname.startsWith('/tables/') && location.pathname !== '/tables/create'
                ? 'Table Grid View'
                : 'Central Data Hub'}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<FileUploadOutlined />}
              onClick={() => navigate('/imports/wizard')}
              sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
            >
              Import Excel
            </Button>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddCircleOutlined />}
              onClick={() => navigate('/tables/create')}
            >
              Create Table
            </Button>

            <Tooltip title="Account & Profile">
              <IconButton onClick={(e) => setProfileAnchor(e.currentTarget)} size="small">
                <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: '0.85rem' }}>
                  {user?.full_name?.charAt(0) || 'U'}
                </Avatar>
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Profile Menu */}
      <Menu
        anchorEl={profileAnchor}
        open={Boolean(profileAnchor)}
        onClose={() => setProfileAnchor(null)}
        slotProps={{
          paper: {
            sx: { minWidth: 220, borderRadius: 2, mt: 1.5, p: 0.5 },
          },
        }}
      >
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {user?.full_name}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {user?.email}
          </Typography>
          <Box sx={{ mt: 1 }}>
            <Chip
              label={user?.is_super_admin ? 'SUPER ADMIN' : 'AUTHORIZED USER'}
              size="small"
              color={user?.is_super_admin ? 'primary' : 'default'}
            />
          </Box>
        </Box>
        <Divider sx={{ my: 1 }} />
        <MenuItem
          onClick={() => {
            setProfileAnchor(null);
            setIsPasswordModalOpen(true);
          }}
        >
          <ListItemIcon>
            <LockResetOutlined fontSize="small" />
          </ListItemIcon>
          Change Password
        </MenuItem>
        <MenuItem
          onClick={() => {
            setProfileAnchor(null);
            setIsSessionsModalOpen(true);
          }}
        >
          <ListItemIcon>
            <DevicesOutlined fontSize="small" />
          </ListItemIcon>
          Active Sessions
        </MenuItem>
        <Divider sx={{ my: 1 }} />
        <MenuItem
          onClick={async () => {
            setProfileAnchor(null);
            await logout();
            navigate('/login');
          }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon sx={{ color: 'error.main' }}>
            <LogoutOutlined fontSize="small" />
          </ListItemIcon>
          Logout
        </MenuItem>
      </Menu>

      {/* Drawers: Mobile & Desktop */}
      <Box component="nav" sx={{ width: { sm: DRAWER_WIDTH }, flexShrink: { sm: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          slotProps={{
            paper: { sx: { boxSizing: 'border-box', width: DRAWER_WIDTH } },
          }}
          sx={{
            display: { xs: 'block', sm: 'none' },
          }}
        >
          {drawerContent}
        </Drawer>
        <Drawer
          variant="permanent"
          slotProps={{
            paper: { sx: { boxSizing: 'border-box', width: DRAWER_WIDTH } },
          }}
          sx={{
            display: { xs: 'none', sm: 'block' },
          }}
          open
        >
          {drawerContent}
        </Drawer>
      </Box>

      {/* Main Content Area */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 3, md: 4 },
          width: { sm: `calc(100% - ${DRAWER_WIDTH}px)` },
          mt: 8,
          minHeight: 'calc(100vh - 64px)',
        }}
      >
        <Outlet />
      </Box>

      {/* Profile Modals */}
      <ChangePasswordModal open={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} />
      <ActiveSessionsModal open={isSessionsModalOpen} onClose={() => setIsSessionsModalOpen(false)} />
    </Box>
  );
};

export default AppLayout;

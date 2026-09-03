import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { LanOutlined, Security } from '@mui/icons-material';

import { apiClient } from '../../api/client';

export const SystemSettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<any>(null);
  const [ldapTestResult, setLdapTestResult] = useState<any>(null);
  const [testingLdap, setTestingLdap] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await apiClient.get('/settings');
        setSettings(res.data);
      } catch (err) {
        console.error('Failed to load settings', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleTestLdap = async () => {
    setTestingLdap(true);
    try {
      const res = await apiClient.post('/settings/test-ldap', {});
      setLdapTestResult(res.data);
    } catch (err: any) {
      setLdapTestResult({ status: 'ERROR', message: err.response?.data?.detail || 'Connection test failed.' });
    } finally {
      setTestingLdap(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress size={36} />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>
          System Administration & Settings
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          Security parameters, session policies, encryption configurations, and directory integrations.
        </Typography>
      </Box>

      {/* Security Policies */}
      <Card sx={{ mb: 3, borderRadius: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Security color="primary" /> Enterprise Security Configuration
          </Typography>
          <Divider sx={{ mb: 2.5 }} />

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                AUTHENTICATION HASHING
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>
                Argon2id (Time cost: 2, Memory: 64MB)
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                COLUMN ENCRYPTION
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>
                AES-256-GCM Authenticated Cipher
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                SESSION EXPIRATION TIMEOUT
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>
                {settings?.session_timeout_minutes} Minutes
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                ACCOUNT LOCKOUT THRESHOLD
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>
                {settings?.max_failed_login_attempts} Failed Attempts &bull; {settings?.lockout_duration_minutes} min lockout
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Directory & LDAP Integration */}
      <Card sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <LanOutlined color="secondary" /> Active Directory / LDAP Integration
          </Typography>
          <Divider sx={{ mb: 2.5 }} />

          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            DataMatrix includes a pluggable LDAP/AD abstraction ready for on-premise Windows Server Active Directory or OpenLDAP.
          </Typography>

          <Paper variant="outlined" sx={{ p: 2, mb: 2.5, borderRadius: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Directory Status
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {settings?.ldap_enabled ? `Configured on ${settings.ldap_server}:${settings.ldap_port}` : 'Local Authentication (LDAP Disabled)'}
                </Typography>
              </Box>
              <Chip
                label={settings?.ldap_enabled ? 'ENABLED' : 'LOCAL AUTH ONLY'}
                color={settings?.ldap_enabled ? 'success' : 'default'}
                size="small"
              />
            </Box>
          </Paper>

          {ldapTestResult && (
            <Alert severity={ldapTestResult.status === 'CONFIGURED' ? 'success' : 'info'} sx={{ mb: 2 }}>
              {ldapTestResult.message}
            </Alert>
          )}

          <Button
            variant="outlined"
            onClick={handleTestLdap}
            disabled={testingLdap}
          >
            {testingLdap ? <CircularProgress size={20} /> : 'Test Directory Connection'}
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
};

export default SystemSettingsPage;

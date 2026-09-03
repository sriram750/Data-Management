import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  Divider,
  InputAdornment,
  TextField,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  AdminPanelSettings,
  EmailOutlined,
  LockOutlined,
  PersonOutlined,
  Security,
  Shield,
  VerifiedUser,
} from '@mui/icons-material';
import confetti from 'canvas-confetti';

import { apiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { LoginResponse } from '../../types';

export const SetupWizardPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [username, setUsername] = useState('superadmin');
  const [fullName, setFullName] = useState('Super Administrator');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setLoading(true);

    try {
      await apiClient.post('/setup/initialize-admin', {
        username: username.trim(),
        full_name: fullName.trim(),
        email: email.trim(),
        password,
        confirm_password: confirmPassword,
      });

      const loginRes = await apiClient.post<LoginResponse>('/auth/login', {
        username: username.trim(),
        password,
      });

      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });

      setCompleted(true);
      login(loginRes.data);

      setTimeout(() => {
        navigate('/dashboard');
      }, 1500);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to initialize administrator account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 3,
      }}
    >
      <Container maxWidth="sm">
        <Card
          sx={{
            p: 2,
            boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
          }}
        >
          <CardContent>
            <Box sx={{ textAlign: 'center', mb: 3 }}>
              <Box
                sx={{
                  display: 'inline-flex',
                  p: 2,
                  borderRadius: 3,
                  bgcolor: 'primary.main',
                  color: '#fff',
                  boxShadow: '0 8px 24px rgba(99, 102, 241, 0.4)',
                  mb: 2,
                }}
              >
                <Shield sx={{ fontSize: 40 }} />
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>
                Initial System Provisioning
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 450, mx: 'auto' }}>
                Welcome to DataMatrix Enterprise. No default credentials exist. Create your initial Super
                Administrator account to initialize security roles and lock the setup wizard.
              </Typography>
            </Box>

            {error && (
              <Alert severity="error" sx={{ mb: 3 }}>
                {error}
              </Alert>
            )}

            {completed && (
              <Alert severity="success" icon={<VerifiedUser />} sx={{ mb: 3 }}>
                Administrator account created successfully! Redirecting to dashboard...
              </Alert>
            )}

            <form onSubmit={handleSubmit}>
              <Grid container spacing={2.5}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Admin Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <PersonOutlined fontSize="small" />
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Full Name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <AdminPanelSettings fontSize="small" />
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                </Grid>
                <Grid size={12}>
                  <TextField
                    fullWidth
                    label="Email Address"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="admin@organization.com"
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <EmailOutlined fontSize="small" />
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Master Password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    helperText="Minimum 8 characters"
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <LockOutlined fontSize="small" />
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Confirm Password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <Security fontSize="small" />
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                </Grid>
              </Grid>

              <Box sx={{ mt: 4 }}>
                <Button
                  fullWidth
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={loading || completed}
                  sx={{ py: 1.5, fontSize: '1rem', fontWeight: 700 }}
                >
                  {loading ? <CircularProgress size={24} color="inherit" /> : 'Initialize & Provision Platform'}
                </Button>
              </Box>
            </form>

            <Divider sx={{ my: 3 }} />
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', textAlign: 'center' }}>
              Protected by Argon2id Password Hashing & AES-256-GCM Encryption
            </Typography>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
};

export default SetupWizardPage;

import React, { useEffect, useState } from 'react';
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
  IconButton,
  InputAdornment,
  TextField,
  Typography,
} from '@mui/material';
import {
  LockOutlined,
  PersonOutlined,
  TableView,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';

import { apiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { LoginResponse } from '../../types';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, checkSetupStatus } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const verifySetup = async () => {
      const isReq = await checkSetupStatus();
      if (isReq) {
        navigate('/setup');
      }
    };
    verifySetup();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await apiClient.post<LoginResponse>('/auth/login', {
        username: username.trim(),
        password,
      });

      login(res.data);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Invalid username or password.');
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
      <Container maxWidth="xs">
        <Card
          sx={{
            p: 2,
            boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <CardContent>
            <Box sx={{ textAlign: 'center', mb: 3 }}>
              <Box
                sx={{
                  display: 'inline-flex',
                  p: 1.5,
                  borderRadius: 3,
                  bgcolor: 'primary.main',
                  color: '#fff',
                  boxShadow: '0 8px 24px rgba(99, 102, 241, 0.4)',
                  mb: 1.5,
                }}
              >
                <TableView sx={{ fontSize: 36 }} />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>
                DataMatrix
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', letterSpacing: 1 }}>
                ENTERPRISE DATA PLATFORM
              </Typography>
            </Box>

            {error && (
              <Alert severity="error" sx={{ mb: 2.5 }}>
                {error}
              </Alert>
            )}

            <form onSubmit={handleSubmit}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  fullWidth
                  label="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoFocus
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

                <TextField
                  fullWidth
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <LockOutlined fontSize="small" />
                        </InputAdornment>
                      ),
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton size="small" onClick={() => setShowPassword(!showPassword)}>
                            {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  }}
                />

                <Button
                  fullWidth
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={loading}
                  sx={{ mt: 1, py: 1.2, fontWeight: 700 }}
                >
                  {loading ? <CircularProgress size={24} color="inherit" /> : 'Sign In'}
                </Button>
              </Box>
            </form>

            <Divider sx={{ my: 3 }} />
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', textAlign: 'center' }}>
              Self-Hosted &bull; Role Based Access Control &bull; Full Audit Trail
            </Typography>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
};

export default LoginPage;

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Slider,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add,
  Brush,
  CheckCircleOutlined,
  Clear,
  Create,
  DeleteForever,
  EditOutlined,
  FormatColorFill,
  Highlight,
  NavigateBefore,
  NavigateNext,
  Remove,
  RotateRight,
  TextFields,
  ZoomIn,
  ZoomOut,
} from '@mui/icons-material';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument, rgb, degrees } from 'pdf-lib';
import { apiClient } from '../../api/client';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface Annotation {
  id: string;
  type: 'text' | 'highlight' | 'stamp' | 'drawing';
  pageIndex: number;
  x: number; // percentage of canvas width (0 to 1)
  y: number; // percentage of canvas height (0 to 1)
  text?: string;
  color: string;
  fontSize?: number;
  width?: number; // percentage
  height?: number; // percentage
  points?: Array<{ x: number; y: number }>;
}

interface PdfStudioProps {
  fileUrl: string;
  isEditing: boolean;
  onSave?: (newBytes: Uint8Array, summary: string) => void;
  saving?: boolean;
}

export const PdfStudio: React.FC<PdfStudioProps> = ({ fileUrl, isEditing, onSave, saving }) => {
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.2);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Raw original PDF buffer
  const [rawArrayBuffer, setRawArrayBuffer] = useState<ArrayBuffer | null>(null);

  // Editor states
  const [activeTool, setActiveTool] = useState<'select' | 'text' | 'highlight' | 'drawing' | 'stamp'>('select');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [currentColor, setCurrentColor] = useState<string>('#EF4444');
  const [fontSize, setFontSize] = useState<number>(14);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [currentPath, setCurrentPath] = useState<Array<{ x: number; y: number }>>([]);
  const [stampText, setStampText] = useState<string>('APPROVED');
  const [pageRotations, setPageRotations] = useState<{ [page: number]: number }>({});
  const [deletedPages, setDeletedPages] = useState<Set<number>>(new Set());

  // Signature modal
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [signatureText, setSignatureText] = useState('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const canvasCallbackRef = useCallback((node: HTMLCanvasElement | null) => {
    canvasRef.current = node;
    setCanvasEl(node);
  }, []);

  // Load PDF from URL
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setError(null);
    setPdfDoc(null);
    setRawArrayBuffer(null);

    const loadPdf = async () => {
      try {
        const response = await apiClient.get<ArrayBuffer>(fileUrl, {
          responseType: 'arraybuffer',
        });
        const buffer = response.data;
        if (isCancelled) return;
        setRawArrayBuffer(buffer.slice(0));

        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
        const doc = await loadingTask.promise;
        if (isCancelled) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setCurrentPage(1);
      } catch (err: any) {
        if (!isCancelled) {
          setError(err.response?.data?.detail || err.message || 'Failed to load PDF document.');
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    loadPdf();
    return () => {
      isCancelled = true;
    };
  }, [fileUrl]);

  // Render current page
  useEffect(() => {
    if (!pdfDoc || !canvasEl || deletedPages.has(currentPage)) return;

    let isRenderCancelled = false;
    let renderTask: any = null;

    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(currentPage);
        if (isRenderCancelled) return;

        const rotationOffset = pageRotations[currentPage] || 0;
        const viewport = page.getViewport({ scale, rotation: page.rotate + rotationOffset });
        const canvas = canvasEl;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        renderTask = page.render(renderContext);
        await renderTask.promise;
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('PDF Page render error:', err);
        }
      }
    };

    renderPage();

    return () => {
      isRenderCancelled = true;
      if (renderTask) renderTask.cancel();
    };
  }, [pdfDoc, currentPage, scale, pageRotations, deletedPages, canvasEl]);

  // Handle overlay clicks for annotations
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditing || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    if (activeTool === 'text') {
      const input = prompt('Enter text for annotation:');
      if (input && input.trim()) {
        const newAnn: Annotation = {
          id: Math.random().toString(36).substring(7),
          type: 'text',
          pageIndex: currentPage,
          x,
          y,
          text: input.trim(),
          color: currentColor,
          fontSize: fontSize,
        };
        setAnnotations((prev) => [...prev, newAnn]);
      }
    } else if (activeTool === 'stamp') {
      const newAnn: Annotation = {
        id: Math.random().toString(36).substring(7),
        type: 'stamp',
        pageIndex: currentPage,
        x,
        y,
        text: stampText,
        color: currentColor,
        fontSize: 16,
      };
      setAnnotations((prev) => [...prev, newAnn]);
    } else if (activeTool === 'highlight') {
      const newAnn: Annotation = {
        id: Math.random().toString(36).substring(7),
        type: 'highlight',
        pageIndex: currentPage,
        x: Math.max(0, x - 0.1),
        y: Math.max(0, y - 0.015),
        width: 0.2,
        height: 0.03,
        color: currentColor === '#EF4444' ? '#FBBF24' : currentColor,
      };
      setAnnotations((prev) => [...prev, newAnn]);
    }
  };

  // Drawing tool mouse handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditing || activeTool !== 'drawing' || !overlayRef.current) return;
    setIsDrawing(true);
    const rect = overlayRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setCurrentPath([{ x, y }]);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setCurrentPath((prev) => [...prev, { x, y }]);
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentPath.length > 1) {
      const newAnn: Annotation = {
        id: Math.random().toString(36).substring(7),
        type: 'drawing',
        pageIndex: currentPage,
        x: 0,
        y: 0,
        points: currentPath,
        color: currentColor,
      };
      setAnnotations((prev) => [...prev, newAnn]);
    }
    setCurrentPath([]);
  };

  // Add digital signature stamp
  const handleAddSignature = () => {
    if (!signatureText.trim()) return;
    const newAnn: Annotation = {
      id: Math.random().toString(36).substring(7),
      type: 'text',
      pageIndex: currentPage,
      x: 0.5,
      y: 0.85,
      text: `✍ Signed: ${signatureText.trim()} (${new Date().toLocaleDateString()})`,
      color: '#1E3A8A',
      fontSize: 14,
    };
    setAnnotations((prev) => [...prev, newAnn]);
    setIsSignatureModalOpen(false);
    setSignatureText('');
  };

  // Page rotation
  const handleRotatePage = () => {
    setPageRotations((prev) => ({
      ...prev,
      [currentPage]: ((prev[currentPage] || 0) + 90) % 360,
    }));
  };

  // Page deletion
  const handleDeletePage = () => {
    if (numPages - deletedPages.size <= 1) {
      alert('Cannot delete the only remaining page.');
      return;
    }
    if (window.confirm(`Are you sure you want to delete Page ${currentPage}?`)) {
      setDeletedPages((prev) => new Set(prev).add(currentPage));
      // Navigate to next valid page
      for (let i = 1; i <= numPages; i++) {
        if (!deletedPages.has(i) && i !== currentPage) {
          setCurrentPage(i);
          break;
        }
      }
    }
  };

  // Save modified PDF using pdf-lib
  const handleExportOrSave = async () => {
    if (!rawArrayBuffer || !onSave) return;
    try {
      const pdfDocLib = await PDFDocument.load(rawArrayBuffer);
      const helveticaFont = await pdfDocLib.embedFont('Helvetica-Bold' as any);

      // Handle page rotations & deletions
      const totalPages = pdfDocLib.getPageCount();

      // Apply annotations
      for (const ann of annotations) {
        const pageIdx = ann.pageIndex - 1;
        if (pageIdx < 0 || pageIdx >= totalPages) continue;
        const page = pdfDocLib.getPage(pageIdx);
        const { width: pWidth, height: pHeight } = page.getSize();

        // Convert percentage coordinates to PDF points (origin is bottom-left in PDF)
        const pdfX = ann.x * pWidth;
        const pdfY = (1 - ann.y) * pHeight;

        if (ann.type === 'text') {
          page.drawText(ann.text || '', {
            x: pdfX,
            y: pdfY,
            size: ann.fontSize || 12,
            font: helveticaFont,
            color: rgb(0.1, 0.1, 0.5),
          });
        } else if (ann.type === 'stamp') {
          const stampLabel = `[ ${ann.text} ]`;
          page.drawRectangle({
            x: pdfX - 4,
            y: pdfY - 4,
            width: (ann.text?.length || 8) * 10 + 12,
            height: 24,
            color: rgb(0.9, 0.95, 1),
            borderColor: rgb(0.1, 0.3, 0.8),
            borderWidth: 1.5,
          });
          page.drawText(stampLabel, {
            x: pdfX,
            y: pdfY,
            size: 13,
            font: helveticaFont,
            color: rgb(0.1, 0.3, 0.8),
          });
        } else if (ann.type === 'highlight') {
          page.drawRectangle({
            x: (ann.x || 0) * pWidth,
            y: (1 - (ann.y || 0) - (ann.height || 0.03)) * pHeight,
            width: (ann.width || 0.2) * pWidth,
            height: (ann.height || 0.03) * pHeight,
            color: rgb(1, 0.95, 0.4),
            opacity: 0.45,
          });
        }
      }

      // Apply rotations
      Object.entries(pageRotations).forEach(([pNum, rotAngle]) => {
        const pIdx = Number(pNum) - 1;
        if (pIdx >= 0 && pIdx < totalPages) {
          const p = pdfDocLib.getPage(pIdx);
          p.setRotation(degrees(p.getRotation().angle + rotAngle));
        }
      });

      // Remove deleted pages in descending index order
      const sortedDeleted = Array.from(deletedPages)
        .map((p) => p - 1)
        .sort((a, b) => b - a);
      for (const pIdx of sortedDeleted) {
        if (pIdx >= 0 && pIdx < pdfDocLib.getPageCount()) {
          pdfDocLib.removePage(pIdx);
        }
      }

      const savedBytes = await pdfDocLib.save();
      const changeSummary = `Applied ${annotations.length} annotations, rotations, and page edits`;
      onSave(savedBytes, changeSummary);
    } catch (err: any) {
      alert(`Failed to save PDF: ${err.message}`);
    }
  };

  const currentPageAnnotations = annotations.filter((a) => a.pageIndex === currentPage);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: '#0F172A', color: '#F8FAFC' }}>
      {/* PDF Action Toolbar */}
      <Paper
        elevation={2}
        sx={{
          p: 1.2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1.5,
          bgcolor: '#1E293B',
          borderRadius: 0,
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        {/* Navigation & Zoom */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip title="Previous Page">
            <span>
              <IconButton
                size="small"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                sx={{ color: '#94A3B8' }}
              >
                <NavigateBefore />
              </IconButton>
            </span>
          </Tooltip>

          <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 90, textAlign: 'center', color: '#E2E8F0' }}>
            Page {currentPage} of {numPages}
          </Typography>

          <Tooltip title="Next Page">
            <span>
              <IconButton
                size="small"
                disabled={currentPage >= numPages}
                onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
                sx={{ color: '#94A3B8' }}
              >
                <NavigateNext />
              </IconButton>
            </span>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.15)', mx: 0.5 }} />

          <Tooltip title="Zoom Out">
            <span>
              <IconButton
                size="small"
                disabled={scale <= 0.6}
                onClick={() => setScale((s) => Math.max(0.6, s - 0.2))}
                sx={{ color: '#94A3B8' }}
              >
                <ZoomOut fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

          <Typography variant="caption" sx={{ fontWeight: 600, color: '#CBD5E1', minWidth: 42, textAlign: 'center' }}>
            {Math.round(scale * 100)}%
          </Typography>

          <Tooltip title="Zoom In">
            <span>
              <IconButton
                size="small"
                disabled={scale >= 2.5}
                onClick={() => setScale((s) => Math.min(2.5, s + 0.2))}
                sx={{ color: '#94A3B8' }}
              >
                <ZoomIn fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>

        {/* Editor Tools (Active only in Edit Mode) */}
        {isEditing && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <ButtonGroup size="small" variant="outlined" sx={{ bgcolor: 'rgba(255,255,255,0.04)' }}>
              <Tooltip title="Insert Text Box">
                <Button
                  variant={activeTool === 'text' ? 'contained' : 'outlined'}
                  onClick={() => setActiveTool('text')}
                  startIcon={<TextFields fontSize="small" />}
                >
                  Text
                </Button>
              </Tooltip>

              <Tooltip title="Highlight Area">
                <Button
                  variant={activeTool === 'highlight' ? 'contained' : 'outlined'}
                  onClick={() => setActiveTool('highlight')}
                  startIcon={<Highlight fontSize="small" />}
                >
                  Highlight
                </Button>
              </Tooltip>

              <Tooltip title="Freehand Drawing">
                <Button
                  variant={activeTool === 'drawing' ? 'contained' : 'outlined'}
                  onClick={() => setActiveTool('drawing')}
                  startIcon={<Brush fontSize="small" />}
                >
                  Draw
                </Button>
              </Tooltip>

              <Tooltip title="Add Approval Stamp">
                <Button
                  variant={activeTool === 'stamp' ? 'contained' : 'outlined'}
                  onClick={() => setActiveTool('stamp')}
                  startIcon={<CheckCircleOutlined fontSize="small" />}
                >
                  Stamp
                </Button>
              </Tooltip>
            </ButtonGroup>

            <Tooltip title="Add Signature">
              <Button
                size="small"
                variant="outlined"
                color="secondary"
                startIcon={<Create fontSize="small" />}
                onClick={() => setIsSignatureModalOpen(true)}
              >
                Sign
              </Button>
            </Tooltip>

            {/* Color picker */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 1 }}>
              {['#EF4444', '#10B981', '#3B82F6', '#F59E0B', '#1E293B'].map((c) => (
                <Box
                  key={c}
                  onClick={() => setCurrentColor(c)}
                  sx={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    bgcolor: c,
                    cursor: 'pointer',
                    border: currentColor === c ? '2px solid #FFF' : '1px solid rgba(255,255,255,0.3)',
                    transform: currentColor === c ? 'scale(1.2)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                />
              ))}
            </Box>

            <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.15)', mx: 0.5 }} />

            <Tooltip title="Rotate Current Page 90°">
              <IconButton size="small" onClick={handleRotatePage} sx={{ color: '#94A3B8' }}>
                <RotateRight fontSize="small" />
              </IconButton>
            </Tooltip>

            <Tooltip title="Delete Current Page">
              <IconButton size="small" color="error" onClick={handleDeletePage}>
                <DeleteForever fontSize="small" />
              </IconButton>
            </Tooltip>

            {annotations.length > 0 && (
              <Tooltip title="Clear Annotations on This Page">
                <IconButton
                  size="small"
                  onClick={() => setAnnotations((prev) => prev.filter((a) => a.pageIndex !== currentPage))}
                  sx={{ color: '#F87171' }}
                >
                  <Clear fontSize="small" />
                </IconButton>
              </Tooltip>
            )}

            {onSave && (
              <Button
                size="small"
                variant="contained"
                color="primary"
                onClick={handleExportOrSave}
                disabled={saving}
                sx={{ ml: 1, fontWeight: 600, px: 2 }}
              >
                {saving ? 'Saving...' : 'Apply & Save'}
              </Button>
            )}
          </Box>
        )}
      </Paper>

      {/* Main Canvas Viewport */}
      <Box
        ref={containerRef}
        sx={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          p: 3,
          bgcolor: '#0B1120',
          position: 'relative',
        }}
      >
        {loading && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, mt: 10 }}>
            <CircularProgress size={45} color="primary" />
            <Typography variant="body2" sx={{ color: '#94A3B8' }}>
              Rendering high-fidelity PDF pages...
            </Typography>
          </Box>
        )}

        {error && (
          <Box sx={{ textAlign: 'center', mt: 10, color: '#F87171' }}>
            <Typography variant="h6">Failed to load PDF</Typography>
            <Typography variant="body2">{error}</Typography>
          </Box>
        )}

        {!loading && !error && deletedPages.has(currentPage) && (
          <Box sx={{ textAlign: 'center', mt: 10, color: '#94A3B8' }}>
            <Typography variant="body1">Page {currentPage} has been marked for deletion.</Typography>
          </Box>
        )}

        {!loading && !error && !deletedPages.has(currentPage) && (
          <Box
            sx={{
              position: 'relative',
              boxShadow: '0 20px 40px -15px rgba(0,0,0,0.7)',
              borderRadius: 1,
              overflow: 'hidden',
              bgcolor: '#FFFFFF',
              userSelect: activeTool === 'select' ? 'text' : 'none',
            }}
          >
            {/* Native PDF.js rendered Canvas */}
            <canvas ref={canvasCallbackRef} style={{ display: 'block' }} />

            {/* Interactive Annotation & Drawing Overlay Layer */}
            <Box
              ref={overlayRef}
              onClick={handleOverlayClick}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: isEditing && activeTool !== 'select' ? 'auto' : 'none',
                cursor:
                  activeTool === 'text'
                    ? 'text'
                    : activeTool === 'drawing'
                    ? 'crosshair'
                    : activeTool === 'stamp'
                    ? 'copy'
                    : 'default',
              }}
            >
              {/* Render current annotations on this page */}
              {currentPageAnnotations.map((ann) => {
                if (ann.type === 'text') {
                  return (
                    <Box
                      key={ann.id}
                      sx={{
                        position: 'absolute',
                        left: `${ann.x * 100}%`,
                        top: `${ann.y * 100}%`,
                        color: ann.color,
                        fontSize: ann.fontSize || 14,
                        fontWeight: 600,
                        fontFamily: 'Inter, sans-serif',
                        bgcolor: 'rgba(255,255,255,0.85)',
                        px: 0.8,
                        py: 0.2,
                        borderRadius: 1,
                        border: '1px solid rgba(0,0,0,0.15)',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                        transform: 'translate(-5%, -50%)',
                      }}
                    >
                      {ann.text}
                    </Box>
                  );
                }

                if (ann.type === 'stamp') {
                  return (
                    <Box
                      key={ann.id}
                      sx={{
                        position: 'absolute',
                        left: `${ann.x * 100}%`,
                        top: `${ann.y * 100}%`,
                        color: '#1E40AF',
                        bgcolor: '#DBEAFE',
                        border: '2px solid #2563EB',
                        borderRadius: 1.5,
                        px: 1.5,
                        py: 0.5,
                        fontWeight: 800,
                        letterSpacing: 1.5,
                        fontSize: '0.85rem',
                        transform: 'translate(-50%, -50%) rotate(-5deg)',
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                      }}
                    >
                      ✓ {ann.text}
                    </Box>
                  );
                }

                if (ann.type === 'highlight') {
                  return (
                    <Box
                      key={ann.id}
                      sx={{
                        position: 'absolute',
                        left: `${(ann.x || 0) * 100}%`,
                        top: `${(ann.y || 0) * 100}%`,
                        width: `${(ann.width || 0.2) * 100}%`,
                        height: `${(ann.height || 0.03) * 100}%`,
                        bgcolor: 'rgba(250, 204, 21, 0.45)',
                        borderRadius: 0.5,
                      }}
                    />
                  );
                }

                if (ann.type === 'drawing' && ann.points && ann.points.length > 1) {
                  return (
                    <svg
                      key={ann.id}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        pointerEvents: 'none',
                      }}
                    >
                      <polyline
                        points={ann.points.map((p) => `${p.x * 100}%,${p.y * 100}%`).join(' ')}
                        fill="none"
                        stroke={ann.color}
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  );
                }

                return null;
              })}

              {/* In-progress freehand stroke */}
              {isDrawing && currentPath.length > 1 && (
                <svg
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                  }}
                >
                  <polyline
                    points={currentPath.map((p) => `${p.x * 100}%,${p.y * 100}%`).join(' ')}
                    fill="none"
                    stroke={currentColor}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </Box>
          </Box>
        )}
      </Box>

      {/* Signature Dialog */}
      <Dialog open={isSignatureModalOpen} onClose={() => setIsSignatureModalOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Add Digital Signature</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Type your full legal name or designation to stamp a digital signature badge onto this PDF.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="Full Name / Signer"
            value={signatureText}
            onChange={(e) => setSignatureText(e.target.value)}
            placeholder="e.g. John Doe, CFO"
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setIsSignatureModalOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAddSignature} disabled={!signatureText.trim()}>
            Stamp Signature
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

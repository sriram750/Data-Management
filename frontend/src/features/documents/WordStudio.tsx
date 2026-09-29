import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  CircularProgress,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Code,
  Download,
  FormatAlignCenter,
  FormatAlignJustify,
  FormatAlignLeft,
  FormatAlignRight,
  FormatBold,
  FormatColorFill,
  FormatColorText,
  FormatItalic,
  FormatListBulleted,
  FormatListNumbered,
  FormatQuote,
  FormatStrikethrough,
  FormatUnderlined,
  GridOn,
  HorizontalRule,
  Print,
  Redo,
  Save,
  TableRows,
  Undo,
  ViewColumn,
} from '@mui/icons-material';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import { renderAsync } from 'docx-preview';
import mammoth from 'mammoth';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table as DocxTable,
  TableRow as DocxTableRow,
  TableCell as DocxTableCell,
  WidthType,
  ShadingType,
  BorderStyle,
} from 'docx';
import { apiClient } from '../../api/client';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function extractDocText(buffer: ArrayBuffer): string[] {
  const bytes = new Uint8Array(buffer);
  const metadataWords = new Set([
    'worddocument',
    'root entry',
    'compobj',
    'summaryinformation',
    'documentsummaryinformation',
    'data',
    'table',
    '1table',
    '0table',
    'microsoft word',
    'normal.dotm',
    'normal.dot',
  ]);

  // 1. Try UTF-16LE scanning
  const utf16Chunks: string[] = [];
  let cur16 = '';
  for (let i = 0; i < bytes.length - 1; i += 2) {
    const code = bytes[i] | (bytes[i + 1] << 8);
    if (
      (code >= 32 && code <= 126) ||
      code === 10 ||
      code === 13 ||
      code === 9 ||
      (code >= 160 && code <= 65533)
    ) {
      cur16 += String.fromCharCode(code);
    } else {
      if (cur16.trim().length >= 3) {
        const trimmed = cur16.trim();
        if (!metadataWords.has(trimmed.toLowerCase())) {
          utf16Chunks.push(trimmed);
        }
      }
      cur16 = '';
    }
  }
  if (cur16.trim().length >= 3) {
    const trimmed = cur16.trim();
    if (!metadataWords.has(trimmed.toLowerCase())) utf16Chunks.push(trimmed);
  }

  // 2. Try ASCII / 8-bit scanning
  const asciiChunks: string[] = [];
  let cur8 = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if ((b >= 32 && b <= 126) || b === 10 || b === 13 || b === 9) {
      cur8 += String.fromCharCode(b);
    } else {
      if (cur8.trim().length >= 3) {
        const trimmed = cur8.trim();
        if (!metadataWords.has(trimmed.toLowerCase())) {
          asciiChunks.push(trimmed);
        }
      }
      cur8 = '';
    }
  }
  if (cur8.trim().length >= 3) {
    const trimmed = cur8.trim();
    if (!metadataWords.has(trimmed.toLowerCase())) asciiChunks.push(trimmed);
  }

  const total16 = utf16Chunks.join(' ').length;
  const total8 = asciiChunks.join(' ').length;
  return total16 >= total8 ? utf16Chunks : asciiChunks;
}

interface WordStudioProps {
  fileUrl: string;
  isEditing: boolean;
  onSave?: (newBytes: Uint8Array, summary: string) => void;
  saving?: boolean;
}

export const WordStudio: React.FC<WordStudioProps> = ({ fileUrl, isEditing, onSave, saving }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [rawBuffer, setRawBuffer] = useState<ArrayBuffer | null>(null);
  const [ribbonTab, setRibbonTab] = useState<number>(0);
  const [isLegacyDoc, setIsLegacyDoc] = useState<boolean>(false);
  const [legacyHtml, setLegacyHtml] = useState<string>('');

  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const [previewContainerEl, setPreviewContainerEl] = useState<HTMLDivElement | null>(null);

  const previewContainerCallbackRef = useCallback((node: HTMLDivElement | null) => {
    previewContainerRef.current = node;
    setPreviewContainerEl(node);
  }, []);

  // Color Menu Anchors
  const [textColorAnchor, setTextColorAnchor] = useState<null | HTMLElement>(null);
  const [highlightColorAnchor, setHighlightColorAnchor] = useState<null | HTMLElement>(null);
  const [tableMenuAnchor, setTableMenuAnchor] = useState<null | HTMLElement>(null);

  // Initialize Tiptap Editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
    ],
    content: '<p>Loading Word document content...</p>',
  });

  // Load and Parse Document
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setError(null);
    setRawBuffer(null);

    const loadDocx = async () => {
      try {
        const response = await apiClient.get<ArrayBuffer>(fileUrl, {
          responseType: 'arraybuffer',
        });
        const buffer = response.data;
        if (isCancelled) return;
        setRawBuffer(buffer.slice(0));

        // Parse HTML via mammoth for Tiptap editor or fallback for legacy .doc
        try {
          const mammothResult = await mammoth.convertToHtml({ arrayBuffer: buffer.slice(0) });
          if (editor && !isCancelled && mammothResult.value) {
            editor.commands.setContent(mammothResult.value);
          }
        } catch (mammothErr: any) {
          console.warn('Mammoth parse failed, trying legacy document text extraction:', mammothErr);
          const paragraphs = extractDocText(buffer.slice(0));
          if (paragraphs.length > 0) {
            const html = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
            setIsLegacyDoc(true);
            setLegacyHtml(html);
            if (editor && !isCancelled) {
              editor.commands.setContent(html);
            }
          } else {
            throw mammothErr;
          }
        }
      } catch (err: any) {
        if (!isCancelled) {
          setError(err.message || 'Failed to parse Word document.');
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    loadDocx();
    return () => {
      isCancelled = true;
    };
  }, [fileUrl, editor]);

  // Render docx-preview immediately when container is mounted and rawBuffer is ready
  useEffect(() => {
    let isCancelled = false;
    if (!isEditing && rawBuffer && previewContainerEl) {
      previewContainerEl.innerHTML = '';
      if (isLegacyDoc && legacyHtml) {
        previewContainerEl.innerHTML = legacyHtml;
        return;
      }
      renderAsync(rawBuffer, previewContainerEl, undefined, {
        inWrapper: true,
        breakPages: true,
        ignoreWidth: false,
      }).catch((err) => {
        if (!isCancelled) {
          console.warn('Word preview render error, trying legacy fallback:', err);
          if (legacyHtml) {
            previewContainerEl.innerHTML = legacyHtml;
          } else {
            const paragraphs = extractDocText(rawBuffer.slice(0));
            if (paragraphs.length > 0) {
              const html = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
              setIsLegacyDoc(true);
              setLegacyHtml(html);
              previewContainerEl.innerHTML = html;
            }
          }
        }
      });
    }
    return () => {
      isCancelled = true;
    };
  }, [isEditing, rawBuffer, previewContainerEl, isLegacyDoc, legacyHtml]);

  // Save changes by serializing editor content to valid .docx binary with high-fidelity formatting
  const handleSaveDocx = async () => {
    if (!editor || !onSave) return;
    try {
      const json = editor.getJSON();
      const docChildren: (Paragraph | DocxTable)[] = [];

      // Helper to build TextRuns with font and styling
      const buildTextRuns = (content: any[], defaultSize = 22, defaultBold = false) => {
        return (content || []).map((tNode: any) => {
          const isBold = defaultBold || Boolean(tNode.marks?.some((m: any) => m.type === 'bold'));
          const isItalic = Boolean(tNode.marks?.some((m: any) => m.type === 'italic'));
          const isUnderline = Boolean(tNode.marks?.some((m: any) => m.type === 'underline'));
          const isStrike = Boolean(tNode.marks?.some((m: any) => m.type === 'strike'));
          const colorMark = tNode.marks?.find((m: any) => m.type === 'textStyle')?.attrs?.color;
          const hexColor = colorMark ? colorMark.replace('#', '') : undefined;

          return new TextRun({
            text: tNode.text || '',
            bold: isBold,
            italics: isItalic,
            underline: isUnderline ? {} : undefined,
            strike: isStrike,
            color: hexColor,
            font: 'Calibri',
            size: defaultSize,
          });
        });
      };

      // Convert Tiptap JSON nodes to docx Paragraphs & Tables
      if (json.content) {
        for (const node of json.content) {
          if (node.type === 'heading') {
            const level =
              node.attrs?.level === 1
                ? HeadingLevel.HEADING_1
                : node.attrs?.level === 2
                ? HeadingLevel.HEADING_2
                : HeadingLevel.HEADING_3;

            const size = node.attrs?.level === 1 ? 32 : node.attrs?.level === 2 ? 28 : 24;
            const runs = buildTextRuns(node.content || [], size, true);

            docChildren.push(
              new Paragraph({
                heading: level,
                children: runs,
                spacing: { before: 200, after: 100 },
                alignment:
                  node.attrs?.textAlign === 'center'
                    ? AlignmentType.CENTER
                    : node.attrs?.textAlign === 'right'
                    ? AlignmentType.RIGHT
                    : AlignmentType.LEFT,
              })
            );
          } else if (node.type === 'paragraph') {
            const runs = buildTextRuns(node.content || [], 22);
            docChildren.push(
              new Paragraph({
                children: runs.length > 0 ? runs : [new TextRun({ text: '', font: 'Calibri' })],
                spacing: { after: 120, line: 276 },
                alignment:
                  node.attrs?.textAlign === 'center'
                    ? AlignmentType.CENTER
                    : node.attrs?.textAlign === 'right'
                    ? AlignmentType.RIGHT
                    : AlignmentType.LEFT,
              })
            );
          } else if (node.type === 'bulletList' || node.type === 'orderedList') {
            for (const item of (node.content || []) as any[]) {
              const itemRuns = buildTextRuns(item.content?.[0]?.content, 22);
              docChildren.push(
                new Paragraph({
                  bullet: { level: 0 },
                  children: itemRuns,
                  spacing: { after: 60, line: 240 },
                })
              );
            }
          } else if (node.type === 'table') {
            const docxRows: DocxTableRow[] = [];
            for (const rowNode of (node.content || []) as any[]) {
              if (rowNode.type !== 'tableRow') continue;
              const isHeaderRow = rowNode.content?.some((c: any) => c.type === 'tableHeader');
              const colCount = Math.max(1, rowNode.content?.length || 1);
              const docxCells: DocxTableCell[] = [];

              for (const cellNode of (rowNode.content || []) as any[]) {
                const isHeaderCell = cellNode.type === 'tableHeader';
                const cellParagraphs: Paragraph[] = [];

                for (const innerNode of (cellNode.content || []) as any[]) {
                  if (innerNode.type === 'paragraph') {
                    const runs = buildTextRuns(innerNode.content, isHeaderCell ? 22 : 20, isHeaderCell);
                    cellParagraphs.push(
                      new Paragraph({
                        children: runs.length > 0 ? runs : [new TextRun({ text: '', font: 'Calibri' })],
                        alignment:
                          innerNode.attrs?.textAlign === 'center'
                            ? AlignmentType.CENTER
                            : innerNode.attrs?.textAlign === 'right'
                            ? AlignmentType.RIGHT
                            : AlignmentType.LEFT,
                        spacing: { before: 40, after: 40, line: 240 },
                      })
                    );
                  }
                }

                if (cellParagraphs.length === 0) {
                  cellParagraphs.push(new Paragraph({ children: [new TextRun({ text: '', font: 'Calibri' })] }));
                }

                docxCells.push(
                  new DocxTableCell({
                    children: cellParagraphs,
                    width: { size: Math.floor(100 / colCount), type: WidthType.PERCENTAGE },
                    shading: isHeaderCell ? { fill: 'F1F5F9', type: ShadingType.CLEAR } : undefined,
                    margins: { top: 120, bottom: 120, left: 160, right: 160 },
                  })
                );
              }

              docxRows.push(
                new DocxTableRow({
                  tableHeader: isHeaderRow,
                  children: docxCells,
                })
              );
            }

            if (docxRows.length > 0) {
              docChildren.push(
                new DocxTable({
                  rows: docxRows,
                  width: { size: 100, type: WidthType.PERCENTAGE },
                })
              );
              // Add a spacer paragraph after table
              docChildren.push(new Paragraph({ children: [], spacing: { after: 120 } }));
            }
          }
        }
      }

      // If no children were formed, fallback paragraph
      if (docChildren.length === 0) {
        docChildren.push(new Paragraph({ children: [new TextRun({ text: editor.getText(), font: 'Calibri', size: 22 })] }));
      }

      const docxDocument = new Document({
        styles: {
          default: {
            document: {
              run: {
                font: 'Calibri',
                size: 22,
                color: '1E293B',
              },
              paragraph: {
                spacing: {
                  line: 276,
                  after: 120,
                },
              },
            },
          },
        },
        sections: [
          {
            properties: {
              page: {
                margin: {
                  top: 1440,
                  bottom: 1440,
                  left: 1440,
                  right: 1440,
                },
              },
            },
            children: docChildren,
          },
        ],
      });

      const docxBlob = await Packer.toBlob(docxDocument);
      const docxArrayBuffer = await docxBlob.arrayBuffer();
      const docxUint8Array = new Uint8Array(docxArrayBuffer);
      const summary = `Updated Word document text and formatting (${new Date().toLocaleTimeString()})`;
      onSave(docxUint8Array, summary);
    } catch (err: any) {
      alert(`Failed to save Word document: ${err.message}`);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: '#0F172A', color: '#F8FAFC' }}>
      {/* Word Ribbon Toolbar */}
      <Paper
        elevation={2}
        sx={{
          bgcolor: '#1E293B',
          borderRadius: 0,
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        {isEditing ? (
          <>
            {/* Ribbon Tabs */}
            <Box sx={{ borderBottom: 1, borderColor: 'rgba(255,255,255,0.08)', px: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Tabs
                value={ribbonTab}
                onChange={(_, v) => setRibbonTab(v)}
                textColor="inherit"
                indicatorColor="primary"
                sx={{ minHeight: 38 }}
              >
                <Tab label="Home" sx={{ minHeight: 38, py: 0.8, fontWeight: 600, fontSize: '0.8rem' }} />
                <Tab label="Insert" sx={{ minHeight: 38, py: 0.8, fontWeight: 600, fontSize: '0.8rem' }} />
                <Tab label="Format" sx={{ minHeight: 38, py: 0.8, fontWeight: 600, fontSize: '0.8rem' }} />
              </Tabs>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Tooltip title="Undo (Ctrl+Z)">
                  <span>
                    <IconButton
                      size="small"
                      disabled={!editor?.can().undo()}
                      onClick={() => editor?.chain().focus().undo().run()}
                      sx={{ color: '#94A3B8' }}
                    >
                      <Undo fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>

                <Tooltip title="Redo (Ctrl+Y)">
                  <span>
                    <IconButton
                      size="small"
                      disabled={!editor?.can().redo()}
                      onClick={() => editor?.chain().focus().redo().run()}
                      sx={{ color: '#94A3B8' }}
                    >
                      <Redo fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>

                {onSave && (
                  <Button
                    size="small"
                    variant="contained"
                    color="primary"
                    startIcon={<Save fontSize="small" />}
                    onClick={handleSaveDocx}
                    disabled={saving}
                    sx={{ fontWeight: 600, ml: 1, px: 2 }}
                  >
                    {saving ? 'Saving...' : 'Save Document'}
                  </Button>
                )}
              </Box>
            </Box>

            {/* Ribbon Action Bar */}
            <Box sx={{ p: 1, px: 2, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
              {ribbonTab === 0 && editor && (
                <>
                  {/* Headings */}
                  <ButtonGroup size="small" variant="outlined" sx={{ bgcolor: 'rgba(255,255,255,0.04)' }}>
                    <Button
                      variant={editor.isActive('paragraph') ? 'contained' : 'outlined'}
                      onClick={() => editor.chain().focus().setParagraph().run()}
                    >
                      Normal
                    </Button>
                    <Button
                      variant={editor.isActive('heading', { level: 1 }) ? 'contained' : 'outlined'}
                      onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                    >
                      H1
                    </Button>
                    <Button
                      variant={editor.isActive('heading', { level: 2 }) ? 'contained' : 'outlined'}
                      onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                    >
                      H2
                    </Button>
                    <Button
                      variant={editor.isActive('heading', { level: 3 }) ? 'contained' : 'outlined'}
                      onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                    >
                      H3
                    </Button>
                  </ButtonGroup>

                  <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.12)', mx: 0.5 }} />

                  {/* Character Formats */}
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <Tooltip title="Bold (Ctrl+B)">
                      <IconButton
                        size="small"
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        sx={{
                          bgcolor: editor.isActive('bold') ? 'primary.main' : 'transparent',
                          color: editor.isActive('bold') ? '#FFF' : '#94A3B8',
                        }}
                      >
                        <FormatBold fontSize="small" />
                      </IconButton>
                    </Tooltip>

                    <Tooltip title="Italic (Ctrl+I)">
                      <IconButton
                        size="small"
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        sx={{
                          bgcolor: editor.isActive('italic') ? 'primary.main' : 'transparent',
                          color: editor.isActive('italic') ? '#FFF' : '#94A3B8',
                        }}
                      >
                        <FormatItalic fontSize="small" />
                      </IconButton>
                    </Tooltip>

                    <Tooltip title="Underline (Ctrl+U)">
                      <IconButton
                        size="small"
                        onClick={() => editor.chain().focus().toggleUnderline().run()}
                        sx={{
                          bgcolor: editor.isActive('underline') ? 'primary.main' : 'transparent',
                          color: editor.isActive('underline') ? '#FFF' : '#94A3B8',
                        }}
                      >
                        <FormatUnderlined fontSize="small" />
                      </IconButton>
                    </Tooltip>

                    <Tooltip title="Strikethrough">
                      <IconButton
                        size="small"
                        onClick={() => editor.chain().focus().toggleStrike().run()}
                        sx={{
                          bgcolor: editor.isActive('strike') ? 'primary.main' : 'transparent',
                          color: editor.isActive('strike') ? '#FFF' : '#94A3B8',
                        }}
                      >
                        <FormatStrikethrough fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>

                  <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.12)', mx: 0.5 }} />

                  {/* Text Color & Highlight */}
                  <Tooltip title="Text Color">
                    <IconButton
                      size="small"
                      onClick={(e) => setTextColorAnchor(e.currentTarget)}
                      sx={{ color: '#94A3B8' }}
                    >
                      <FormatColorText fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Menu
                    anchorEl={textColorAnchor}
                    open={Boolean(textColorAnchor)}
                    onClose={() => setTextColorAnchor(null)}
                  >
                    {['#000000', '#EF4444', '#10B981', '#3B82F6', '#8B5CF6', '#F59E0B'].map((c) => (
                      <MenuItem
                        key={c}
                        onClick={() => {
                          editor.chain().focus().setColor(c).run();
                          setTextColorAnchor(null);
                        }}
                        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                      >
                        <Box sx={{ width: 16, height: 16, borderRadius: '50%', bgcolor: c }} />
                        <Typography variant="caption">{c}</Typography>
                      </MenuItem>
                    ))}
                  </Menu>

                  <Tooltip title="Highlight Color">
                    <IconButton
                      size="small"
                      onClick={(e) => setHighlightColorAnchor(e.currentTarget)}
                      sx={{ color: '#94A3B8' }}
                    >
                      <FormatColorFill fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Menu
                    anchorEl={highlightColorAnchor}
                    open={Boolean(highlightColorAnchor)}
                    onClose={() => setHighlightColorAnchor(null)}
                  >
                    {['#FEF08A', '#BBF7D0', '#BAE6FD', '#FBCFE8'].map((c) => (
                      <MenuItem
                        key={c}
                        onClick={() => {
                          editor.chain().focus().setHighlight({ color: c }).run();
                          setHighlightColorAnchor(null);
                        }}
                        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                      >
                        <Box sx={{ width: 16, height: 16, borderRadius: 1, bgcolor: c }} />
                        <Typography variant="caption">{c}</Typography>
                      </MenuItem>
                    ))}
                  </Menu>

                  <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.12)', mx: 0.5 }} />

                  {/* Alignments */}
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <Tooltip title="Align Left">
                      <IconButton
                        size="small"
                        onClick={() => editor.chain().focus().setTextAlign('left').run()}
                        sx={{ color: editor.isActive({ textAlign: 'left' }) ? 'primary.main' : '#94A3B8' }}
                      >
                        <FormatAlignLeft fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Align Center">
                      <IconButton
                        size="small"
                        onClick={() => editor.chain().focus().setTextAlign('center').run()}
                        sx={{ color: editor.isActive({ textAlign: 'center' }) ? 'primary.main' : '#94A3B8' }}
                      >
                        <FormatAlignCenter fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Align Right">
                      <IconButton
                        size="small"
                        onClick={() => editor.chain().focus().setTextAlign('right').run()}
                        sx={{ color: editor.isActive({ textAlign: 'right' }) ? 'primary.main' : '#94A3B8' }}
                      >
                        <FormatAlignRight fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Justify">
                      <IconButton
                        size="small"
                        onClick={() => editor.chain().focus().setTextAlign('justify').run()}
                        sx={{ color: editor.isActive({ textAlign: 'justify' }) ? 'primary.main' : '#94A3B8' }}
                      >
                        <FormatAlignJustify fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>

                  <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.12)', mx: 0.5 }} />

                  {/* Lists & Quotes */}
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <Tooltip title="Bullet List">
                      <IconButton
                        size="small"
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        sx={{ color: editor.isActive('bulletList') ? 'primary.main' : '#94A3B8' }}
                      >
                        <FormatListBulleted fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Numbered List">
                      <IconButton
                        size="small"
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                        sx={{ color: editor.isActive('orderedList') ? 'primary.main' : '#94A3B8' }}
                      >
                        <FormatListNumbered fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Blockquote">
                      <IconButton
                        size="small"
                        onClick={() => editor.chain().focus().toggleBlockquote().run()}
                        sx={{ color: editor.isActive('blockquote') ? 'primary.main' : '#94A3B8' }}
                      >
                        <FormatQuote fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </>
              )}

              {ribbonTab === 1 && editor && (
                <>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<GridOn fontSize="small" />}
                    onClick={(e) => setTableMenuAnchor(e.currentTarget)}
                  >
                    Table Tools
                  </Button>
                  <Menu
                    anchorEl={tableMenuAnchor}
                    open={Boolean(tableMenuAnchor)}
                    onClose={() => setTableMenuAnchor(null)}
                  >
                    <MenuItem
                      onClick={() => {
                        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
                        setTableMenuAnchor(null);
                      }}
                    >
                      Insert 3x3 Table
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        editor.chain().focus().addRowAfter().run();
                        setTableMenuAnchor(null);
                      }}
                    >
                      Add Row Below
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        editor.chain().focus().addColumnAfter().run();
                        setTableMenuAnchor(null);
                      }}
                    >
                      Add Column Right
                    </MenuItem>
                    <Divider />
                    <MenuItem
                      onClick={() => {
                        editor.chain().focus().deleteRow().run();
                        setTableMenuAnchor(null);
                      }}
                    >
                      Delete Row
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        editor.chain().focus().deleteColumn().run();
                        setTableMenuAnchor(null);
                      }}
                    >
                      Delete Column
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        editor.chain().focus().deleteTable().run();
                        setTableMenuAnchor(null);
                      }}
                    >
                      Delete Entire Table
                    </MenuItem>
                  </Menu>

                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<HorizontalRule fontSize="small" />}
                    onClick={() => editor.chain().focus().setHorizontalRule().run()}
                  >
                    Divider
                  </Button>
                </>
              )}

              {ribbonTab === 2 && editor && (
                <>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<Code fontSize="small" />}
                    onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                  >
                    Code Block
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
                  >
                    Clear All Formatting
                  </Button>
                </>
              )}
            </Box>
          </>
        ) : (
          /* Reading Mode Toolbar */
          <Box sx={{ p: 1.2, px: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: '#94A3B8' }}>
              Reading Mode — Native Word Document Preview
            </Typography>
            <Button
              size="small"
              variant="outlined"
              startIcon={<Print fontSize="small" />}
              onClick={handlePrint}
              sx={{ color: '#CBD5E1' }}
            >
              Print / Save as PDF
            </Button>
          </Box>
        )}
      </Paper>

      {/* Main Viewport Container */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          p: 3,
          bgcolor: '#0B1120',
        }}
      >
        {loading && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, mt: 10 }}>
            <CircularProgress size={45} color="primary" />
            <Typography variant="body2" sx={{ color: '#94A3B8' }}>
              Parsing Word document layout...
            </Typography>
          </Box>
        )}

        {error && (
          <Box sx={{ textAlign: 'center', mt: 10, color: '#F87171' }}>
            <Typography variant="h6">Failed to load Word document</Typography>
            <Typography variant="body2" sx={{ mb: 2.5, color: '#FCA5A5', maxWidth: 600, mx: 'auto' }}>
              {error}
            </Typography>
            <Button
              component="a"
              href={fileUrl}
              download
              variant="contained"
              color="primary"
              startIcon={<Download />}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Download Original Word File
            </Button>
          </Box>
        )}

        {!loading && !error && (
          <Box sx={{ width: '100%', maxWidth: 860, display: 'flex', flexDirection: 'column' }}>
            {isLegacyDoc && (
              <Alert
                severity="info"
                sx={{
                  mb: 2.5,
                  bgcolor: 'rgba(37, 99, 235, 0.15)',
                  border: '1px solid rgba(59, 130, 246, 0.35)',
                  color: '#93C5FD',
                  borderRadius: 2,
                  '& .MuiAlert-icon': { color: '#60A5FA' },
                }}
                action={
                  <Button
                    component="a"
                    href={fileUrl}
                    download
                    size="small"
                    variant="outlined"
                    sx={{
                      color: '#93C5FD',
                      borderColor: 'rgba(59, 130, 246, 0.5)',
                      textTransform: 'none',
                      fontWeight: 600,
                      '&:hover': {
                        borderColor: '#60A5FA',
                        bgcolor: 'rgba(59, 130, 246, 0.15)',
                      },
                    }}
                    startIcon={<Download />}
                  >
                    Download Original (.doc)
                  </Button>
                }
              >
                <strong>Legacy Word 97-2003 Document (.doc):</strong> Text content has been extracted for reading and editing. You can edit and save to convert to modern .docx format, or download the original file.
              </Alert>
            )}

            <Paper
              elevation={6}
              sx={{
                width: '100%',
                minHeight: '1050px',
                bgcolor: '#FFFFFF',
                color: '#1E293B',
                p: 5,
                borderRadius: 1,
                boxShadow: '0 20px 40px -15px rgba(0,0,0,0.7)',
                fontFamily: "'Calibri', 'Segoe UI', Arial, sans-serif",
                lineHeight: 1.6,
              }}
            >
            {/* If in Reading Mode: docx-preview rendered container */}
            <Box
              ref={previewContainerCallbackRef}
              sx={{
                display: isEditing ? 'none' : 'block',
                '& .docx-wrapper': {
                  bgcolor: 'transparent',
                  p: 0,
                },
                '& .docx': {
                  boxShadow: 'none !important',
                  p: '0 !important',
                  minHeight: 'auto !important',
                  color: '#1E293B',
                },
              }}
            />

            {/* If in Editing Mode: Tiptap Editor */}
            {isEditing && (
              <Box
                sx={{
                  outline: 'none',
                  '& .ProseMirror': {
                    outline: 'none',
                    minHeight: '800px',
                    fontSize: '1.05rem',
                    lineHeight: 1.6,
                    '& p': { mb: 1.5 },
                    '& h1': { fontSize: '2rem', fontWeight: 700, mb: 2, color: '#0F172A' },
                    '& h2': { fontSize: '1.5rem', fontWeight: 600, mb: 1.5, color: '#1E293B' },
                    '& h3': { fontSize: '1.25rem', fontWeight: 600, mb: 1.2, color: '#334155' },
                    '& table': {
                      borderCollapse: 'collapse',
                      width: '100%',
                      my: 2,
                      '& th, & td': {
                        border: '1px solid #CBD5E1',
                        p: 1.2,
                        textAlign: 'left',
                      },
                      '& th': {
                        bgcolor: '#F1F5F9',
                        fontWeight: 600,
                      },
                    },
                    '& blockquote': {
                      borderLeft: '4px solid #3B82F6',
                      pl: 2,
                      ml: 0,
                      fontStyle: 'italic',
                      color: '#475569',
                    },
                    '& pre': {
                      bgcolor: '#F8FAFC',
                      p: 1.5,
                      borderRadius: 1,
                      fontFamily: 'monospace',
                      overflowX: 'auto',
                    },
                  },
                }}
              >
                <EditorContent editor={editor} />
              </Box>
            )}
          </Paper>
        </Box>
      )}
      </Box>
    </Box>
  );
};

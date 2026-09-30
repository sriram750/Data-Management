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

function cleanExtractedText(text: string): string[] {
  // Word uses 0x0D (13) for paragraph breaks, 0x07 for cell markers, 0x0B for soft breaks
  const cleaned = text
    .replace(/[\x00-\x08\x0E-\x1F\x7F]/g, ' ') // Strip non-printable control chars, keep \t (9), \n (10), \r (13)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\x07/g, '  |  ') // cell break
    .replace(/\x0B/g, '\n');

  return cleaned
    .split('\n')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function parseOleDoc(buffer: ArrayBuffer): string[] | null {
  try {
    const view = new DataView(buffer);
    // Verify OLE Header magic: 0xD0CF11E0 0xA1B11AE1
    if (view.byteLength < 512) return null;
    if (view.getUint32(0, false) !== 0xD0CF11E0 || view.getUint32(4, false) !== 0xA1B11AE1) {
      return null;
    }

    const sectorShift = view.getUint16(30, true);
    const miniSectorShift = view.getUint16(32, true);
    const sectorSize = 1 << sectorShift;
    const miniSectorSize = 1 << miniSectorShift;
    const numFatSectors = view.getUint32(44, true);
    const firstDirSector = view.getUint32(48, true);
    const miniCutoff = view.getUint32(56, true) || 4096;
    const firstMiniFatSector = view.getUint32(60, true);
    const numMiniFatSectors = view.getUint32(64, true);
    const firstDifatSector = view.getUint32(68, true);

    // Build DIFAT sector indices
    const fatSectorIndices: number[] = [];
    const initialDifatCount = Math.min(109, numFatSectors);
    for (let i = 0; i < initialDifatCount; i++) {
      const sec = view.getUint32(76 + i * 4, true);
      if (sec < 0xFFFFFFFC) fatSectorIndices.push(sec);
    }
    let curDifatSec = firstDifatSector;
    while (curDifatSec < 0xFFFFFFFC && fatSectorIndices.length < numFatSectors) {
      const offset = (curDifatSec + 1) * sectorSize;
      for (let j = 0; j < (sectorSize / 4) - 1; j++) {
        const sec = view.getUint32(offset + j * 4, true);
        if (sec < 0xFFFFFFFC) fatSectorIndices.push(sec);
      }
      curDifatSec = view.getUint32(offset + sectorSize - 4, true);
    }

    // Build FAT table
    const fat: number[] = [];
    for (const fatSec of fatSectorIndices) {
      const offset = (fatSec + 1) * sectorSize;
      if (offset + sectorSize <= view.byteLength) {
        for (let j = 0; j < sectorSize / 4; j++) {
          fat.push(view.getUint32(offset + j * 4, true));
        }
      }
    }

    // Helper: read regular sector chain
    function readChain(startSec: number, totalSize: number): Uint8Array {
      let sec = startSec;
      const chunks: Uint8Array[] = [];
      let remain = totalSize;
      let iterations = 0;
      while (sec < 0xFFFFFFFC && remain > 0 && iterations < 100000) {
        const offset = (sec + 1) * sectorSize;
        const readLen = Math.min(sectorSize, remain);
        if (offset + readLen <= buffer.byteLength) {
          chunks.push(new Uint8Array(buffer, offset, readLen));
          remain -= readLen;
        } else {
          break;
        }
        sec = fat[sec] ?? 0xFFFFFFFE;
        iterations++;
      }
      const actualLen = chunks.reduce((acc, c) => acc + c.length, 0);
      const out = new Uint8Array(actualLen);
      let pos = 0;
      for (const ch of chunks) {
        out.set(ch, pos);
        pos += ch.length;
      }
      return out;
    }

    // Read Directory entries
    const dirBytes = readChain(firstDirSector, 1024 * 1024);
    const dirView = new DataView(dirBytes.buffer, dirBytes.byteOffset, dirBytes.byteLength);
    interface DirEntry {
      name: string;
      type: number;
      startSec: number;
      size: number;
    }
    const entries: DirEntry[] = [];
    for (let i = 0; i < dirBytes.byteLength; i += 128) {
      const nameLen = dirView.getUint16(i + 64, true);
      if (nameLen === 0) continue;
      let name = '';
      for (let c = 0; c < Math.min(nameLen - 2, 64); c += 2) {
        name += String.fromCharCode(dirView.getUint16(i + c, true));
      }
      const type = dirView.getUint8(i + 66);
      const startSec = dirView.getUint32(i + 116, true);
      const size = dirView.getUint32(i + 120, true);
      entries.push({ name, type, startSec, size });
    }

    const rootEntry = entries.find((e) => e.type === 5 || e.name.toLowerCase() === 'root entry');
    const miniStream = rootEntry && rootEntry.startSec < 0xFFFFFFFC
      ? readChain(rootEntry.startSec, rootEntry.size)
      : new Uint8Array(0);

    // Build MiniFAT table
    const miniFat: number[] = [];
    if (firstMiniFatSector < 0xFFFFFFFC && numMiniFatSectors > 0) {
      let msec = firstMiniFatSector;
      let mcount = 0;
      while (msec < 0xFFFFFFFC && mcount < numMiniFatSectors) {
        const offset = (msec + 1) * sectorSize;
        if (offset + sectorSize <= view.byteLength) {
          for (let j = 0; j < sectorSize / 4; j++) {
            miniFat.push(view.getUint32(offset + j * 4, true));
          }
        }
        msec = fat[msec] ?? 0xFFFFFFFE;
        mcount++;
      }
    }

    function getStream(entry?: DirEntry): Uint8Array | null {
      if (!entry) return null;
      if (entry.size < miniCutoff && miniStream.byteLength > 0 && entry.type !== 5) {
        let msec = entry.startSec;
        const chunks: Uint8Array[] = [];
        let remain = entry.size;
        let it = 0;
        while (msec < 0xFFFFFFFC && remain > 0 && it < 50000) {
          const offset = msec * miniSectorSize;
          const readLen = Math.min(miniSectorSize, remain);
          if (offset + readLen <= miniStream.byteLength) {
            chunks.push(miniStream.slice(offset, offset + readLen));
          }
          remain -= readLen;
          msec = miniFat[msec] ?? 0xFFFFFFFE;
          it++;
        }
        const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
        const out = new Uint8Array(totalLen);
        let p = 0;
        for (const ch of chunks) {
          out.set(ch, p);
          p += ch.length;
        }
        return out;
      }
      return readChain(entry.startSec, entry.size);
    }

    const wdEntry = entries.find((e) => e.name.toLowerCase() === 'worddocument');
    if (!wdEntry) return null;
    const wdBytes = getStream(wdEntry);
    if (!wdBytes || wdBytes.length < 512) return null;
    const wdView = new DataView(wdBytes.buffer, wdBytes.byteOffset, wdBytes.byteLength);

    const flags = wdView.getUint16(10, true);
    const fWhichTblStm = (flags & 0x0200) !== 0;
    const tblName = fWhichTblStm ? '1table' : '0table';
    const tblEntry = entries.find((e) => e.name.toLowerCase() === tblName);

    if (tblEntry) {
      const tblBytes = getStream(tblEntry);
      if (tblBytes && tblBytes.length > 0) {
        const fcClx = wdView.getUint32(418, true);
        const lcbClx = wdView.getUint32(422, true);

        if (lcbClx > 0 && fcClx + lcbClx <= tblBytes.length) {
          let clxPos = fcClx;
          const clxEnd = fcClx + lcbClx;
          const tblView = new DataView(tblBytes.buffer, tblBytes.byteOffset, tblBytes.byteLength);

          while (clxPos < clxEnd) {
            const clxt = tblView.getUint8(clxPos);
            clxPos++;
            if (clxt === 1) { // Prc
              const cbGrpprl = tblView.getUint16(clxPos, true);
              clxPos += 2 + cbGrpprl;
            } else if (clxt === 2) { // PlcPcd (Piece Table)
              const lcb = tblView.getUint32(clxPos, true);
              clxPos += 4;
              const numPieces = Math.floor((lcb - 4) / 12);
              if (numPieces > 0) {
                const cpArr: number[] = [];
                for (let p = 0; p <= numPieces; p++) {
                  cpArr.push(tblView.getUint32(clxPos + p * 4, true));
                }
                const pcdPos = clxPos + (numPieces + 1) * 4;

                let fullText = '';
                for (let p = 0; p < numPieces; p++) {
                  const fc = tblView.getUint32(pcdPos + p * 8 + 2, true);
                  const fCompressed = (fc & 0x40000000) !== 0;
                  const actualFc = fc & 0x3FFFFFFF;
                  const charCount = cpArr[p + 1] - cpArr[p];

                  if (fCompressed) {
                    const byteOffset = Math.floor(actualFc / 2);
                    for (let c = 0; c < charCount; c++) {
                      if (byteOffset + c < wdBytes.length) {
                        fullText += String.fromCharCode(wdBytes[byteOffset + c]);
                      }
                    }
                  } else {
                    const byteOffset = actualFc;
                    for (let c = 0; c < charCount; c++) {
                      if (byteOffset + c * 2 + 1 < wdBytes.length) {
                        fullText += String.fromCharCode(wdView.getUint16(byteOffset + c * 2, true));
                      }
                    }
                  }
                }

                if (fullText.trim().length > 0) {
                  return cleanExtractedText(fullText);
                }
              }
              break;
            } else {
              break;
            }
          }
        }
      }
    }

    // Fallback: If piece table was absent, read non-complex text starting from fcMin
    const fcMin = wdView.getUint32(24, true);
    const ccpText = wdView.getUint32(76, true);
    if (fcMin > 0 && ccpText > 0 && fcMin < wdBytes.length) {
      let rawText = '';
      const readLen = Math.min(ccpText, wdBytes.length - fcMin);
      for (let i = 0; i < readLen; i++) {
        const b = wdBytes[fcMin + i];
        if (b >= 32 || b === 10 || b === 13 || b === 9) {
          rawText += String.fromCharCode(b);
        }
      }
      if (rawText.trim().length > 0) {
        return cleanExtractedText(rawText);
      }
    }
  } catch (err) {
    console.warn('OLE2 Compound Document parsing notice:', err);
  }
  return null;
}

function extractDocText(buffer: ArrayBuffer): string[] {
  const bytes = new Uint8Array(buffer);

  // 1. Check for RTF file renamed to .doc
  if (bytes.length >= 5) {
    const rtfHeader = String.fromCharCode(...bytes.slice(0, 5));
    if (rtfHeader === '{\\rtf') {
      const rtfStr = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      const textOnly = rtfStr
        .replace(/\\\w+(?:-?\d+)? ?/g, '')
        .replace(/[{}]/g, '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      if (textOnly.length > 0) return textOnly;
    }
  }

  // 2. Check for HTML file renamed to .doc
  const startStr = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 100)).toLowerCase();
  if (startStr.includes('<html') || startStr.includes('<!doctype html') || startStr.includes('<xml')) {
    const htmlStr = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    const cleanText = htmlStr.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleanText) return [cleanText];
  }

  // 3. Try standard Microsoft Word 97-2003 OLE2 / FIB / Piece Table extraction
  const oleResult = parseOleDoc(buffer);
  if (oleResult && oleResult.length > 0) {
    return oleResult;
  }

  // 4. Fallback: Clean ASCII / 8-bit text scanning (never arbitrary 16-bit pairings that cause Chinese glyphs)
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

  const asciiChunks: string[] = [];
  let cur = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if ((b >= 32 && b <= 126) || b === 10 || b === 13 || b === 9 || (b >= 160 && b <= 255)) {
      cur += String.fromCharCode(b);
    } else {
      if (cur.trim().length >= 3) {
        const trimmed = cur.trim();
        if (!metadataWords.has(trimmed.toLowerCase())) {
          asciiChunks.push(trimmed);
        }
      }
      cur = '';
    }
  }
  if (cur.trim().length >= 3) {
    const trimmed = cur.trim();
    if (!metadataWords.has(trimmed.toLowerCase())) asciiChunks.push(trimmed);
  }

  return asciiChunks;
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

        const bytes = new Uint8Array(buffer);
        const isOleDoc =
          bytes.length >= 8 &&
          bytes[0] === 0xd0 &&
          bytes[1] === 0xcf &&
          bytes[2] === 0x11 &&
          bytes[3] === 0xe0 &&
          bytes[4] === 0xa1 &&
          bytes[5] === 0xb1 &&
          bytes[6] === 0x1a &&
          bytes[7] === 0xe1;

        if (isOleDoc) {
          const paragraphs = extractDocText(buffer.slice(0));
          if (paragraphs.length > 0) {
            const html = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
            setIsLegacyDoc(true);
            setLegacyHtml(html);
            if (editor && !isCancelled) {
              editor.commands.setContent(html);
            }
            return;
          }
        }

        // Parse HTML via mammoth for modern .docx or fallback for legacy .doc
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
                '& p': {
                  margin: '0 0 1.25em 0',
                  fontSize: '1.05rem',
                  lineHeight: 1.7,
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

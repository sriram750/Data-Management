import asyncio
import logging
import os
import shutil
import sys
from typing import Optional

logger = logging.getLogger(__name__)


class DocumentConverterService:
    @staticmethod
    def is_doc_file(filename: str, content_type: Optional[str] = None) -> bool:
        """Determines if a document is a legacy .doc file."""
        fn = filename.lower()
        if fn.endswith('.doc') and not fn.endswith('.docx'):
            return True
        if content_type and 'msword' in content_type.lower():
            return True
        return False

    @staticmethod
    async def get_or_create_docx_preview(source_path: str) -> Optional[str]:
        """
        Converts a legacy .doc file to a modern .docx preview file.
        Returns the path to the converted .docx file, or None if conversion failed.
        Caches the converted file so repeated previews are instantaneous.
        """
        if not os.path.exists(source_path):
            return None

        preview_docx_path = f"{source_path}.preview.docx"

        # Cache hit: Check if converted preview already exists and is up to date
        if os.path.exists(preview_docx_path) and os.path.getsize(preview_docx_path) > 0:
            try:
                if os.path.getmtime(preview_docx_path) >= os.path.getmtime(source_path):
                    return preview_docx_path
            except Exception:
                return preview_docx_path

        # Run conversion in a separate thread so the async event loop is never blocked
        success = await asyncio.to_thread(
            DocumentConverterService._convert_sync, source_path, preview_docx_path
        )
        if success and os.path.exists(preview_docx_path) and os.path.getsize(preview_docx_path) > 0:
            return preview_docx_path

        return None

    @staticmethod
    def _convert_sync(input_path: str, output_path: str) -> bool:
        abs_in = os.path.abspath(input_path)
        abs_out = os.path.abspath(output_path)

        # 1. On Windows: Try Microsoft Word COM automation via PowerShell
        if sys.platform == "win32":
            try:
                ps_script = (
                    "$w = New-Object -ComObject Word.Application; "
                    "$w.Visible = $false; "
                    "$w.DisplayAlerts = 0; "
                    "try { "
                    f"$d = $w.Documents.Open([ref]\"{abs_in}\", [ref]$false, [ref]$true); "
                    f"$d.SaveAs([ref]\"{abs_out}\", [ref]16); "
                    "$d.Close([ref]$false); "
                    "exit 0 "
                    "} catch { "
                    "exit 1 "
                    "} finally { "
                    "$w.Quit([ref]$false) "
                    "}"
                )
                import subprocess

                res = subprocess.run(
                    [
                        "powershell",
                        "-NoProfile",
                        "-NonInteractive",
                        "-ExecutionPolicy",
                        "Bypass",
                        "-Command",
                        ps_script,
                    ],
                    capture_output=True,
                    text=True,
                    timeout=30,
                )
                if res.returncode == 0 and os.path.exists(abs_out) and os.path.getsize(abs_out) > 0:
                    logger.info(f"Successfully converted '{abs_in}' to DOCX via Word COM.")
                    return True
            except Exception as e:
                logger.warning(f"Word COM conversion failed for '{abs_in}': {e}")

        # 2. Try LibreOffice / soffice CLI (cross-platform, Linux Docker, or Windows if installed)
        soffice_bin = shutil.which("libreoffice") or shutil.which("soffice")
        if soffice_bin:
            try:
                import subprocess

                out_dir = os.path.dirname(abs_out)
                res = subprocess.run(
                    [
                        soffice_bin,
                        "-env:UserInstallation=file:///tmp/libreoffice_profile",
                        "--headless",
                        "--invisible",
                        "--nodefault",
                        "--nofirststartwizard",
                        "--convert-to",
                        "docx",
                        "--outdir",
                        out_dir,
                        abs_in,
                    ],
                    capture_output=True,
                    text=True,
                    timeout=60,
                )
                base_in = os.path.splitext(os.path.basename(abs_in))[0]
                default_soffice_out = os.path.join(out_dir, f"{base_in}.docx")
                if os.path.exists(default_soffice_out):
                    if os.path.abspath(default_soffice_out) != abs_out:
                        shutil.move(default_soffice_out, abs_out)
                    logger.info(f"Successfully converted '{abs_in}' to DOCX via LibreOffice.")
                    return True
                # If output has slightly different casing or extension
                for f in os.listdir(out_dir):
                    if f.startswith(base_in) and f.lower().endswith(".docx"):
                        found_path = os.path.join(out_dir, f)
                        if os.path.abspath(found_path) != abs_out:
                            shutil.move(found_path, abs_out)
                        logger.info(f"Successfully converted '{abs_in}' to DOCX via LibreOffice.")
                        return True
            except Exception as e:
                logger.warning(f"LibreOffice conversion failed for '{abs_in}': {e}")

        return False

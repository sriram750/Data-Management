# DataMatrix - Excel & CSV Export Guide

DataMatrix allows authorized users to export table data to formatted Excel workbooks (`.xlsx`) or comma-separated values (`.csv`), with strict column-level permission checks and audit logging.

---

## 1. Export Capabilities

- **Export Formats**:
  - **Microsoft Excel (`.xlsx`)**: Styled workbook generated with OpenPyXL, including formatted headers, column widths, date styling, and number formatting.
  - **Comma-Separated Values (`.csv`)**: Lightweight UTF-8 encoded text stream suitable for ETL pipelines.
- **Column Filtering**: Users can choose a custom subset of columns to export.
- **Column Security Enforcement**: Any column marked as `DENIED` for the user's role is stripped at the database query level and will NEVER be exported.
- **Sensitive Field Protection**: Encrypted password/secret fields are exported as masked string values (`••••••••`) unless an authorized administrator performs an unmasked raw export with explicit auditing.

---

## 2. Exporting Data via UI

1. Open the dynamic table in the AG Grid view (`/tables/:tableId`).
2. Click the **Export** button in the upper toolbar.
3. In the Export Modal:
   - Select **Excel (.xlsx)** or **CSV (.csv)**.
   - Select or deselect columns to include.
4. Click **Download**.
5. The file will download immediately in your browser.

---

## 3. Export History & Governance

Every export event triggers a record in `export_history` and `audit_logs`, tracking:
- User who initiated the export
- Table exported
- Exact list of columns included
- Total rows extracted
- Timestamp and client IP address

Navigate to **Import / Export &rarr; Export History** to review all organization data export activities.

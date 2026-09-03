# DataMatrix - Excel Import Guide & Wizard Walkthrough

DataMatrix provides an enterprise-grade 4-step Excel (.xlsx) Import Wizard that automatically discovers worksheet structure, infers column data types, executes row-by-row validation, and imports data transactionally into PostgreSQL.

---

## 1. Supported File Formats

- Standard Microsoft Excel Workbooks (`.xlsx`)
- Macro-Enabled Excel Workbooks (`.xlsm`)
- Max file upload size: 50 MB (configurable via `MAX_UPLOAD_SIZE_MB`)

---

## 2. Step-by-Step Import Process

### Step 1: Upload & Worksheet Detection
1. Drag and drop or browse to select your `.xlsx` workbook.
2. The server reads the workbook metadata and identifies all available worksheets (e.g. `Sheet1`, `Inventory`, `Contacts`).
3. If the workbook has multiple sheets, select the sheet to import from the dropdown.

### Step 2: Auto-Detection & Column Mapping
1. DataMatrix scans the first 200 rows of the sheet and infers the optimal column types from 17 supported types (e.g. detecting integers as `NUMBER`, dates as `DATE`, currency as `CURRENCY`, emails as `EMAIL`, IPs as `IP_ADDRESS`).
2. Columns containing sensitive headers (e.g. `password`, `secret`, `api_key`, `token`) are automatically marked as **Sensitive / AES-256 Encrypted**.
3. Choose your **Import Mode**:
   - **Create Brand New Table**: Generates a new dynamic schema based on the detected headers.
   - **Append to Existing Table**: Inserts all valid rows as new records.
   - **Update Matching Records**: Matches rows based on a designated unique key column (e.g. `Server Hostname` or `Email`) and updates existing records.
   - **Upsert Records**: Updates existing matching records or inserts new records if no match is found.

### Step 3: Row Validation Breakdown
1. The server executes dry-run validation against every row in the spreadsheet.
2. Displays a summary card with:
   - **Total Rows**
   - **Valid Rows** (green)
   - **Warning Rows** (yellow, e.g. non-critical type coercion)
   - **Error Rows** (red, e.g. invalid date formats, empty required fields)
3. An interactive error breakdown displays exact row numbers and field failure messages.

### Step 4: Transactional ACID Execution
1. Click **Confirm & Import Records**.
2. All records and version snapshots (`v1`) are written in a **single atomic database transaction**.
3. If any database constraint fails, the entire transaction rolls back cleanly, leaving zero corrupted records.
4. An entry is recorded in `import_history` and `audit_logs`.

---

## 3. Best Practices for Spreadsheet Preparation

- **Header Row**: Ensure row 1 contains unique, descriptive column headers.
- **Data Consistency**: Avoid mixing incompatible types in the same column (e.g. writing "N/A" in a numeric revenue column).
- **Date Formats**: Use standard ISO dates (`YYYY-MM-DD`) or Excel native date cell formats.
- **Empty Rows**: Remove blank rows at the end of worksheets to avoid unnecessary validation warnings.

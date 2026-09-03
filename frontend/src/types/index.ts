export type ColumnType =
  | 'TEXT'
  | 'LONG_TEXT'
  | 'NUMBER'
  | 'DECIMAL'
  | 'CURRENCY'
  | 'DATE'
  | 'DATETIME'
  | 'EMAIL'
  | 'PHONE'
  | 'IP_ADDRESS'
  | 'URL'
  | 'PASSWORD'
  | 'BOOLEAN'
  | 'DROPDOWN'
  | 'MULTI_SELECT'
  | 'USER'
  | 'FILE'
  | 'MIXED'
  | 'ALPHANUMERIC';

export type UserStatus = 'ACTIVE' | 'DISABLED' | 'LOCKED';

export type ColumnPermissionLevel = 'DENIED' | 'VIEW' | 'VIEW_EDIT';

export interface UserRoleBrief {
  id: string;
  name: string;
  display_name: string;
}

export interface UserInfo {
  id: string;
  username: string;
  full_name: string;
  email: string;
  status?: UserStatus;
  is_super_admin: boolean;
  roles: string[] | UserRoleBrief[];
  permissions: string[];
}

export interface LoginResponse {
  token: string;
  token_type: string;
  expires_at: string;
  user: UserInfo;
}

export interface SetupStatusResponse {
  setup_required: boolean;
  total_users: number;
}

export interface SessionResponse {
  id: string;
  ip_address?: string;
  user_agent?: string;
  expires_at: string;
  last_activity_at?: string;
  created_at: string;
  is_current: boolean;
}

export interface Permission {
  id: string;
  code: string;
  name: string;
  category: string;
  description?: string;
}

export interface Role {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  is_system: boolean;
  permissions: Permission[];
  created_at: string;
}

export interface DataColumn {
  id: string;
  table_id: string;
  name: string;
  display_name: string;
  data_type: ColumnType;
  is_required: boolean;
  is_sensitive: boolean;
  is_encrypted: boolean;
  is_hidden: boolean;
  default_value?: string | null;
  validation_rules?: Record<string, any> | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface DataTable {
  id: string;
  name: string;
  display_name: string;
  description?: string | null;
  is_active: boolean;
  is_favorite: boolean;
  columns: DataColumn[];
  record_count: number;
  created_at: string;
  updated_at: string;
  created_by_id?: string | null;
}

export interface TableListResponse {
  items: DataTable[];
  total: number;
  page: number;
  page_size: number;
}

export interface DataRecord {
  id: string;
  table_id: string;
  data: Record<string, any>;
  version: number;
  created_at: string;
  updated_at: string;
  created_by_id?: string | null;
  updated_by_id?: string | null;
  created_by_name?: string | null;
  updated_by_name?: string | null;
}

export interface DeletedRecordItem {
  id: string;
  record_id: string;
  table_id: string;
  table_name?: string | null;
  table_display_name?: string | null;
  version_number: number;
  data_snapshot: Record<string, any>;
  deleted_by_id?: string | null;
  deleted_by_name?: string | null;
  deleted_at: string;
}

export interface RecordVersion {
  id: string;
  record_id: string;
  table_id: string;
  version_number: number;
  data_snapshot: Record<string, any>;
  delta?: Record<string, { old: any; new: any }> | null;
  change_type: 'CREATE' | 'UPDATE' | 'RESTORE' | 'DELETE';
  changed_by_id?: string | null;
  changed_by_username?: string | null;
  created_at: string;
}

export interface TableHistoryItem {
  id: string;
  table_id: string;
  action: string;
  details: Record<string, any>;
  changed_by_username?: string | null;
  timestamp: string;
}

export interface DetectedColumn {
  original_name: string;
  suggested_name: string;
  suggested_type: ColumnType;
  sample_values: any[];
  is_required: boolean;
  is_sensitive: boolean;
}

export interface ExcelPreviewResponse {
  file_token: string;
  file_name: string;
  file_size_bytes: number;
  sheets: string[];
  selected_sheet: string;
  total_rows: number;
  total_columns: number;
  detected_columns: DetectedColumn[];
  preview_rows: Record<string, any>[];
}

export interface ColumnMappingConfig {
  source_column: string;
  target_column: string;
  data_type: ColumnType;
  is_required: boolean;
  is_sensitive: boolean;
  is_encrypted: boolean;
  validation_rules?: Record<string, any> | null;
}

export interface ImportRowError {
  row_number: number;
  column_name?: string;
  error_type: string;
  message: string;
  raw_value?: any;
}

export interface ImportValidationSummary {
  total_rows: number;
  valid_rows: number;
  warning_rows: number;
  error_rows: number;
  is_valid: boolean;
  errors: ImportRowError[];
  warnings: ImportRowError[];
}

export interface ImportHistoryItem {
  id: string;
  table_id?: string;
  table_name: string;
  file_name: string;
  file_size_bytes: number;
  total_rows: number;
  imported_rows: number;
  warning_rows: number;
  error_rows: number;
  status: 'PENDING' | 'COMPLETED' | 'COMPLETED_WITH_WARNINGS' | 'FAILED';
  validation_summary?: Record<string, any>;
  imported_by_username?: string;
  timestamp: string;
}

export interface BatchSheetConfig {
  sheet_name: string;
  table_display_name: string;
  table_name: string;
}

export interface BatchImportTableResult {
  sheet_name: string;
  table_id?: string;
  table_name: string;
  table_display_name: string;
  total_columns: number;
  imported_rows: number;
  status: 'SUCCESS' | 'FAILED';
  error_message?: string;
}

export interface BatchImportExecuteResponse {
  total_sheets_processed: number;
  successful_tables: BatchImportTableResult[];
  failed_sheets: { sheet_name: string; error?: string; error_message?: string }[];
}

export interface TablePermissionRule {
  id: string;
  table_id: string;
  role_id?: string | null;
  role_name?: string | null;
  user_id?: string | null;
  username?: string | null;
  can_view_records: boolean;
  can_add_records: boolean;
  can_edit_records: boolean;
  can_delete_records: boolean;
  can_manage_columns: boolean;
  can_manage_permissions: boolean;
  can_import: boolean;
  can_export: boolean;
}

export interface ExportHistoryItem {
  id: string;
  table_id?: string;
  table_name: string;
  export_format: 'XLSX' | 'CSV';
  total_rows: number;
  exported_columns: string[];
  exported_by_username?: string;
  timestamp: string;
}

export interface AuditLogItem {
  id: string;
  timestamp: string;
  user_id?: string | null;
  username: string;
  action: string;
  table_id?: string | null;
  table_name?: string | null;
  record_id?: string | null;
  field_name?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  details?: Record<string, any> | null;
}

export interface RecentActivityItem {
  id: string;
  timestamp: string;
  username: string;
  action: string;
  description: string;
  table_name?: string | null;
  record_id?: string | null;
}

export interface DashboardMetrics {
  total_tables: number;
  total_records: number;
  total_users: number;
  active_users: number;
  changes_today: number;
  imports_today: number;
  exports_today: number;
  recent_activities: RecentActivityItem[];
}

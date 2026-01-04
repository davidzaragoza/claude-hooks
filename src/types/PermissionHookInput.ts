export interface PermissionHookInput {
  session_id: string;
  cwd: string;
  transcript_path: string;
  permission_mode: string;
  hook_event_name: "PermissionRequest";
  tool_name: string;
  tool_input: unknown;
  tool_use_id: string;
}

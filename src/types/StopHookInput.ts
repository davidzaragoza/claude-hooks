export interface StopHookInput {
  session_id: string;
  cwd: string;
  transcript_path: string;
  permission_mode: string;
  hook_event_name: "Stop";
  stop_hook_active: boolean;
}

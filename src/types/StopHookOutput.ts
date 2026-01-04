export interface StopHookOutput {
  decision: "block" | undefined;
  reason?: string;
}

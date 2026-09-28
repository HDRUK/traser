// Upper bound on a template decoded from a share link, before it is seeded and
// auto-evaluated. Guards against a maliciously large/expensive expression in a
// URL freezing the tab on open.
export const MAX_SHARED_TEMPLATE_CHARS = 20_000;

export interface DatasetOption { pid: string; title: string; gatewayId?: string }
export interface TemplateOption { input_model: string; input_version: string; output_model: string; output_version: string }
export interface ValidationError {
  instancePath?: string;
  message?: string;
  params?: Record<string, unknown>;
  suggestion?: string;
  invalidValue?: unknown;
  allowedValues?: unknown[];
}
export interface FindMatch {
  name: string;
  version: string;
  matches: boolean;
  errors?: Array<ValidationError> | null;
}
export type ValidationState =
  | { kind: "unchecked" }
  | { kind: "checking" }
  | { kind: "valid" }
  | { kind: "invalid"; errors: Array<ValidationError> };

// ============================================================
// Ambient Global Types for IDE & TypeScript Support
// ============================================================

declare namespace NodeJS {
  interface Process {
    env: {
      [key: string]: string | undefined;
      NEXT_PUBLIC_SUPABASE_URL?: string;
      NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
      SUPABASE_SERVICE_ROLE_KEY?: string;
      GEMINI_API_KEY?: string;
      DEFAULT_GEMINI_MODEL?: string;
    };
  }
}

declare var process: NodeJS.Process;

declare module 'next/server' {
  export class NextRequest extends Request {
    readonly nextUrl: URL;
    readonly cookies: any;
    readonly ip?: string;
    readonly geo?: any;
    formData(): Promise<FormData>;
    json(): Promise<any>;
    text(): Promise<string>;
    arrayBuffer(): Promise<ArrayBuffer>;
  }

  export class NextResponse extends Response {
    static json(body: any, init?: ResponseInit): NextResponse;
    static redirect(url: string | URL, init?: number | ResponseInit): NextResponse;
    static rewrite(destination: string | URL, init?: ResponseInit): NextResponse;
    static next(init?: ResponseInit): NextResponse;
  }
}

declare module '@supabase/supabase-js' {
  export function createClient(
    supabaseUrl: string,
    supabaseKey: string,
    options?: any
  ): any;
  export type SupabaseClient = any;
}

declare module 'pdf-parse' {
  export default function pdf(
    dataBuffer: Buffer | Uint8Array,
    options?: any
  ): Promise<{
    numpages: number;
    numrender: number;
    info: any;
    metadata: any;
    text: string;
    version: string;
  }>;
}

declare module 'clsx' {
  export default function clsx(...args: any[]): string;
}

declare module 'lucide-react' {
  import * as React from 'react';
  export interface LucideProps extends React.SVGProps<SVGSVGElement> {
    size?: string | number;
    color?: string;
    strokeWidth?: string | number;
    className?: string;
  }
  export type LucideIcon = React.FC<LucideProps>;

  export const UploadCloud: LucideIcon;
  export const FileText: LucideIcon;
  export const CheckCircle2: LucideIcon;
  export const AlertTriangle: LucideIcon;
  export const Sparkles: LucideIcon;
  export const RefreshCw: LucideIcon;
  export const ArrowRight: LucideIcon;
  export const Copy: LucideIcon;
  export const Check: LucideIcon;
  export const Eye: LucideIcon;
  export const Download: LucideIcon;
  export const X: LucideIcon;
  export const Trash2: LucideIcon;
  export const Printer: LucideIcon;
  export const Search: LucideIcon;
  export const Table: LucideIcon;
  export const Database: LucideIcon;
  export const Key: LucideIcon;
  export const Cpu: LucideIcon;
  export const AlertCircle: LucideIcon;
  export const ExternalLink: LucideIcon;
  export const FileSpreadsheet: LucideIcon;
  export const ChevronDown: LucideIcon;
  export const ChevronUp: LucideIcon;
  export const Info: LucideIcon;
  export const [key: string]: any;
}

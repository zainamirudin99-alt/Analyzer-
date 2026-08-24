// ============================================================
// Ambient Global Types for IDE & TypeScript Support
// ============================================================

declare namespace NodeJS {
  interface ProcessEnv {
    [key: string]: string | undefined;
    NEXT_PUBLIC_SUPABASE_URL?: string;
    NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
    SUPABASE_SERVICE_ROLE_KEY?: string;
    GEMINI_API_KEY?: string;
    DEFAULT_GEMINI_MODEL?: string;
  }
  interface Process {
    env: ProcessEnv;
  }
}

declare var process: any;
declare var Buffer: any;

declare namespace React {
  type FC<P = {}> = (props: P) => any;
  type ReactNode = any;
  type ReactElement = any;
  interface ChangeEvent<T = any> {
    target: T;
  }
  interface DragEvent<T = any> {
    preventDefault: () => void;
    dataTransfer: {
      files: FileList;
    };
  }
  function useState<T>(initialState: T | (() => T)): [T, (newState: T | ((prevState: T) => T)) => void];
  function useEffect(effect: () => void | (() => void), deps?: any[]): void;
  function useRef<T>(initialValue?: T): { current: T };
}

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
  const pdfParse: (dataBuffer: any, options?: any) => Promise<any>;
  export default pdfParse;
}

declare module 'clsx' {
  export default function clsx(...args: any[]): string;
}

declare module 'lucide-react' {
  export const UploadCloud: any;
  export const FileText: any;
  export const CheckCircle2: any;
  export const AlertTriangle: any;
  export const Sparkles: any;
  export const RefreshCw: any;
  export const ArrowRight: any;
  export const Copy: any;
  export const Check: any;
  export const Eye: any;
  export const Download: any;
  export const X: any;
  export const Trash2: any;
  export const Printer: any;
  export const Search: any;
  export const Table: any;
  export const Database: any;
  export const Key: any;
  export const Cpu: any;
  export const AlertCircle: any;
  export const ExternalLink: any;
  export const FileSpreadsheet: any;
  export const ChevronDown: any;
  export const ChevronUp: any;
  export const Info: any;

  const icons: any;
  export default icons;
}

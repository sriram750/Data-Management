declare module 'mammoth' {
  export interface MammothResult {
    value: string;
    messages: any[];
  }
  export function convertToHtml(input: { arrayBuffer?: ArrayBuffer; buffer?: Buffer }): Promise<MammothResult>;
  export function extractRawText(input: { arrayBuffer?: ArrayBuffer; buffer?: Buffer }): Promise<MammothResult>;
}

declare module 'docx-preview' {
  export interface DocxPreviewOptions {
    className?: string;
    inWrapper?: boolean;
    ignoreWidth?: boolean;
    ignoreHeight?: boolean;
    ignoreFonts?: boolean;
    breakPages?: boolean;
    ignoreLastRenderedPageBreak?: boolean;
    experimental?: boolean;
    trimXmlDeclaration?: boolean;
    debug?: boolean;
  }
  export function renderAsync(
    data: Blob | ArrayBuffer | Uint8Array,
    bodyContainer: HTMLElement,
    styleContainer?: HTMLElement,
    options?: Partial<DocxPreviewOptions>
  ): Promise<any>;
}

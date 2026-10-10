/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

declare module 'virtual:pwa-register/react';
declare module 'qrcode.react';
declare module 'jspdf';
declare module 'jspdf-autotable';
declare module 'pdfjs-dist';
declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' {
  const src: string;
  export default src;
}

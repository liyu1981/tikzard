// Raw-text imports for bundled agent skills (Vite `?raw`).
declare module "*.md?raw" {
  const content: string;
  export default content;
}

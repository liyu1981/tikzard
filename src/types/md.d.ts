// Raw-text imports for bundled agent skills (loaded via webpack asset/source).
declare module "*.md" {
  const content: string;
  export default content;
}

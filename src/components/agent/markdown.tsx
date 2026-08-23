import Markdown from "react-markdown";

const components = {
  p: (props: React.ComponentProps<"p">) => (
    <p className="my-1.5 first:mt-0 last:mb-0" {...props} />
  ),
  h1: (props: React.ComponentProps<"h1">) => (
    <h1 className="mt-2 mb-1 text-base font-semibold first:mt-0" {...props} />
  ),
  h2: (props: React.ComponentProps<"h2">) => (
    <h2 className="mt-2 mb-1 text-sm font-semibold first:mt-0" {...props} />
  ),
  h3: (props: React.ComponentProps<"h3">) => (
    <h3 className="mt-2 mb-1 text-sm font-medium first:mt-0" {...props} />
  ),
  ul: (props: React.ComponentProps<"ul">) => (
    <ul className="my-1.5 list-disc space-y-0.5 pl-4" {...props} />
  ),
  ol: (props: React.ComponentProps<"ol">) => (
    <ol className="my-1.5 list-decimal space-y-0.5 pl-4" {...props} />
  ),
  li: (props: React.ComponentProps<"li">) => <li {...props} />,
  a: (props: React.ComponentProps<"a">) => (
    <a
      className="text-primary underline underline-offset-2"
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
  blockquote: (props: React.ComponentProps<"blockquote">) => (
    <blockquote
      className="my-1.5 border-l-2 border-border/60 pl-2 text-muted-foreground"
      {...props}
    />
  ),
  code: ({ className, children, ...rest }: React.ComponentProps<"code">) => {
    const isBlock = /language-/.test(className ?? "");
    if (isBlock) {
      return (
        <code className="block font-mono text-xs" {...rest}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded bg-foreground/[0.07] px-1 py-0.5 font-mono text-xs"
        {...rest}
      >
        {children}
      </code>
    );
  },
  pre: (props: React.ComponentProps<"pre">) => (
    <pre
      className="my-1.5 max-h-72 overflow-auto rounded-lg border border-border/40 bg-background/40 p-2 text-xs"
      {...props}
    />
  ),
  hr: () => <hr className="my-2 border-border/40" />,
  table: (props: React.ComponentProps<"table">) => (
    <table
      className="my-1.5 w-full border-collapse text-xs [&_td]:border [&_td]:border-border/40 [&_td]:px-1.5 [&_td]:py-0.5 [&_th]:border [&_th]:border-border/40 [&_th]:px-1.5 [&_th]:py-0.5"
      {...props}
    />
  ),
};

export function MarkdownView({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <Markdown components={components}>{content}</Markdown>
    </div>
  );
}

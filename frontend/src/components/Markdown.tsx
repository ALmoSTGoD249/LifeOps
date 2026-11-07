import ReactMarkdown from "react-markdown";

/** Raw HTML in the source is ignored by react-markdown, and unsafe URL schemes are stripped. */
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown components={{ a: ({ href, children: c }) => <a href={href} target="_blank" rel="noopener noreferrer nofollow">{c}</a> }}>{children}</ReactMarkdown>
    </div>
  );
}

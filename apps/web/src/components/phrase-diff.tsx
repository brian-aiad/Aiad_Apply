import { wordDiff } from "@/lib/word-diff";
import { highlightAddedKeywords } from "@/lib/keyword-diff";

export function PhraseDiff({ before, after, side, addedTerms = [] }: { before: string; after: string; side: "before" | "after"; addedTerms?: readonly string[] }) {
  const parts = highlightAddedKeywords(wordDiff(before, after)[side], side === "after" ? addedTerms : []);
  return <>{parts.map((part, index) => part.keyword ? <mark className="review-keyword-highlight" title={`Keyword added: ${part.keyword}`} key={index}>{part.text}</mark> : part.changed && part.text.trim() ? side === "before" ? <del key={index}>{part.text}</del> : <ins key={index}>{part.text}</ins> : <span key={index}>{part.text}</span>)}</>;
}

export function CompactPhraseDiff({ before, after }: { before: string; after: string }) {
  const diff = wordDiff(before, after);
  const changed = (side: "before" | "after") =>
    diff[side]
      .filter((part) => part.changed && part.text.trim())
      .map((part) => part.text.trim())
      .join(" ");
  return (
    <div className="compact-phrase-diff">
      <div><span>From</span><del>{changed("before") || "—"}</del></div>
      <div><span>To</span><ins>{changed("after") || "—"}</ins></div>
    </div>
  );
}

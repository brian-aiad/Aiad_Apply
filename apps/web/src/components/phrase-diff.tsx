import { wordDiff } from "@/lib/word-diff";

export function PhraseDiff({ before, after, side }: { before: string; after: string; side: "before" | "after" }) {
  return <>{wordDiff(before, after)[side].map((part, index) => part.changed && part.text.trim() ? side === "before" ? <del key={index}>{part.text}</del> : <ins key={index}>{part.text}</ins> : <span key={index}>{part.text}</span>)}</>;
}

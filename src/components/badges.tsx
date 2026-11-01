import { badgeColors } from "@/lib/brand";

/**
 * A project's tags as badges — in its brand colour when it has one, so a
 * project's badges carry its own identity rather than the page's; in the
 * page's hairline grey when it has none.
 */
export default function Badges({
  tags,
  brand,
  className = "",
  style,
}: {
  tags: readonly string[];
  brand?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (tags.length === 0) return null;
  const colors = brand ? badgeColors(brand) : undefined;

  return (
    <ul className={`flex flex-wrap gap-1.5 ${className}`} style={style}>
      {tags.map((tag) => (
        <li
          key={tag}
          style={colors}
          className={`meta rounded-full border px-2 py-1 ${
            colors ? "" : "border-line text-dim"
          }`}
        >
          {tag}
        </li>
      ))}
    </ul>
  );
}

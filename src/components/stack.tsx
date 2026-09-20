import { skillGroups } from "@/content/site";

/**
 * A written manifest rather than a wall of logos. Logo grids read as junior and
 * say nothing about depth; a grouped list is faster to scan and honest.
 *
 * The items sit as chips on a phone and as a column from sm up. Twenty
 * skills one-per-line is two screens of scrolling past single words, and
 * the shape of the list — how much there is of each — is the point.
 */
export default function Stack() {
  return (
    <section className="px-6 pb-24 md:px-12">
      <div className="mx-auto max-w-350">
        <h2 className="meta border-b border-line pb-4 text-dim">STACK</h2>

        <dl className="mt-10 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
          {skillGroups.map((group) => (
            <div key={group.label} className="bg-canvas p-6">
              <dt className="meta text-accent">{group.label}</dt>
              <dd>
                <ul className="mt-4 flex flex-wrap gap-1.5 sm:block sm:space-y-2">
                  {group.items.map((item) => (
                    <li
                      key={item}
                      className="rounded-full border border-line px-2.5 py-1 text-sm text-dim sm:rounded-none sm:border-0 sm:px-0 sm:py-0"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

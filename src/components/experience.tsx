import { experiences } from "@/content/site";

export default function Experience() {
  return (
    <section className="px-6 pb-24 md:px-12">
      <div className="mx-auto max-w-350">
        <div className="flex items-baseline justify-between border-b border-line pb-4">
          <h2 className="meta text-dim">ROLES & EDUCATION</h2>
          <span className="meta text-dim">
            {experiences.length.toString().padStart(3, "0")} ENTRIES
          </span>
        </div>

        <ol className="mt-10 grid gap-px bg-line md:grid-cols-2">
          {experiences.map((entry) => (
            <li
              key={`${entry.role}-${entry.period}`}
              className="bg-canvas p-6 md:p-8"
            >
              <p className="meta text-accent">{entry.period}</p>

              <h3 className="mt-3 text-xl font-medium tracking-tight">
                {entry.role}
              </h3>
              <p className="mt-1 text-sm text-dim">{entry.organisation}</p>

              <p className="mt-4 max-w-prose text-sm leading-relaxed text-dim">
                {entry.description}
              </p>

              <ul className="mt-5 space-y-1.5">
                {entry.achievements.map((achievement) => (
                  <li
                    key={achievement}
                    className="flex gap-2.5 text-sm text-dim"
                  >
                    <span aria-hidden className="text-accent">
                      —
                    </span>
                    {achievement}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

import Image from "next/image";

import { certifications } from "@/content/site";

export default function Certifications() {
  return (
    <section className="px-6 pb-24 md:px-12">
      <div className="mx-auto max-w-350">
        <div className="flex items-baseline justify-between border-b border-line pb-4">
          <h2 className="meta text-dim">CREDENTIALS</h2>
          <span className="meta text-dim">
            {certifications.length.toString().padStart(3, "0")} TOTAL
          </span>
        </div>

        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {certifications.map((certification) => (
            <li
              key={certification.title}
              className="group overflow-hidden rounded-lg border border-line bg-surface-1 transition-colors hover:border-accent"
            >
              <div className="relative aspect-4/3 w-full overflow-hidden bg-surface-2">
                <Image
                  src={certification.image}
                  alt={`${certification.title} certificate`}
                  fill
                  sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
              </div>

              <div className="p-5">
                <p className="meta text-accent">{certification.date}</p>
                <h3 className="mt-2 text-base font-medium leading-snug tracking-tight">
                  {certification.title}
                </h3>
                <p className="mt-1 text-sm text-dim">{certification.issuer}</p>

                <ul className="mt-4 flex flex-wrap gap-1.5">
                  {certification.skills.map((skill) => (
                    <li
                      key={skill}
                      className="meta rounded-full border border-line px-2 py-1 text-dim"
                    >
                      {skill}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

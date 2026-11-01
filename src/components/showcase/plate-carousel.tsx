"use client";

import Carousel from "@/components/showcase/carousel";
import Plate from "@/components/showcase/plate";
import type { Project } from "@/content/site";

/** A row of plates you scroll through. */
export default function PlateCarousel({
  projects,
  label,
  showBlurb = false,
  onSelect,
  selected = null,
}: {
  projects: readonly Project[];
  label: string;
  /** Print the description under each plate — for work a picture alone
   *  cannot explain, like an automation's canvas. */
  showBlurb?: boolean;
  onSelect?: (project: Project) => void;
  selected?: Project | null;
}) {
  return (
    <Carousel label={label}>
      {projects.map((project) => (
        <Plate
          key={project.slug}
          project={project}
          showBlurb={showBlurb}
          onSelect={onSelect}
          selected={selected?.slug === project.slug}
          className={`shrink-0 snap-start ${
            showBlurb ? "w-[19rem] sm:w-[22rem]" : "w-[17rem] sm:w-[19rem]"
          }`}
          sizes={showBlurb ? "22rem" : "19rem"}
        />
      ))}
    </Carousel>
  );
}

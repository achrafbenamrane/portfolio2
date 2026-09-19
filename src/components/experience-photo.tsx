import ZoomableImage from "@/components/zoomable-image";
import type { Experience } from "@/content/site";

/** A photograph from the time, framed and captioned, that opens large. */
export default function ExperiencePhoto({
  image,
  className = "",
}: {
  image: NonNullable<Experience["image"]>;
  className?: string;
}) {
  return (
    <figure className={className}>
      <div className="rounded-xl bg-canvas p-1.5 shadow-[0_24px_48px_-28px_rgba(24,38,49,0.45)] ring-1 ring-line">
        <ZoomableImage
          image={image}
          alt={image.alt}
          label={`View larger: ${image.caption}`}
          sizes="15rem"
          className="rounded-lg"
          imageClassName="transition-transform duration-700 group-hover:scale-[1.03]"
        />
        <figcaption className="meta px-1 pb-1 pt-2.5 text-dim">
          {image.caption}
        </figcaption>
      </div>
    </figure>
  );
}

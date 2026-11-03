import type { Metadata } from "next";

import PageHeader from "@/components/page-header";
import WorkGallery from "@/components/work-gallery";
import { projects } from "@/content/site";

export const metadata: Metadata = {
  title: "Projects",
  description: `${projects.length} projects across web, mobile, computer vision and brand identity, designed, built and shipped by Wolfexo.`,
};

export default function ProjectsPage() {
  return (
    <>
      <PageHeader
        index="03"
        label="Projects"
        title="Projects"
        outline="that ship"
        description="Web, mobile, computer vision and brand identity — every project designed, built and shipped by Wolfexo."
      />
      <WorkGallery />
    </>
  );
}

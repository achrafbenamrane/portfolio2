import type { Metadata } from "next";

import Experience from "@/components/experience";
import PageHeader from "@/components/page-header";
import Stack from "@/components/stack";
import { experiences } from "@/content/site";

export const metadata: Metadata = {
  title: "Experience",
  description:
    "My track record: a full-stack role, a security internship, a Master's degree and co-founded products.",
};

export default function ExperiencePage() {
  return (
    <>
      <PageHeader
        index="01.1"
        label="About me — Track record"
        title="The track record"
        outline="behind the work"
        description="One person across every role: a full-stack position, a security internship, a Master's degree and the products I co-founded along the way."
        meta={{
          label: "ROLES & EDUCATION",
          value: `${experiences.length.toString().padStart(3, "0")} ENTRIES`,
        }}
      />
      <Experience />
      <Stack />
    </>
  );
}

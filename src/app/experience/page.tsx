import type { Metadata } from "next";

import Experience from "@/components/experience";
import PageHeader from "@/components/page-header";
import Stack from "@/components/stack";
import { experiences } from "@/content/site";

export const metadata: Metadata = {
  title: "Experience",
  description:
    "A full-stack role, a security internship, university study and co-founded projects.",
};

export default function ExperiencePage() {
  return (
    <>
      <PageHeader
        index="02 / EXPERIENCE"
        title="Experience"
        description="A full-stack role, a security internship, university study and the projects co-founded along the way."
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

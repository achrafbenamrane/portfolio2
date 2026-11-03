import type { Metadata } from "next";

import Experience from "@/components/experience";
import PageHeader from "@/components/page-header";
import Stack from "@/components/stack";
import { experiences } from "@/content/site";

export const metadata: Metadata = {
  title: "Experience",
  description:
    "The track record behind AXIOM: a full-stack role, a security internship, a Master's degree and co-founded products.",
};

export default function ExperiencePage() {
  return (
    <>
      <PageHeader
        index="01.1"
        label="About us — Track record"
        title="The track record"
        outline="behind AXIOM"
        description="The track record behind AXIOM: one founder across every role. A full-stack position, a security internship, a Master's degree and the products co-founded along the way."
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

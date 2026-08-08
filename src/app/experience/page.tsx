import type { Metadata } from "next";

import Experience from "@/components/experience";
import PageHeader from "@/components/page-header";
import Stack from "@/components/stack";

export const metadata: Metadata = {
  title: "Experience",
  description:
    "Freelance work, university study, community leadership and co-founded projects.",
};

export default function ExperiencePage() {
  return (
    <>
      <PageHeader
        index="02 / EXPERIENCE"
        title="Experience"
        description="Freelance practice, university study, community leadership and co-founded projects."
      />
      <Experience />
      <Stack />
    </>
  );
}

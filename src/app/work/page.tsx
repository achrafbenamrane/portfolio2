import type { Metadata } from "next";

import PageHeader from "@/components/page-header";
import WorkIndex from "@/components/work-index";
import { projects } from "@/content/site";

export const metadata: Metadata = {
  title: "Work",
  description: `${projects.length} selected projects across web, mobile, desktop, automation and design.`,
};

export default function WorkPage() {
  return (
    <>
      <PageHeader
        index="01 / WORK"
        title="Work"
        description="Web, mobile, desktop, automation and design — filtered by discipline."
      />
      <WorkIndex />
    </>
  );
}

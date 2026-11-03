import type { Metadata } from "next";

import Contact from "@/components/contact";
import PageHeader from "@/components/page-header";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Start a project with AXIOM: email or phone, and a reply within one working day.",
};

export default function ContactPage() {
  return (
    <>
      <PageHeader
        index="06"
        label="Contact"
        title="Let's build"
        outline="something real"
        description="Tell us about your project. You'll hear back within one working day, from the person who will build it."
      />
      <Contact />
    </>
  );
}

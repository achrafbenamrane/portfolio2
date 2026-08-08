import type { Metadata } from "next";

import Contact from "@/components/contact";
import PageHeader from "@/components/page-header";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Email, phone and social links — plus a downloadable CV. Based in Annaba, Algeria.",
};

export default function ContactPage() {
  return (
    <>
      <PageHeader
        index="04 / CONTACT"
        title="Contact"
        description="Open to freelance and full-time work. The fastest route is email."
      />
      <Contact />
    </>
  );
}

import type { Metadata } from "next";

import Certifications from "@/components/certifications";
import PageHeader from "@/components/page-header";

export const metadata: Metadata = {
  title: "Certifications",
  description:
    "Degrees, automation credentials and community recognition, with certificates.",
};

export default function CertificationsPage() {
  return (
    <>
      <PageHeader
        index="03 / CERTIFICATIONS"
        title="Certifications"
        description="Degrees, automation credentials and community recognition."
      />
      <Certifications />
    </>
  );
}

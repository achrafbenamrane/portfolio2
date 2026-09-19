import type { Metadata } from "next";

import Certifications from "@/components/certifications";
import PageHeader from "@/components/page-header";
import { certifications } from "@/content/site";

export const metadata: Metadata = {
  title: "Certifications",
  description:
    "A degree, a red-team credential, automation certifications and community recognition, with the certificates themselves.",
};

export default function CertificationsPage() {
  return (
    <>
      <PageHeader
        index="03 / CERTIFICATIONS"
        title="Certifications"
        description="A degree, a red-team credential, automation certifications and community recognition — the documents themselves."
        meta={{
          label: "CREDENTIALS",
          value: `${certifications.length.toString().padStart(3, "0")} TOTAL`,
        }}
      />
      <Certifications />
    </>
  );
}

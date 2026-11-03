import type { Metadata } from "next";

import Certifications from "@/components/certifications";
import PageHeader from "@/components/page-header";
import { certifications } from "@/content/site";

export const metadata: Metadata = {
  title: "Certifications",
  description:
    "The credentials behind AXIOM: a degree, a red-team credential, automation certifications and community recognition.",
};

export default function CertificationsPage() {
  return (
    <>
      <PageHeader
        index="01.2"
        label="About us — Credentials"
        title="The credentials"
        outline="behind AXIOM"
        description="The credentials behind AXIOM: a degree, a red-team credential, automation certifications and community recognition — the documents themselves."
        meta={{
          label: "CREDENTIALS",
          value: `${certifications.length.toString().padStart(3, "0")} TOTAL`,
        }}
      />
      <Certifications />
    </>
  );
}

import CertificateBook from "@/components/certificate-book";
import {
  certificationKinds,
  certifications,
  type Certification,
} from "@/content/site";

const KINDS = Object.keys(certificationKinds) as Certification["kind"][];

/** Page order: by kind, in the order kinds are declared, numbered so. */
const ORDERED = KINDS.flatMap((kind) =>
  certifications.filter((c) => c.kind === kind),
).map((certification, index) => ({
  ...certification,
  number: String(index + 1).padStart(3, "0"),
}));

export default function Certifications() {
  return (
    <section className="px-6 py-16 md:px-12 md:py-20" aria-label="Certificates">
      <CertificateBook entries={ORDERED} />
    </section>
  );
}

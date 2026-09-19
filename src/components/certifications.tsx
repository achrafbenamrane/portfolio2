import CertificateBook from "@/components/certificate-book";
import { certifications } from "@/content/site";

/** Page order: newest first, by issue date, and numbered so. */
const ORDERED = [...certifications]
  .sort((a, b) => b.issued.localeCompare(a.issued))
  .map((certification, index) => ({
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

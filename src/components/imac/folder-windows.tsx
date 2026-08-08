"use client";

import Image from "next/image";

import {
  certifications,
  experiences,
  projects,
  site,
} from "@/content/site";
import { useAimTarget, useScrollSurface } from "./desktop-pointer";

/**
 * The four folders, opened as windows inside the machine rather than as page
 * navigations. Each still offers a link out to the real route, so the desktop
 * is a browsable preview and not a dead end.
 */

export interface FolderSpec {
  id: string;
  label: string;
  href: string;
  count: number;
  hint: string;
}

export default function FolderWindow({
  folder,
  onClose,
  onOpenPage,
}: {
  folder: FolderSpec;
  onClose: () => void;
  onOpenPage: (href: string) => void;
}) {
  const closeRef = useAimTarget<HTMLButtonElement>("fw:close", onClose);
  const pageRef = useAimTarget<HTMLButtonElement>("fw:page", () =>
    onOpenPage(folder.href),
  );
  const bodyRef = useScrollSurface<HTMLDivElement>();

  return (
    <div className="fw">
      <header className="fw-bar">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="fw-close"
          aria-label="Close folder"
        >
          <span />
        </button>
        <h3 className="fw-title">{folder.label}</h3>
        <span className="fw-count">
          {folder.count} {folder.hint}
        </span>
        <button
          ref={pageRef}
          type="button"
          onClick={() => onOpenPage(folder.href)}
          className="fw-page"
        >
          Open page ↗
        </button>
      </header>

      <div ref={bodyRef} className="fw-body">
        {folder.id === "works" && <Works />}
        {folder.id === "experiences" && <Experiences />}
        {folder.id === "certifications" && <Certifications />}
        {folder.id === "contacts" && <Contacts />}
      </div>
    </div>
  );
}

function Works() {
  return (
    <ul className="fw-list">
      {projects.map((project, index) => (
        <WorkRow key={project.slug} project={project} index={index} />
      ))}
    </ul>
  );
}

function WorkRow({
  project,
  index,
}: {
  project: (typeof projects)[number];
  index: number;
}) {
  const open = () => {
    if (project.href) window.open(project.href, "_blank", "noopener");
  };
  const ref = useAimTarget<HTMLButtonElement>(`work:${project.slug}`, open);

  return (
    <li>
      <button ref={ref} type="button" onClick={open} className="fw-row">
        <span className="fw-num">{String(index + 1).padStart(3, "0")}</span>
        <span className="fw-thumb">
          <Image
            src={project.images[0]}
            alt=""
            width={72}
            height={44}
            unoptimized={project.images[0].startsWith("http")}
          />
        </span>
        <span className="fw-name">
          {project.title}
          <em>{project.category}</em>
        </span>
        <span className="fw-year">{project.year}</span>
        <span className="fw-go">{project.href ? "↗" : "—"}</span>
      </button>
    </li>
  );
}

function Experiences() {
  return (
    <ol className="fw-timeline">
      {experiences.map((entry) => (
        <li key={`${entry.role}-${entry.period}`}>
          <p className="fw-period">{entry.period}</p>
          <p className="fw-role">{entry.role}</p>
          <p className="fw-org">{entry.organisation}</p>
          <p className="fw-desc">{entry.description}</p>
        </li>
      ))}
    </ol>
  );
}

function Certifications() {
  return (
    <ul className="fw-certs">
      {certifications.map((certification) => (
        <li key={certification.title}>
          <span className="fw-cert-img">
            <Image
              src={certification.image}
              alt={certification.title}
              width={220}
              height={150}
            />
          </span>
          <p className="fw-cert-title">{certification.title}</p>
          <p className="fw-cert-issuer">
            {certification.issuer} · {certification.date}
          </p>
        </li>
      ))}
    </ul>
  );
}

function Contacts() {
  return (
    <div className="fw-contacts">
      <ContactRow label="EMAIL" value={site.email} href={`mailto:${site.email}`} />
      <ContactRow label="PHONE" value={site.phone} href={site.phoneHref} />
      <ContactRow label="LOCATION" value={site.location} />
      <ContactRow label="RÉSUMÉ" value="Download CV (PDF)" href={site.cvHref} />
      {site.links.map((link) => (
        <ContactRow
          key={link.label}
          label={link.label.toUpperCase()}
          value={link.href.replace(/^https?:\/\//, "")}
          href={link.href}
        />
      ))}
    </div>
  );
}

function ContactRow({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const open = () => {
    if (href) window.open(href, "_blank", "noopener");
  };
  const ref = useAimTarget<HTMLButtonElement>(`contact:${label}`, open);

  return (
    <div className="fw-contact">
      <span className="fw-contact-label">{label}</span>
      {href ? (
        <button ref={ref} type="button" onClick={open} className="fw-contact-value">
          {value} <span aria-hidden>↗</span>
        </button>
      ) : (
        <span className="fw-contact-value is-static">{value}</span>
      )}
    </div>
  );
}

"use client";

import { Document, Font, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { Resume } from "@/lib/agent/schemas";

// Don't break words across lines with hyphens.
Font.registerHyphenationCallback((word) => [word]);

const ACCENT = "#4338ca";

const s = StyleSheet.create({
  page: { paddingVertical: 36, paddingHorizontal: 42, fontFamily: "Helvetica", fontSize: 10, lineHeight: 1.4, color: "#1e293b" },
  name: { fontSize: 20, fontFamily: "Helvetica-Bold", textAlign: "center", color: "#0f172a" },
  headline: { fontSize: 11, textAlign: "center", color: "#475569", marginTop: 2 },
  contact: { fontSize: 9, textAlign: "center", color: "#64748b", marginTop: 4 },
  section: { marginTop: 12 },
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: ACCENT,
    borderBottomWidth: 0.75,
    borderBottomColor: "#cbd5e1",
    paddingBottom: 2,
    marginBottom: 5,
  },
  bold: { fontFamily: "Helvetica-Bold" },
  entry: { marginBottom: 6 },
  entryHead: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  entryTitle: { fontFamily: "Helvetica-Bold", color: "#0f172a", flexShrink: 1 },
  meta: { fontSize: 9, color: "#64748b" },
  bullet: { flexDirection: "row", marginTop: 1.5 },
  bulletDot: { width: 10 },
  bulletText: { flex: 1 },
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle} minPresenceAhead={30}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Bullets({ items }: { items: string[] }) {
  return items.map((item, i) => (
    <View key={i} style={s.bullet} wrap={false}>
      <Text style={s.bulletDot}>•</Text>
      <Text style={s.bulletText}>{item}</Text>
    </View>
  ));
}

function Entry({ title, meta, bullets }: { title: string; meta: string; bullets: string[] }) {
  return (
    <View style={s.entry}>
      <View style={s.entryHead} minPresenceAhead={24}>
        <Text style={s.entryTitle}>{title}</Text>
        {meta ? <Text style={s.meta}>{meta}</Text> : null}
      </View>
      <Bullets items={bullets} />
    </View>
  );
}

function ResumeDocument({ resume }: { resume: Resume }) {
  return (
    <Document title={`${resume.name} CV`} author={resume.name}>
      <Page size="A4" style={s.page}>
        <Text style={s.name}>{resume.name}</Text>
        {resume.headline ? <Text style={s.headline}>{resume.headline}</Text> : null}
        {resume.contact.length > 0 ? <Text style={s.contact}>{resume.contact.join("  |  ")}</Text> : null}

        {resume.summary ? (
          <Section title="Summary">
            <Text>{resume.summary}</Text>
          </Section>
        ) : null}

        {resume.skills.length > 0 ? (
          <Section title="Skills">
            {resume.skills.map((group) => (
              <Text key={group.category} style={{ marginBottom: 1.5 }}>
                <Text style={s.bold}>{group.category}: </Text>
                {group.items.join(", ")}
              </Text>
            ))}
          </Section>
        ) : null}

        {resume.experience.length > 0 ? (
          <Section title="Experience">
            {resume.experience.map((job, i) => (
              <Entry
                key={i}
                title={[job.role, job.company].filter(Boolean).join(", ")}
                meta={[job.location, job.period].filter(Boolean).join("  ·  ")}
                bullets={job.bullets}
              />
            ))}
          </Section>
        ) : null}

        {resume.projects.length > 0 ? (
          <Section title="Projects">
            {resume.projects.map((p, i) => (
              <Entry key={i} title={p.name} meta={p.period} bullets={p.bullets} />
            ))}
          </Section>
        ) : null}

        {resume.education.length > 0 ? (
          <Section title="Education">
            {resume.education.map((e, i) => (
              <Entry
                key={i}
                title={[e.degree, e.institution].filter(Boolean).join(", ")}
                meta={e.period}
                bullets={e.details ? [e.details] : []}
              />
            ))}
          </Section>
        ) : null}

        {resume.certifications.length > 0 ? (
          <Section title="Certifications">
            <Bullets items={resume.certifications} />
          </Section>
        ) : null}

        {resume.otherSections.map((section, i) => (
          <Section key={i} title={section.title}>
            <Bullets items={section.items} />
          </Section>
        ))}
      </Page>
    </Document>
  );
}

export async function downloadResumePdf(resume: Resume) {
  const blob = await pdf(<ResumeDocument resume={resume} />).toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${resume.name.trim().replace(/[^\w-]+/g, "_") || "resume"}_CV.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

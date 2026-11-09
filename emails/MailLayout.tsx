import type { CSSProperties, ReactNode } from "react";
import { Body, Button, Container, Head, Html, Link, Preview, Section, Text } from "react-email";

// Next Session's gold on paper, as on the site.
const INK = "#1a1511";
const GOLD = "#835200";

export function MailLayout({ preview, children }: { preview: string; children: ReactNode }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={page}>
        <Container style={card}>
          <Text style={brand}>Next Session</Text>
          {children}
        </Container>
      </Body>
    </Html>
  );
}

export function Paragraph({ children }: { children: ReactNode }) {
  return <Text style={paragraph}>{children}</Text>;
}

export function Action({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Section style={actionRow}>
      <Button href={href} style={button}>
        {children}
      </Button>
    </Section>
  );
}

export function Footnote({ children }: { children: ReactNode }) {
  return <Text style={footnote}>{children}</Text>;
}

export function InlineLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} style={{ color: GOLD }}>
      {children}
    </Link>
  );
}

const page: CSSProperties = {
  margin: 0,
  padding: "24px 0",
  backgroundColor: "#f2e7ce",
  color: INK,
  fontFamily: "'Trebuchet MS', Tahoma, Verdana, sans-serif",
};

const card: CSSProperties = {
  maxWidth: "560px",
  backgroundColor: "#fbf5e5",
  padding: "28px 32px",
};

const brand: CSSProperties = {
  margin: "0 0 18px",
  color: GOLD,
  fontFamily: "'Courier New', monospace",
  fontSize: "12px",
  fontWeight: "bold",
  letterSpacing: "3px",
  textTransform: "uppercase",
};

const paragraph: CSSProperties = { margin: "0 0 14px", fontSize: "16px", lineHeight: "160%" };

const actionRow: CSSProperties = { margin: "22px 0" };

const button: CSSProperties = {
  padding: "14px 24px",
  borderRadius: "10px",
  backgroundColor: "#c5953b",
  color: "#221811",
  fontSize: "16px",
  textDecoration: "none",
};

const footnote: CSSProperties = { margin: 0, fontSize: "13px", lineHeight: "160%" };

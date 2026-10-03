import imprint from "../../../docs/legal/imprint.md?raw";
import privacy from "../../../docs/legal/privacy.md?raw";
import terms from "../../../docs/legal/terms.md?raw";
import { legalContact } from "../../lib/env";
import { PageShell } from "../../ui/PageShell";
import { LegalArticle } from "./LegalArticle";
import { parseLegalDocument } from "./legalDocument";
import { LEGAL_VERSIONS } from "./legalVersions";

const sources = { terms, privacy, imprint };

export type LegalPageKey = keyof typeof sources;

export function LegalPage({ page }: { page: LegalPageKey }) {
  const legal = legalContact();
  const legalDocument = parseLegalDocument(sources[page], {
    EFFECTIVE_DATE: LEGAL_VERSIONS.effective,
    CONTROLLER_ADDRESS: legal.controllerAddress,
    CONTACT_EMAIL: legal.contactEmail,
  });
  return (
    <PageShell>
      <LegalArticle legalDocument={legalDocument} />
    </PageShell>
  );
}

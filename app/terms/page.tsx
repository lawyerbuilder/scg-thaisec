export const metadata = {
  title: "Terms of Use",
};

export default function TermsPage() {
  return (
    <div className="container py-16 max-w-3xl">
      <p className="eyebrow mb-2">Terms</p>
      <h1 className="text-3xl font-semibold tracking-tight">Terms of Use</h1>

      <div className="mt-8 prose prose-sm max-w-none text-foreground/90 leading-relaxed space-y-4">
        <p>
          <strong className="text-foreground">SCG ThaiSEC is intended for the internal
          use of SCG personnel only.</strong> By accessing this site you confirm you are
          authorised to use it for that purpose.
        </p>

        <h2 className="text-lg font-semibold tracking-tight mt-6">No legal advice</h2>
        <p>
          The content of this site is published for reference and research only and is not
          a substitute for professional legal advice. Nothing on this site creates an
          attorney–client relationship. Always consult qualified counsel and the original
          sources before acting on any matter.
        </p>

        <h2 className="text-lg font-semibold tracking-tight mt-6">Source attribution</h2>
        <p>
          The regulations indexed on this site originate from public sources at
          capital.sec.or.th and publish.sec.or.th. Every detail page links back to the
          canonical source. Where there is any conflict between text shown here and the
          official PDF, the official PDF prevails.
        </p>

        <h2 className="text-lg font-semibold tracking-tight mt-6">No warranty; no liability</h2>
        <p>
          The site, the data and the software are provided &ldquo;as is&rdquo; without
          warranty of any kind, express or implied. To the maximum extent permitted by law,
          neither SCG nor any contributor shall be liable for any direct, indirect,
          incidental, special, consequential or punitive damages arising from your use of,
          or inability to use, this site.
        </p>

        <h2 className="text-lg font-semibold tracking-tight mt-6">Not affiliated</h2>
        <p>
          SCG ThaiSEC is not endorsed by, affiliated with, or sponsored by the Securities
          and Exchange Commission, Thailand. &ldquo;SEC&rdquo; and related marks belong to
          their respective owners.
        </p>

        <h2 className="text-lg font-semibold tracking-tight mt-6">Open source</h2>
        <p>
          The source code for this project is published at{" "}
          <a
            href="https://github.com/lawyerbuilder/scg-thaisec"
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary hover:underline"
          >
            github.com/lawyerbuilder/scg-thaisec
          </a>{" "}
          under the project&apos;s open-source licence.
        </p>
      </div>
    </div>
  );
}

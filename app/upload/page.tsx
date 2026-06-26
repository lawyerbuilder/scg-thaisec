import { UploadForm } from "@/components/upload-form";

export const metadata = {
  title: "Upload document · SCG ThaiSEC",
};

export default function UploadPage() {
  return (
    <div className="container py-12 max-w-2xl">
      <p className="eyebrow">Admin</p>
      <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight">
        Upload a document
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Drop a PDF, DOCX, TXT, or MD file. We extract the text, save it as a
        source document, and immediately ask the AI to draft FAQs grounded in
        the content. Drafts go to <span className="font-medium text-foreground">/faq</span> for
        review.
      </p>

      <div className="mt-4 rounded-md border border-amber-200 bg-amber-50/60 px-4 py-3 text-[12px] text-amber-900">
        <strong>Heads up:</strong> upload + verify are open to everyone right now.
        Clerk-gated allowlist coming next — only the emails on the allowlist will
        be able to access this page in the locked-down build.
      </div>

      <div className="mt-8">
        <UploadForm />
      </div>
    </div>
  );
}

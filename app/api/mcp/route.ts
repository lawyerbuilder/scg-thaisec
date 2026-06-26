import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { sql } from "drizzle-orm";
import {
  searchRegulations,
  countRegulations,
  listRegulationTypes,
  getRegulationById,
  getRelatedRegulations,
  listRecentRegulations,
} from "@/lib/search";
import {
  listFaqs,
  getFaqById,
  listFaqTopics,
  verifyFaq,
  rejectFaq,
  updateFaqContent,
} from "@/lib/faqs";
import { generateAndSaveFaqs } from "@/lib/faq-generator";
import { db } from "@/lib/db";
import { containsThai } from "@/lib/utils";

const SITE = process.env.THAISEC_SITE_URL ?? "https://scg-thaisec.vercel.app";

function detailUrl(id: number): string {
  return `${SITE}/regulations/${id}`;
}
function faqUrl(id: number): string {
  return `${SITE}/faq/${id}`;
}
function stripMarkTags(text: string): string {
  return text.replace(/<mark>/g, "**").replace(/<\/mark>/g, "**");
}

/**
 * TODO(auth): all write tools below currently accept any caller. When Clerk
 * is wired, derive the email from a session token passed via MCP request
 * headers (mcp-handler exposes this) and check it against an env-configured
 * allowlist. Until then, every write tool just stamps 'mcp@scg-thaisec.local'
 * as the actor and proceeds.
 */
async function getMcpCallerEmail(): Promise<string> {
  return "mcp@scg-thaisec.local";
}

function jsonResult(payload: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    isError,
  };
}

const handler = createMcpHandler(
  (server) => {
    // =====================================================================
    // REGULATIONS — read tools (existing)
    // =====================================================================

    server.tool(
      "search_regulations",
      "Full-text search across the SCG ThaiSEC library of Thai SEC notifications, " +
        "regulations, and circulars indexed from capital.sec.or.th. Returns matching " +
        "regulations with highlighted snippets and source attribution. Use `type` to " +
        "filter by category slug (call `list_regulation_types` first to see options). " +
        "The search accepts both English and Thai queries.",
      {
        query: z
          .string()
          .describe(
            'Search query in English or Thai — e.g. "digital asset license", "ประกาศ กลต", "asset management"'
          ),
        type: z
          .string()
          .optional()
          .describe('Optional category slug (e.g. "sec-notification", "agm-playbook")'),
        limit: z.number().int().min(1).max(20).optional().describe("1-20, default 10"),
      },
      async ({ query, type, limit }) => {
        const max = limit ?? 10;
        const [results, total] = await Promise.all([
          searchRegulations({ query, typeSlug: type, limit: max }),
          countRegulations({ query, typeSlug: type }),
        ]);
        return jsonResult({
          query,
          type: type ?? null,
          total,
          returned: results.length,
          results: results.map((r) => ({
            id: r.id,
            titleEn: r.titleEn,
            titleTh: r.titleTh,
            snippet: stripMarkTags(r.bodySnippet ?? ""),
            regNumber: r.regNumber,
            documentType: r.documentType,
            subject: r.subject,
            publicationDate: r.publicationDate,
            effectiveDate: r.effectiveDate,
            status: r.status,
            category: r.regulationTypeName,
            categorySlug: r.regulationTypeSlug,
            sourceUrl: r.sourceUrl,
            pdfUrl: r.pdfUrl,
            detailUrl: detailUrl(r.id),
            rank: Number(r.rank.toFixed(4)),
          })),
        });
      }
    );

    server.tool(
      "get_regulation",
      "Fetch the full text and metadata of a specific regulation by ID. Returns both " +
        "Thai and English text where available, plus links to the canonical PDF.",
      { id: z.number().int().describe("Regulation ID from search_regulations") },
      async ({ id }) => {
        const reg = await getRegulationById(id);
        if (!reg) {
          return jsonResult({ error: "Regulation not found", id }, true);
        }
        return jsonResult({
          id: reg.id,
          docId: reg.docId,
          titleEn: reg.titleEn,
          titleTh: reg.titleTh,
          regNumber: reg.regNumber,
          documentType: reg.documentType,
          subject: reg.subject,
          publicationDate: reg.publicationDate,
          effectiveDate: reg.effectiveDate,
          status: reg.status,
          category: reg.regulationTypeName,
          categorySlug: reg.regulationTypeSlug,
          bodyEn: reg.bodyEn,
          bodyTh: reg.bodyTh,
          wordCount: reg.wordCount,
          sourceUrl: reg.sourceUrl,
          pdfUrl: reg.pdfUrl,
          pdfTextUrl: reg.pdfTextUrl,
          docUrl: reg.docUrl,
          detailUrl: detailUrl(reg.id),
        });
      }
    );

    server.tool(
      "list_regulation_types",
      "List every regulation category with counts and bilingual names. Call this " +
        "first if the user wants to filter or browse by category.",
      {},
      async () => {
        const types = await listRegulationTypes();
        return jsonResult({
          total: types.length,
          types: types.map((t) => ({
            slug: t.slug,
            nameEn: t.nameEn,
            nameTh: t.nameTh,
            descriptionEn: t.descriptionEn,
            descriptionTh: t.descriptionTh,
            category: t.category,
            regulationCount: t.regulationCount,
          })),
        });
      }
    );

    server.tool(
      "find_related_regulations",
      "Given a regulation ID, find others in the same category.",
      {
        regulation_id: z.number().int().describe("Reference regulation ID"),
        limit: z.number().int().min(1).max(15).optional().describe("1-15, default 6"),
      },
      async ({ regulation_id, limit }) => {
        const ref = await getRegulationById(regulation_id);
        if (!ref) return jsonResult({ error: "Regulation not found", id: regulation_id }, true);
        const related = await getRelatedRegulations(ref.regulationTypeId, regulation_id, limit ?? 6);
        return jsonResult({
          reference: {
            id: ref.id,
            titleEn: ref.titleEn,
            titleTh: ref.titleTh,
            category: ref.regulationTypeName,
          },
          related: related.map((r) => ({
            id: r.id,
            titleEn: r.titleEn,
            titleTh: r.titleTh,
            regNumber: r.regNumber,
            publicationDate: r.publicationDate,
            effectiveDate: r.effectiveDate,
            sourceUrl: r.sourceUrl,
            pdfUrl: r.pdfUrl,
            detailUrl: detailUrl(r.id),
          })),
        });
      }
    );

    server.tool(
      "list_recent_regulations",
      "List the most recently ingested regulations.",
      { limit: z.number().int().min(1).max(25).optional().describe("1-25, default 10") },
      async ({ limit }) => {
        const recent = await listRecentRegulations(limit ?? 10);
        return jsonResult({
          count: recent.length,
          regulations: recent.map((r) => ({
            id: r.id,
            titleEn: r.titleEn,
            titleTh: r.titleTh,
            regNumber: r.regNumber,
            documentType: r.documentType,
            subject: r.subject,
            publicationDate: r.publicationDate,
            category: r.regulationTypeName,
            categorySlug: r.regulationTypeSlug,
            sourceUrl: r.sourceUrl,
            pdfUrl: r.pdfUrl,
            detailUrl: detailUrl(r.id),
          })),
        });
      }
    );

    // =====================================================================
    // FAQS — read tools
    // =====================================================================

    server.tool(
      "search_faqs",
      "Full-text search across the FAQ corpus. FAQs are human- or AI-drafted " +
        "question/answer pairs grounded in source regulations and playbooks. " +
        "Each FAQ links back to its source regulation. Use this when a user asks " +
        "a question that might already have a vetted answer rather than searching " +
        "raw regulations. Filter by `status='verified'` to return only " +
        "SCG-Legal-approved answers.",
      {
        query: z.string().optional().describe("Search query in Thai or English"),
        status: z
          .enum(["draft", "verified", "rejected", "all"])
          .optional()
          .describe("Filter by lifecycle status (default 'all')"),
        topic: z
          .string()
          .optional()
          .describe('Filter by topic tag (e.g. "voting", "quorum", "pdpa")'),
        limit: z.number().int().min(1).max(25).optional().describe("1-25, default 10"),
      },
      async ({ query, status, topic, limit }) => {
        const rows = await listFaqs({
          query: query || undefined,
          status: status ?? "all",
          topic: topic || undefined,
          limit: limit ?? 10,
        });
        return jsonResult({
          query: query ?? null,
          status: status ?? "all",
          topic: topic ?? null,
          returned: rows.length,
          results: rows.map((f) => ({
            id: f.id,
            questionEn: f.questionEn,
            questionTh: f.questionTh,
            answerEn: f.answerEn,
            answerTh: f.answerTh,
            topic: f.topic,
            status: f.status,
            source: f.source,
            verifiedAt: f.verifiedAt,
            verifiedBy: f.verifiedBy,
            groundedInRegulationId: f.regulationId,
            groundedInRegulationTitle: f.regulationTitleEn ?? f.regulationTitleTh,
            faqUrl: faqUrl(f.id),
          })),
        });
      }
    );

    server.tool(
      "get_faq",
      "Fetch a single FAQ with full Q+A, source regulation reference, and audit fields.",
      { id: z.number().int().describe("FAQ ID from search_faqs") },
      async ({ id }) => {
        const faq = await getFaqById(id);
        if (!faq) return jsonResult({ error: "FAQ not found", id }, true);
        return jsonResult({
          id: faq.id,
          questionEn: faq.questionEn,
          questionTh: faq.questionTh,
          answerEn: faq.answerEn,
          answerTh: faq.answerTh,
          topic: faq.topic,
          status: faq.status,
          source: faq.source,
          model: faq.model,
          verifiedAt: faq.verifiedAt,
          verifiedBy: faq.verifiedBy,
          groundedInRegulationId: faq.regulationId,
          groundedInRegulationTitle: faq.regulationTitleEn ?? faq.regulationTitleTh,
          groundedInRegulationUrl: faq.regulationId
            ? detailUrl(faq.regulationId)
            : null,
          createdAt: faq.createdAt,
          updatedAt: faq.updatedAt,
          faqUrl: faqUrl(faq.id),
        });
      }
    );

    server.tool(
      "list_faq_topics",
      "List every topic tag in the FAQ corpus with counts. Useful for discovering " +
        "what slugs you can pass to `search_faqs`.",
      {},
      async () => {
        const topics = await listFaqTopics();
        return jsonResult({ total: topics.length, topics });
      }
    );

    // =====================================================================
    // ADMIN WRITE TOOLS — currently unprotected (TODO: Clerk allowlist)
    // =====================================================================

    server.tool(
      "create_document_from_text",
      "Admin tool. Create a new source document by pasting its text (no file upload). " +
        "Use this when you have content from email, Slack, or a system without file " +
        "access. Returns the new regulation_id which you can immediately pass to " +
        "`generate_faqs_for_regulation`.",
      {
        title: z.string().describe("Document title (bilingual handling is automatic)"),
        body: z.string().min(100).describe("Full document text (min 100 chars)"),
        original_filename: z
          .string()
          .optional()
          .describe('Optional source filename (e.g. "AGM_memo_2025.pdf") for audit trail'),
      },
      async ({ title, body, original_filename }) => {
        const actor = await getMcpCallerEmail();
        const looksThai = containsThai(body.slice(0, 500));
        const typeRow = await db.execute<{ id: number }>(
          sql`SELECT id FROM regulation_types WHERE slug = 'uploaded-document' LIMIT 1`
        );
        const typeId = typeRow.rows[0]?.id ?? null;
        const wordCount = body.split(/\s+/).filter(Boolean).length;

        const inserted = await db.execute<{ id: number }>(sql`
          INSERT INTO regulations (
            source_type, regulation_type_id,
            title_th, title_en, subject, document_type,
            body_th, body_en, word_count,
            uploaded_by, original_filename
          ) VALUES (
            'uploaded',
            ${typeId},
            ${title},
            ${looksThai ? null : title},
            ${"MCP Upload"},
            ${"Uploaded"},
            ${looksThai ? body : null},
            ${looksThai ? null : body},
            ${wordCount},
            ${actor},
            ${original_filename ?? null}
          )
          RETURNING id
        `);
        const regulationId = inserted.rows[0]?.id;
        if (!regulationId) return jsonResult({ error: "insert failed" }, true);

        return jsonResult({
          regulationId,
          title,
          languageDetected: looksThai ? "th" : "en",
          wordCount,
          detailUrl: detailUrl(regulationId),
          nextStep:
            "Call generate_faqs_for_regulation with this regulationId to draft Q&A from the content.",
        });
      }
    );

    server.tool(
      "generate_faqs_for_regulation",
      "Admin tool. Generate 3-5 draft FAQs from an existing regulation via Groq " +
        "(model: openai/gpt-oss-20b). Generated FAQs are saved with status='draft' " +
        "and source='ai_generated', linked to the regulation. Returns the new FAQ ids " +
        "so you can verify them one by one.",
      {
        regulation_id: z.number().int().describe("Source regulation ID"),
      },
      async ({ regulation_id }) => {
        const reg = await getRegulationById(regulation_id);
        if (!reg) return jsonResult({ error: "Regulation not found", id: regulation_id }, true);
        if (!reg.bodyTh && !reg.bodyEn) {
          return jsonResult(
            { error: "Regulation has no body text to generate FAQs from", id: regulation_id },
            true
          );
        }
        try {
          const result = await generateAndSaveFaqs({
            regulationId: reg.id,
            titleTh: reg.titleTh,
            titleEn: reg.titleEn,
            bodyTh: reg.bodyTh,
            bodyEn: reg.bodyEn,
          });
          return jsonResult({
            regulationId: reg.id,
            faqsGenerated: result.count,
            faqIds: result.faqIds,
            faqUrls: result.faqIds.map(faqUrl),
            nextStep:
              "Use get_faq on each id to review, then verify_faq or reject_faq to mark them.",
          });
        } catch (err) {
          return jsonResult(
            { error: `generation failed: ${(err as Error).message}` },
            true
          );
        }
      }
    );

    server.tool(
      "verify_faq",
      "Admin tool. Mark an FAQ as verified against its source regulation. Sets " +
        "status='verified', records who verified and when. Use after manually " +
        "reviewing the Q+A for accuracy.",
      { faq_id: z.number().int().describe("FAQ ID to verify") },
      async ({ faq_id }) => {
        const actor = await getMcpCallerEmail();
        const updated = await verifyFaq(faq_id, actor);
        if (!updated) return jsonResult({ error: "FAQ not found", id: faq_id }, true);
        return jsonResult({
          id: updated.id,
          status: updated.status,
          verifiedAt: updated.verifiedAt,
          verifiedBy: updated.verifiedBy,
          faqUrl: faqUrl(updated.id),
        });
      }
    );

    server.tool(
      "reject_faq",
      "Admin tool. Mark an FAQ as rejected (the AI got it wrong, content is " +
        "outdated, etc.). Sets status='rejected', records who rejected and when. " +
        "Does not delete — call `update_faq` to fix and re-verify instead.",
      { faq_id: z.number().int().describe("FAQ ID to reject") },
      async ({ faq_id }) => {
        const actor = await getMcpCallerEmail();
        const updated = await rejectFaq(faq_id, actor);
        if (!updated) return jsonResult({ error: "FAQ not found", id: faq_id }, true);
        return jsonResult({
          id: updated.id,
          status: updated.status,
          verifiedAt: updated.verifiedAt,
          verifiedBy: updated.verifiedBy,
          faqUrl: faqUrl(updated.id),
        });
      }
    );

    server.tool(
      "update_faq",
      "Admin tool. Edit any field on an FAQ (question, answer, topic). All fields " +
        "are optional — only the ones you pass are updated. Does NOT change status. " +
        "Common flow: get_faq → spot a mistake → update_faq → verify_faq.",
      {
        faq_id: z.number().int().describe("FAQ ID to edit"),
        question_th: z.string().optional(),
        question_en: z.string().optional(),
        answer_th: z.string().optional(),
        answer_en: z.string().optional(),
        topic: z.string().optional(),
      },
      async ({ faq_id, question_th, question_en, answer_th, answer_en, topic }) => {
        const updated = await updateFaqContent(faq_id, {
          questionTh: question_th,
          questionEn: question_en,
          answerTh: answer_th,
          answerEn: answer_en,
          topic,
        });
        if (!updated) return jsonResult({ error: "FAQ not found", id: faq_id }, true);
        return jsonResult({
          id: updated.id,
          questionEn: updated.questionEn,
          questionTh: updated.questionTh,
          answerEn: updated.answerEn,
          answerTh: updated.answerTh,
          topic: updated.topic,
          status: updated.status,
          updatedAt: updated.updatedAt,
          faqUrl: faqUrl(updated.id),
        });
      }
    );
  },
  {
    serverInfo: {
      name: "scg-thaisec",
      version: "0.2.0",
    },
  },
  {
    basePath: "/api",
    maxDuration: 60,
    verboseLogs: false,
  }
);

export { handler as GET, handler as POST, handler as DELETE };

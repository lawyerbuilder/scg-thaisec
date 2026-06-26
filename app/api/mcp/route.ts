import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  searchRegulations,
  countRegulations,
  listRegulationTypes,
  getRegulationById,
  getRelatedRegulations,
  listRecentRegulations,
} from "@/lib/search";

const SITE = process.env.THAISEC_SITE_URL ?? "https://scg-thaisec.vercel.app";

function detailUrl(id: number): string {
  return `${SITE}/regulations/${id}`;
}

function stripMarkTags(text: string): string {
  return text.replace(/<mark>/g, "**").replace(/<\/mark>/g, "**");
}

const handler = createMcpHandler(
  (server) => {
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
          .describe(
            'Optional category slug to filter by (e.g. "sec-notification", "cmsb-notification")'
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe("Max results to return (1-20, default 10)"),
      },
      async ({ query, type, limit }) => {
        const max = limit ?? 10;
        const [results, total] = await Promise.all([
          searchRegulations({ query, typeSlug: type, limit: max }),
          countRegulations({ query, typeSlug: type }),
        ]);
        const payload = {
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
        };
        return {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        };
      }
    );

    server.tool(
      "get_regulation",
      "Fetch the full text and metadata of a specific regulation by its ID. Use this " +
        "after `search_regulations` when the user wants the complete text rather than a " +
        "snippet. Returns both Thai and English text where available, plus links to the " +
        "canonical PDF.",
      {
        id: z.number().int().describe("Regulation ID returned by search_regulations"),
      },
      async ({ id }) => {
        const reg = await getRegulationById(id);
        if (!reg) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: "Regulation not found", id }) }],
            isError: true,
          };
        }
        const payload = {
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
        };
        return {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        };
      }
    );

    server.tool(
      "list_regulation_types",
      "List every regulation category in the SCG ThaiSEC taxonomy, with counts and " +
        "bilingual names. Call this first if the user wants to filter or browse by " +
        "category, or to discover which slugs you can pass to `search_regulations`.",
      {},
      async () => {
        const types = await listRegulationTypes();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
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
                },
                null,
                2
              ),
            },
          ],
        };
      }
    );

    server.tool(
      "find_related_regulations",
      "Given a regulation ID, find other regulations in the same category. Useful for " +
        "showing peers — e.g. all SEC notifications about digital assets, or all CMSB " +
        "notifications about disclosure.",
      {
        regulation_id: z.number().int().describe("Reference regulation ID"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(15)
          .optional()
          .describe("Max related regulations to return (1-15, default 6)"),
      },
      async ({ regulation_id, limit }) => {
        const ref = await getRegulationById(regulation_id);
        if (!ref) {
          return {
            content: [
              { type: "text", text: JSON.stringify({ error: "Regulation not found", id: regulation_id }) },
            ],
            isError: true,
          };
        }
        const related = await getRelatedRegulations(ref.regulationTypeId, regulation_id, limit ?? 6);
        const payload = {
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
        };
        return {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        };
      }
    );

    server.tool(
      "list_recent_regulations",
      "List the most recently ingested regulations. Useful for showing what's new in " +
        "the library or for sanity-checking the corpus after a fresh ingestion run.",
      {
        limit: z
          .number()
          .int()
          .min(1)
          .max(25)
          .optional()
          .describe("Number of recent regulations to return (1-25, default 10)"),
      },
      async ({ limit }) => {
        const recent = await listRecentRegulations(limit ?? 10);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
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
                },
                null,
                2
              ),
            },
          ],
        };
      }
    );
  },
  {
    serverInfo: {
      name: "scg-thaisec",
      version: "0.1.0",
    },
  },
  {
    basePath: "/api",
    maxDuration: 60,
    verboseLogs: false,
  }
);

export { handler as GET, handler as POST, handler as DELETE };

import { NextResponse } from "next/server";

export const revalidate = 3600;

const SITE = process.env.THAISEC_SITE_URL ?? "https://scg-thaisec.vercel.app";

/**
 * OpenAPI 3.1 spec for ChatGPT Custom GPT Actions. Exposes a thin REST facade
 * over the same operations as the MCP server.
 */
export function GET() {
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "SCG ThaiSEC",
      version: "0.1.0",
      description:
        "Read-only access to the SCG ThaiSEC library of Thai SEC regulations, notifications, and circulars indexed from capital.sec.or.th.",
    },
    servers: [{ url: SITE }],
    paths: {
      "/api/regulations/search": {
        get: {
          operationId: "searchRegulations",
          summary: "Full-text search across the regulation library",
          parameters: [
            { name: "q", in: "query", required: true, schema: { type: "string" } },
            { name: "type", in: "query", required: false, schema: { type: "string" } },
            { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 20 } },
          ],
          responses: {
            "200": {
              description: "Matching regulations with highlighted snippets",
              content: { "application/json": { schema: { $ref: "#/components/schemas/SearchResponse" } } },
            },
          },
        },
      },
      "/api/regulations/{id}": {
        get: {
          operationId: "getRegulation",
          summary: "Fetch the full text + metadata of one regulation",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: {
            "200": {
              description: "Regulation detail",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Regulation" } } },
            },
            "404": { description: "Not found" },
          },
        },
      },
      "/api/regulations/types": {
        get: {
          operationId: "listRegulationTypes",
          summary: "List taxonomy categories with bilingual names",
          responses: {
            "200": {
              description: "Category list",
              content: { "application/json": { schema: { $ref: "#/components/schemas/TypesResponse" } } },
            },
          },
        },
      },
      "/api/regulations/recent": {
        get: {
          operationId: "listRecentRegulations",
          summary: "List recently ingested regulations",
          parameters: [
            { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 25 } },
          ],
          responses: {
            "200": {
              description: "Recent regulations",
              content: { "application/json": { schema: { $ref: "#/components/schemas/RecentResponse" } } },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        Regulation: {
          type: "object",
          properties: {
            id: { type: "integer" },
            titleEn: { type: "string", nullable: true },
            titleTh: { type: "string" },
            regNumber: { type: "string", nullable: true },
            documentType: { type: "string", nullable: true },
            subject: { type: "string", nullable: true },
            publicationDate: { type: "string", nullable: true },
            effectiveDate: { type: "string", nullable: true },
            status: { type: "string", nullable: true },
            category: { type: "string", nullable: true },
            bodyEn: { type: "string", nullable: true },
            bodyTh: { type: "string", nullable: true },
            sourceUrl: { type: "string" },
            pdfUrl: { type: "string", nullable: true },
            detailUrl: { type: "string" },
          },
        },
        SearchResponse: {
          type: "object",
          properties: {
            query: { type: "string" },
            total: { type: "integer" },
            results: { type: "array", items: { $ref: "#/components/schemas/Regulation" } },
          },
        },
        TypesResponse: {
          type: "object",
          properties: {
            total: { type: "integer" },
            types: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  slug: { type: "string" },
                  nameEn: { type: "string" },
                  nameTh: { type: "string" },
                  category: { type: "string", nullable: true },
                  regulationCount: { type: "integer" },
                },
              },
            },
          },
        },
        RecentResponse: {
          type: "object",
          properties: {
            count: { type: "integer" },
            regulations: { type: "array", items: { $ref: "#/components/schemas/Regulation" } },
          },
        },
      },
    },
  };
  return NextResponse.json(spec);
}

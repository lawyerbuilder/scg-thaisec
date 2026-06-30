/**
 * Loads SCG Legal's Section-4 Q&A documents into the `faqs` table as
 * status='verified', source='imported'. SCG Legal authored these, so they
 * skip the AI-generated/draft cycle and land as authoritative.
 *
 * Expects three .docx files in the folder you pass:
 *   - QA_Legal_AGM.docx        → topic prefix 'agm'
 *   - QA_Legal_Litigation.docx → topic prefix 'litigation'
 *   - QA_Legal_PDPA.docx       → topic prefix 'pdpa'
 *
 * For each parsed Q&A the script also calls Groq to translate to English so
 * the FAQ shows bilingually. Translation is best-effort — on failure the
 * English fields stay empty and the Thai is still saved (UI handles missing
 * English fine).
 *
 * Usage:
 *   npm run load:faqs -- <path-to-folder-containing-docx>
 *   npm run load:faqs -- "C:\Users\abigails\AppData\Local\Temp\agm-docx"
 *
 * Re-runs are SAFE — dedups by (questionTh hash) per file: if an FAQ with
 * the same question text already exists from 'imported' source, it's skipped.
 */

import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import Groq from "groq-sdk";
import mammoth from "mammoth";
import { db } from "@/lib/db";
import { extractQaFromText, type ExtractedQA } from "@/lib/extract-qa-llm";
import { storeFaqEmbedding, faqEmbeddingText } from "@/lib/embeddings";

interface FileMapping {
  filename: string;
  topicPrefix: string;
  topicHint: string;
}

const FILES: FileMapping[] = [
  {
    filename: "QA_Legal_AGM.docx",
    topicPrefix: "agm",
    topicHint: "Annual General Meeting procedures, proxy, voting, annual reports",
  },
  {
    filename: "QA_Legal_Litigation.docx",
    topicPrefix: "litigation",
    topicHint: "Active and historical lawsuits, judgments, settlements, insurance",
  },
  {
    filename: "QA_Legal_PDPA.docx",
    topicPrefix: "pdpa",
    topicHint: "Personal Data Protection Act compliance, data-subject rights, DPO",
  },
];

const TRANSLATION_MODEL = "openai/gpt-oss-20b";
const TRANSLATION_DELAY_MS = 800;

const TRANSLATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    question_en: {
      type: "string",
      description: "Faithful English translation of the Thai question. Preserve legal terms and any cited section numbers (e.g. มาตรา 103 → Section 103).",
    },
    answer_en: {
      type: "string",
      description: "Faithful English translation of the Thai answer. Keep the same structure and substance.",
    },
  },
  required: ["question_en", "answer_en"],
} as const;

async function translateQa(
  groq: Groq,
  questionTh: string,
  answerTh: string
): Promise<{ questionEn: string; answerEn: string } | null> {
  try {
    const response = await groq.chat.completions.create({
      model: TRANSLATION_MODEL,
      messages: [
        {
          role: "user",
          content: `Translate this Thai legal Q&A pair to English. Stay faithful — don't summarize, don't add commentary. Preserve legal precision and any cited section numbers.

Question (Thai): ${questionTh}

Answer (Thai): ${answerTh}

Return JSON with question_en and answer_en.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "qa_translation", schema: TRANSLATION_SCHEMA, strict: true },
      },
      temperature: 0.1,
      max_tokens: 2000,
    });
    const content = response.choices[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as { question_en: string; answer_en: string };
    if (!parsed.question_en || !parsed.answer_en) return null;
    return { questionEn: parsed.question_en, answerEn: parsed.answer_en };
  } catch (err) {
    console.warn(`[load-faqs] translation failed: ${(err as Error).message}`);
    return null;
  }
}

async function alreadyImported(questionTh: string): Promise<boolean> {
  const rows = await db.execute<{ id: number }>(sql`
    SELECT id FROM faqs
    WHERE source = 'imported' AND question_th = ${questionTh}
    LIMIT 1
  `);
  return rows.rows.length > 0;
}

// Updated to use ExtractedQA shape (section instead of topic)
type ParsedQA = {
  topic: string | null;
  questionTh: string;
  answerTh: string;
};

function fromExtracted(qa: ExtractedQA): ParsedQA {
  return { topic: qa.section, questionTh: qa.question, answerTh: qa.answer };
}

async function loadOneFile(
  folder: string,
  mapping: FileMapping,
  groq: Groq | null
): Promise<{ inserted: number; skipped: number; failed: number; rejectedHallucination: number }> {
  const filePath = path.join(folder, mapping.filename);
  if (!fs.existsSync(filePath)) {
    console.warn(`[load-faqs] missing: ${filePath}`);
    return { inserted: 0, skipped: 0, failed: 0, rejectedHallucination: 0 };
  }
  console.log(`[load-faqs] extracting Q&A from ${mapping.filename} via LLM…`);
  const buf = fs.readFileSync(filePath);
  const { value: text } = await mammoth.extractRawText({ buffer: buf });
  const { pairs: qas, rejectedHallucination } = await extractQaFromText(
    text,
    mapping.topicHint
  );
  console.log(
    `[load-faqs]   ${qas.length} Q&A pairs extracted (+ ${rejectedHallucination} hallucinations rejected)`
  );

  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  for (const [i, raw] of qas.entries()) {
    const qa = fromExtracted(raw);
    const tag = `[${i + 1}/${qas.length}]`;

    if (await alreadyImported(qa.questionTh)) {
      skipped += 1;
      console.log(`  ${tag} ↩ already imported: ${qa.questionTh.slice(0, 60)}…`);
      continue;
    }

    // Optional translation
    let translation: { questionEn: string; answerEn: string } | null = null;
    if (groq) {
      translation = await translateQa(groq, qa.questionTh, qa.answerTh);
      await sleep(TRANSLATION_DELAY_MS);
    }

    const topic = qa.topic
      ? `${mapping.topicPrefix}/${slugifyTopic(qa.topic)}`
      : mapping.topicPrefix;

    try {
      const result = await db.execute<{ id: number }>(sql`
        INSERT INTO faqs (
          question_th, question_en, answer_th, answer_en,
          source, status, topic,
          verified_at, verified_by
        ) VALUES (
          ${qa.questionTh},
          ${translation?.questionEn ?? null},
          ${qa.answerTh},
          ${translation?.answerEn ?? null},
          'imported',
          'verified',
          ${topic},
          now(),
          'scg-legal-import'
        )
        RETURNING id
      `);
      const id = result.rows[0]?.id;
      if (id) {
        inserted += 1;
        console.log(`  ${tag} ✓ inserted id=${id} (${topic})`);
        // Best-effort embed
        await storeFaqEmbedding(
          id,
          faqEmbeddingText({
            questionTh: qa.questionTh,
            questionEn: translation?.questionEn ?? null,
            answerTh: qa.answerTh,
            answerEn: translation?.answerEn ?? null,
          })
        );
      } else {
        failed += 1;
      }
    } catch (err) {
      failed += 1;
      console.warn(`  ${tag} ✗ insert failed: ${(err as Error).message}`);
    }
  }

  return { inserted, skipped, failed, rejectedHallucination };
}

function slugifyTopic(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^\w฀-๿]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const folder = process.argv[2];
  if (!folder) {
    console.error(
      "usage: npm run load:faqs -- <path-to-folder>\n" +
        "Folder must contain QA_Legal_AGM.docx, QA_Legal_Litigation.docx, QA_Legal_PDPA.docx"
    );
    process.exit(1);
  }
  if (!fs.existsSync(folder)) {
    console.error(`folder not found: ${folder}`);
    process.exit(1);
  }

  // Translation is optional but strongly recommended
  const groqKey = process.env.GROQ_API_KEY;
  const groq = groqKey ? new Groq({ apiKey: groqKey }) : null;
  if (!groq) {
    console.warn(
      "[load-faqs] GROQ_API_KEY not set — FAQs will be loaded Thai-only (no English translations)."
    );
  }

  const totals = { inserted: 0, skipped: 0, failed: 0, rejectedHallucination: 0 };
  for (const mapping of FILES) {
    try {
      const r = await loadOneFile(folder, mapping, groq);
      totals.inserted += r.inserted;
      totals.skipped += r.skipped;
      totals.failed += r.failed;
      totals.rejectedHallucination += r.rejectedHallucination;
    } catch (err) {
      console.error(
        `[load-faqs] ${mapping.filename} failed: ${(err as Error).message}`
      );
      // Continue to the next file rather than crashing the whole import
    }
  }

  console.log(
    `\n[load-faqs] DONE — ${totals.inserted} inserted, ${totals.skipped} skipped, ${totals.failed} failed, ${totals.rejectedHallucination} hallucinations rejected`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[load-faqs] fatal:", err);
    process.exit(1);
  });

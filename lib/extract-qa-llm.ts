/**
 * LLM-based Q&A extraction from semi-structured documents.
 *
 * Replaces the brittle regex parser in lib/parse-qa-docx.ts. Hands the full
 * document text to Groq with a strict JSON schema that describes what a valid
 * Q&A pair looks like, lets the model use semantic understanding to identify
 * boundaries (vs the regex which only sees paragraph breaks).
 *
 * Validation: every extracted pair must literally appear in the source text
 * (substring match, after whitespace normalization). Anything the model
 * hallucinated gets dropped.
 *
 * One API call per document. For our 3 SCG QA_Legal files (~5KB text each),
 * this is ~3 calls total — orders of magnitude cheaper than maintaining
 * a per-author regex.
 */

import Groq from "groq-sdk";

const FALLBACK_MODELS = [
  "openai/gpt-oss-20b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
];
const MAX_ATTEMPTS = 3;
const MAX_DOC_CHARS = 30_000; // ~7.5k tokens — fits Groq's 8k input budget

export interface ExtractedQA {
  question: string;
  answer: string;
  section: string | null;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    document_topic: {
      type: "string",
      description:
        "One-phrase label for the document overall (e.g. 'Shareholder meetings', 'Litigation', 'PDPA').",
    },
    qa_pairs: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          section: {
            type: ["string", "null"],
            description:
              "The section heading this Q&A appears under (e.g. 'ประเด็นเกี่ยวกับ...'). Null if no heading precedes it.",
          },
          question: {
            type: "string",
            description:
              "The literal question text from the document. Should end with ? OR start with a Thai question word (เพราะเหตุใด, ทำไม, อย่างไร, etc.) OR be phrased as an interrogative. Do NOT use statements, context blurbs, or fragments. Aim for at least ~15 characters.",
          },
          answer: {
            type: "string",
            description:
              "The COMPLETE answer body, including all paragraphs, numbered lists, sub-points, and continuation. Often starts with 'แนวชี้แจง' but include the full body that follows. Do NOT truncate at the first paragraph. Aim for at least ~30 characters of substantive answer.",
          },
        },
        required: ["section", "question", "answer"],
      },
    },
  },
  required: ["document_topic", "qa_pairs"],
} as const;

function buildPrompt(documentText: string, hintTopic: string): string {
  return `You are extracting Q&A pairs from a Thai legal document authored by SCG Legal. Each Q&A is a real question a shareholder, journalist, or regulator might ask, followed by SCG's official answer.

DOCUMENT TOPIC HINT: ${hintTopic}

DOCUMENT TEXT (between fences — extract Q&A pairs found here, verbatim):
\`\`\`
${documentText.slice(0, MAX_DOC_CHARS)}
\`\`\`

YOUR TASK
Identify every Q&A pair in this document. For each one:

- The QUESTION must be an actual interrogative — typically ends with ? or starts with a Thai question word (เพราะเหตุใด, ทำไม, อย่างไร, หาก, ในกรณี, จะ + verb, etc.). It is NEVER a statement, a fact, a section heading, a context blurb, or a fragment.
- The ANSWER is the COMPLETE response body. Often starts with the marker 'แนวชี้แจง' but include the FULL text that follows, including numbered lists, sub-points (1, 2, 3), and continuation paragraphs — up until the next question begins or the document ends.
- The SECTION is the most recent topic heading preceding this Q&A. Null if no heading.

QUALITY RULES
- Extract text VERBATIM from the document. Do not paraphrase, summarize, translate, or shorten.
- If a paragraph looks like a continuation of a previous answer (e.g. starts with '(2)', 'นอกจากนี้', 'อย่างไรก็ตาม'), it is NOT a new question — fold it into the prior answer.
- If a paragraph is a statement or context blurb (e.g. 'เอสซีจีได้แต่งตั้ง...'), it is NOT a question — skip it or treat it as context for the section heading.
- Skip the document title block at the very top.
- If you're unsure whether something is a real question, skip it. False positives are worse than false negatives — we'd rather have 5 high-quality pairs than 15 noisy ones.

Return JSON conforming to the schema.`;
}

/**
 * Normalize text for substring-match validation: collapse whitespace, lowercase
 * (Latin chars only — Thai is unaffected), strip the answer-marker prefix.
 */
function normalize(s: string): string {
  return s
    .replace(/^แนวชี้แจง[\s:：-]*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Returns true if both the question and answer appear in the document text
 * (substring match after whitespace normalization). Catches hallucinated
 * pairs that the model invented.
 */
function pairAppearsIn(pair: ExtractedQA, docText: string): boolean {
  const normDoc = normalize(docText);
  const normQ = normalize(pair.question);
  const normA = normalize(pair.answer);
  // Allow partial-match on long answers (>1000 chars) — model may have
  // merged across page breaks. Require first 200 chars to appear.
  const aProbe = normA.length > 1000 ? normA.slice(0, 200) : normA;
  return normDoc.includes(normQ) && normDoc.includes(aProbe);
}

export async function extractQaFromText(
  documentText: string,
  hintTopic: string
): Promise<{ pairs: ExtractedQA[]; rejectedHallucination: number }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");
  const groq = new Groq({ apiKey });
  const prompt = buildPrompt(documentText, hintTopic);

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const model = attempt === 0 ? FALLBACK_MODELS[0] : FALLBACK_MODELS[1] ?? FALLBACK_MODELS[0];
    const temperature = Math.max(0.0, 0.1 - attempt * 0.05);
    try {
      const response = await groq.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        response_format: {
          type: "json_schema",
          json_schema: { name: "qa_extraction", schema: SCHEMA, strict: true },
        },
        temperature,
        max_tokens: 6000,
      });
      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("empty response");
      const parsed = JSON.parse(content) as {
        document_topic: string;
        qa_pairs: ExtractedQA[];
      };
      if (!Array.isArray(parsed.qa_pairs) || parsed.qa_pairs.length === 0) {
        throw new Error("model returned no qa_pairs");
      }

      // Validate every pair: length sanity + source-evidence (no hallucination)
      const validated: ExtractedQA[] = [];
      let rejected = 0;
      let tooShort = 0;
      for (const p of parsed.qa_pairs) {
        if ((p.question?.trim().length ?? 0) < 10 || (p.answer?.trim().length ?? 0) < 20) {
          tooShort += 1;
          continue;
        }
        if (pairAppearsIn(p, documentText)) {
          validated.push({
            question: p.question.trim(),
            answer: p.answer.trim(),
            section: p.section?.trim() || null,
          });
        } else {
          rejected += 1;
          console.warn(
            `  [extract-qa] rejected hallucinated pair: "${p.question.slice(0, 80)}..."`
          );
        }
      }
      if (tooShort > 0) {
        console.warn(`  [extract-qa] dropped ${tooShort} too-short pair(s)`);
      }
      return { pairs: validated, rejectedHallucination: rejected };
    } catch (err) {
      lastError = err as Error;
      console.warn(
        `  [extract-qa] attempt ${attempt + 1}/${MAX_ATTEMPTS} on ${model} failed: ${lastError.message.slice(0, 120)}`
      );
    }
  }
  throw new Error(
    `Q&A extraction failed after ${MAX_ATTEMPTS} attempts. Last error: ${lastError?.message ?? "unknown"}`
  );
}

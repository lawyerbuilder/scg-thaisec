/**
 * Parser for SCG Legal's Section-4 Q&A documents (QA_Legal_AGM.docx,
 * QA_Legal_Litigation.docx, QA_Legal_PDPA.docx).
 *
 * Format observation:
 *   - Document opens with a title block ("คำถาม – คำตอบ", topic name).
 *   - Each question is a paragraph.
 *   - Each answer paragraph STARTS with the marker "แนวชี้แจง" (Thai for
 *     "explanation/guidance"). Sometimes that's the full paragraph; sometimes
 *     answer body continues on the same paragraph after the marker; sometimes
 *     in subsequent paragraphs until the next question.
 *   - Section headings appear as short standalone paragraphs (e.g.
 *     "การประชุมผู้ถือหุ้น", "ประเด็นเกี่ยวกับรายงานประจำปี") between Q&A clusters.
 *
 * Strategy:
 *   1. Split mammoth output into trimmed paragraphs.
 *   2. Walk paragraphs. When we see one starting with "แนวชี้แจง", that's an
 *      answer. The question is the most recent non-header paragraph before it.
 *      Subsequent paragraphs (up until the next answer-or-section-header) get
 *      appended to the answer body.
 *   3. Track the current section heading as `topic`.
 */

import mammoth from "mammoth";
import fs from "node:fs";

const ANSWER_MARKER = "แนวชี้แจง";
// Heading detection: short paragraph (< ~80 chars), no marker, no ? at end.
const HEADING_MAX_CHARS = 90;

export interface ParsedQA {
  topic: string | null;
  questionTh: string;
  answerTh: string;
}

export async function parseQaDocx(filePath: string): Promise<ParsedQA[]> {
  const buf = fs.readFileSync(filePath);
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return parseQaText(value);
}

export function parseQaText(raw: string): ParsedQA[] {
  // Split on blank line(s), trim, keep only non-empty paragraphs
  const paragraphs = raw
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean);

  // Skip the leading title block — anything before the first answer marker
  // that's also short ("คำถาม – คำตอบ" style)
  const out: ParsedQA[] = [];
  let currentTopic: string | null = null;
  let lastQuestion: string | null = null;
  let activeAnswer: { qa: ParsedQA; idx: number } | null = null;

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];

    // Answer paragraph?
    if (p.startsWith(ANSWER_MARKER) || p.startsWith(ANSWER_MARKER.trim())) {
      const body = p.replace(/^แนวชี้แจง[\s:：-]*/, "").trim();
      if (lastQuestion && body) {
        const qa: ParsedQA = {
          topic: currentTopic,
          questionTh: lastQuestion,
          answerTh: body,
        };
        out.push(qa);
        activeAnswer = { qa, idx: out.length - 1 };
        lastQuestion = null; // consumed
      } else if (activeAnswer) {
        // Standalone "แนวชี้แจง" with no preceding new question — continuation
        activeAnswer.qa.answerTh += "\n\n" + body;
      }
      continue;
    }

    // Continuation of an active answer? (no marker, no obvious question)
    if (
      activeAnswer &&
      lastQuestion === null &&
      !isLikelyHeading(p) &&
      !isLikelyQuestion(p, paragraphs[i + 1])
    ) {
      activeAnswer.qa.answerTh += "\n\n" + p;
      continue;
    }

    // Short paragraph between answers → section heading (topic update)
    if (isLikelyHeading(p)) {
      currentTopic = stripTitleNoise(p);
      activeAnswer = null;
      continue;
    }

    // Otherwise it's (likely) a question paragraph
    lastQuestion = p;
    activeAnswer = null;
  }

  return out
    .map((qa) => ({
      ...qa,
      questionTh: qa.questionTh.trim(),
      answerTh: qa.answerTh.trim(),
    }))
    .filter((qa) => qa.questionTh.length >= 8 && qa.answerTh.length >= 12);
}

function isLikelyHeading(p: string): boolean {
  if (p.length > HEADING_MAX_CHARS) return false;
  if (p.endsWith("?") || p.endsWith("?")) return false;
  if (p.includes(ANSWER_MARKER)) return false;
  // Doc title lines like "คำถาม – คำตอบ"
  if (/^คำถาม\s*[–-]\s*คำตอบ$/.test(p)) return true;
  // Section markers — start with "ประเด็น" or are noun phrases without verb-like endings
  return /^(ประเด็น|การ|เรื่อง|หัวข้อ)/.test(p) || /^[ก-๛\s]+$/.test(p);
}

function isLikelyQuestion(p: string, next?: string): boolean {
  // If the NEXT paragraph starts with the answer marker, this paragraph is
  // almost certainly the question that introduces it.
  if (next && next.startsWith(ANSWER_MARKER)) return true;
  // Otherwise heuristic on shape
  if (p.endsWith("?") || p.endsWith("?")) return true;
  if (/^(เพราะเหตุใด|ทำไม|หาก|เหตุใด|ในกรณี|กรณีที่|หาก|จะ)/.test(p)) return true;
  return false;
}

function stripTitleNoise(p: string): string {
  return p
    .replace(/^ประเด็นเกี่ยวกับ\s*/, "")
    .replace(/^การ/, "")
    .trim();
}

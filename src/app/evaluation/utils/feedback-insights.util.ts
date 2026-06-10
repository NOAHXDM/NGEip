import {
  AttributeKey,
  EvaluationFeedbackInsight,
  EvaluationFormFeedbacks,
  EvaluationFormScores,
} from '../models/evaluation.models';

const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  EXE: '執行力',
  INS: '洞察力',
  ADP: '應變力',
  COL: '協作力',
  STB: '穩定力',
  INN: '創新力',
};

const QUESTION_METADATA: Record<keyof EvaluationFormScores, {
  label: string;
  attributeKey: AttributeKey;
}> = {
  q1: { label: 'Q1 溝通與協作能力', attributeKey: 'COL' },
  q2: { label: 'Q2 問題解決能力', attributeKey: 'INS' },
  q3: { label: 'Q3 自我管理與組織能力', attributeKey: 'ADP' },
  q4: { label: 'Q4 創新與主動性', attributeKey: 'INN' },
  q5: { label: 'Q5 責任心與承諾', attributeKey: 'STB' },
  q6: { label: 'Q6 團隊精神與合作', attributeKey: 'COL' },
  q7: { label: 'Q7 積極學習與成長', attributeKey: 'INS' },
  q8: { label: 'Q8 專業態度與品質意識', attributeKey: 'STB' },
  q9: { label: 'Q9 壓力應對能力', attributeKey: 'ADP' },
  q10: { label: 'Q10 工作效率與結果導向', attributeKey: 'EXE' },
};

export interface FeedbackThemeGroup {
  attributeKey: AttributeKey;
  attributeLabel: string;
  count: number;
  insights: EvaluationFeedbackInsight[];
}

export function buildFeedbackInsightsFromFeedbacks(
  feedbacks: EvaluationFormFeedbacks,
): EvaluationFeedbackInsight[] {
  const keys = Object.keys(feedbacks) as (keyof EvaluationFormScores)[];

  return keys
    .map((questionKey) => {
      const feedback = feedbacks[questionKey]?.trim() ?? '';
      if (!feedback) {
        return null;
      }

      const metadata = QUESTION_METADATA[questionKey];
      const attributeLabel = ATTRIBUTE_LABELS[metadata.attributeKey];

      return {
        questionKey,
        questionLabel: metadata.label,
        attributeKey: metadata.attributeKey,
        attributeLabel,
        feedback,
      } satisfies EvaluationFeedbackInsight;
    })
    .filter((v): v is EvaluationFeedbackInsight => v !== null);
}

export function groupFeedbackInsightsByAttribute(
  insights: EvaluationFeedbackInsight[],
): FeedbackThemeGroup[] {
  const grouped = new Map<AttributeKey, EvaluationFeedbackInsight[]>();

  for (const insight of insights) {
    const arr = grouped.get(insight.attributeKey) ?? [];
    arr.push(insight);
    grouped.set(insight.attributeKey, arr);
  }

  return [...grouped.entries()]
    .map(([attributeKey, groupedInsights]) => ({
      attributeKey,
      attributeLabel: ATTRIBUTE_LABELS[attributeKey],
      count: groupedInsights.length,
      insights: groupedInsights,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.attributeKey.localeCompare(b.attributeKey);
    });
}

export function toFeedbackInsightKey(insight: EvaluationFeedbackInsight): string {
  return `${insight.questionKey}|${insight.feedback}`;
}

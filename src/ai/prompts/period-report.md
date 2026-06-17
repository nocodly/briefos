You are analyzing multiple meeting summaries from a specific time period.
Return ONLY valid JSON — no markdown, no preamble.

You will receive an array of meeting summaries. Cross-reference them to find:
- Strategic themes that appeared in multiple meetings
- All decisions made across the entire period
- Action items that are still open (not marked complete)
- Questions that appeared in multiple meetings but were never resolved
- Patterns in how the team communicates and decides

Return EXACTLY this schema:
{
  "executiveSummary": "3-5 sentences summarizing what this entire period was about",
  "mainThemes": ["Strategic theme that ran through multiple meetings"],
  "allDecisions": [
    { "decision": "text", "meeting": "meeting title", "date": "YYYY-MM-DD" }
  ],
  "openActions": [
    {
      "person": "name",
      "task": "text",
      "deadline": "date or null",
      "priority": "high|medium|low",
      "sourceMeeting": "meeting title",
      "sourceDate": "YYYY-MM-DD"
    }
  ],
  "recurringQuestions": [
    { "question": "text", "appearedIn": ["meeting title 1", "meeting title 2"] }
  ],
  "topTopics": [{ "topic": "name", "count": 8 }],
  "speakerStats": [{ "name": "name", "totalMinutes": 45, "percentage": 52 }],
  "aiInsights": [
    { "type": "pattern|warning|opportunity", "text": "Specific insight with evidence" }
  ],
  "keywords": ["top 15 recurring terms across all meetings"]
}

Rules:
- recurringQuestions: ONLY include questions that appeared in 2 or more meetings
- Each openActions item MUST include the sourceMeeting it came from
- topTopics count = number of meetings the topic appeared in, sorted descending
- aiInsights: ground every insight in evidence from the summaries, no speculation
- Respond in the same language as the majority of the meetings
- If a field has no data, use an empty array [] not null

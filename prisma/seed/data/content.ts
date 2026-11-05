// data/content.ts — optional realism; 02 falls back if missing
export interface CourseContent {
  modules: { title: string; topics: { title: string; durationSeconds: number }[] }[];
}

const m = (title: string, topics: [title: string, minutes: number][]): CourseContent["modules"][number] => ({
  title,
  topics: topics.map(([t, minutes]) => ({ title: t, durationSeconds: minutes * 60 })),
});

/** Keys must match the course slugs in 02-catalog. Missing slugs fall back to generic modules. */
export const COURSE_CONTENT: Record<string, CourseContent> = {
  "accounting-basics": {
    modules: [
      m("Foundations of double entry", [["The accounting equation", 12], ["Debits and credits", 15], ["Journals and ledgers", 14]]),
      m("From ledger to trial balance", [["Posting to the ledger", 13], ["Extracting a trial balance", 16], ["Finding and fixing errors", 15]]),
      m("Adjustments and final accounts", [["Accruals and prepayments", 17], ["Depreciation", 14], ["Preparing final accounts", 18]]),
    ],
  },
  "financial-analysis": {
    modules: [
      m("Reading financial statements", [["Structure of the three statements", 14], ["Horizontal and vertical analysis", 16], ["Common-size statements", 12]]),
      m("Ratio analysis", [["Liquidity and efficiency ratios", 15], ["Profitability ratios", 14], ["Leverage and coverage ratios", 16]]),
      m("Cash flow and valuation", [["Cash flow analysis", 17], ["Forecasting basics", 15], ["Putting an analysis report together", 18]]),
    ],
  },
  "bookkeeping-essentials": {
    modules: [
      m("Setting up the books", [["Chart of accounts", 10], ["Source documents", 9], ["Cash book and petty cash", 12]]),
      m("Daily bookkeeping", [["Sales and purchases day books", 13], ["Control accounts", 12], ["Bank reconciliation", 15]]),
      m("Period end", [["Payroll entries", 11], ["VAT bookkeeping", 13], ["Month-end checklist", 10]]),
    ],
  },
  "advanced-taxation": {
    modules: [
      m("The tax framework", [["Tax types and authorities", 14], ["Company income tax", 18], ["Personal income tax and PAYE", 16]]),
      m("VAT and withholding tax", [["VAT mechanics", 15], ["Withholding tax", 13], ["Filing and compliance deadlines", 12]]),
      m("Planning and disputes", [["Tax planning principles", 17], ["Tax audits", 14], ["Objections and appeals", 13]]),
    ],
  },
  "payroll-management": {
    modules: [
      m("Payroll fundamentals", [["The payroll cycle", 11], ["Gross to net pay", 14], ["Statutory deductions", 16]]),
      m("Pension and benefits", [["Pension contributions", 13], ["Allowances and benefits in kind", 12], ["Loans and advances", 10]]),
      m("Controls and reporting", [["Payroll controls", 13], ["Year-end returns", 12], ["Payroll software walkthrough", 15]]),
    ],
  },
  "excel-for-accountants": {
    modules: [
      m("Spreadsheet essentials", [["Navigation and formatting", 9], ["Formulas and references", 12], ["Lookup functions", 14]]),
      m("Analysis tools", [["PivotTables", 15], ["Conditional formatting", 8], ["Data validation", 9]]),
      m("Accounting models", [["Building a depreciation schedule", 13], ["Loan amortisation", 12], ["Budget variance sheet", 14]]),
    ],
  },
  "audit-fundamentals": {
    modules: [
      m("Audit basics", [["Purpose and types of audit", 12], ["Ethics and independence", 11], ["Audit planning", 14]]),
      m("Evidence and testing", [["Audit evidence", 13], ["Internal controls", 15], ["Sampling", 12]]),
      m("Completion and reporting", [["Review and completion", 12], ["Audit opinions", 14], ["Management letters", 9]]),
    ],
  },
  "corporate-finance-strategy": {
    modules: [
      m("Capital and the cost of funds", [["Sources of finance", 15], ["Cost of capital", 17], ["Capital structure", 16]]),
      m("Investment decisions", [["NPV and IRR", 18], ["Capital budgeting under risk", 16], ["Working capital management", 14]]),
      m("Strategy and value", [["Dividend policy", 13], ["Mergers and acquisitions", 17], ["Valuation methods", 18]]),
    ],
  },
};

/**
 * Evening-batch class chat. Index i is posted by senderFor[i] in 06-community.
 * Replies (06's replyTo): 2->1, 4->3, 10->9, 11->10. Keep the length at 15.
 */
export const CHAT_LINES: readonly string[] = [
  /* 0  instructor */ "Welcome to the evening batch, everyone. Chapter 5 is final accounts, so please read the notes before Thursday's class.",
  /* 1  ada        */ "Good evening sir. Does the trial balance in chapter 4 need to balance before we post adjustments?",
  /* 2  instructor */ "Yes, Ada. Extract it first, confirm the totals agree, then post the adjustments as a second pass.",
  /* 3  chidi      */ "Can someone explain how to treat prepaid insurance? I keep putting it in expenses.",
  /* 4  ngozi      */ "It stays a current asset until the period it covers is used up, then you release it to expenses.",
  /* 5  chidi      */ "That clears it up, thanks Ngozi.",
  /* 6  instructor */ "Reminder: bring your workbook and a calculator to tomorrow's session.",
  /* 7  ngozi      */ "Will the bank reconciliation workshop recording be uploaded? I missed the first half.",
  /* 8  instructor */ "Yes, it is processing now and will appear under recordings within a day.",
  /* 9  ada        */ "For accruals, do we reverse the entry at the start of the next period?",
  /* 10 instructor */ "Good question. Reversing entries are optional, but they make the next period's postings simpler.",
  /* 11 ada        */ "Understood, I will use reversals in the practice set.",
  /* 12 instructor */ "Class link and times are on your schedule tab. Please join five minutes early.",
  /* 13 student01  */ "Is the revision clinic still holding this week?",
  /* 14 chidi      */ "Thanks all, see you Thursday.",
];
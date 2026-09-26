var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_url = require("url");
var import_dotenv = __toESM(require("dotenv"), 1);
var import_genai = require("@google/genai");
var import_meta = {};
import_dotenv.default.config();
var __filename = (0, import_url.fileURLToPath)(import_meta.url);
var __dirname = import_path.default.dirname(__filename);
var app = (0, import_express.default)();
var PORT = 3e3;
app.use(import_express.default.json({ limit: "10mb" }));
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new import_genai.GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
});
app.post("/api/advisor/chat", async (req, res) => {
  try {
    const { messages, financialProfile } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Invalid messages array" });
    }
    const ai = getGeminiClient();
    const profileSummary = financialProfile ? `
CURRENT USER FINANCIAL SNAPSHOT (Real-time live data):
- Currency: ${financialProfile.currency || "USD"}
- Monthly Income: $${financialProfile.totalIncome?.toFixed(2) || "0.00"}
- Monthly Expenses: $${financialProfile.totalExpenses?.toFixed(2) || "0.00"}
- Net Monthly Cash Flow: $${((financialProfile.totalIncome || 0) - (financialProfile.totalExpenses || 0)).toFixed(2)}
- Current Savings Rate: ${financialProfile.savingsRate?.toFixed(1) || "0.0"}% (Target benchmark: 20%+)
- Overall Financial Health Score: ${financialProfile.healthScore || 0}/100 (${financialProfile.healthRating || "Good"})
- 50/30/20 Rule Status:
  * Needs: $${financialProfile.needsTotal?.toFixed(2) || 0} (${financialProfile.needsPct?.toFixed(1) || 0}%, ideal \u226450%)
  * Wants: $${financialProfile.wantsTotal?.toFixed(2) || 0} (${financialProfile.wantsPct?.toFixed(1) || 0}%, ideal \u226430%)
  * Savings/Investments: $${financialProfile.savingsTotal?.toFixed(2) || 0} (${financialProfile.savingsPct?.toFixed(1) || 0}%, ideal \u226520%)
- Top Spending Categories:
${(financialProfile.categoryBreakdown || []).map(
      (c) => `  * ${c.category}: Spent $${c.spent.toFixed(2)} (Budget: $${c.budget.toFixed(2)}, ${c.spent > c.budget ? "OVER BUDGET" : "On Track"})`
    ).join("\n")}
- Active Savings Goals:
${(financialProfile.savingsGoals || []).map(
      (g) => `  * ${g.name}: $${g.currentAmount.toFixed(2)} / $${g.targetAmount.toFixed(2)} (${g.progressPct.toFixed(0)}%) by ${g.targetDate}`
    ).join("\n")}
` : "No financial profile data provided.";
    const systemInstruction = `You are "FinAdvisor AI", an elite, certified financial planner (CFP) and empathetic personal finance advisor bot.
Your mission is to help the user master their money, crush debt, optimize spending, build an emergency buffer, and achieve their savings goals.

TONE & BEHAVIOR:
- Warm, encouraging, objective, non-judgmental, and highly analytical.
- Quote actual numbers from their financial snapshot when giving advice.
- When they ask how to save money or audit their budget, give 3-4 specific, high-yield action steps with estimated dollar impact.
- Avoid vague advice like "spend less"; say "Trimming dining by 20% would recover $140/month, allowing you to hit your Emergency Fund 3 months faster".
- Use clean Markdown with bold headers and bullet points. Keep explanations crisp and readable.
- If asked about high-risk speculation or crypto, recommend established diversification (index funds, high-yield savings, paying down high-interest debt first).

${profileSummary}
`;
    if (!ai) {
      const lastUserMsg = messages[messages.length - 1]?.content || "";
      const fallbackReply = generateRuleBasedAdvice(lastUserMsg, financialProfile);
      return res.json({ response: fallbackReply, isFallback: true });
    }
    const conversationPrompt = messages.map((m) => `${m.role === "user" ? "User" : "FinAdvisor AI"}: ${m.content}`).join("\n\n");
    const result = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: `${conversationPrompt}

FinAdvisor AI:`,
      config: {
        systemInstruction,
        temperature: 0.7
      }
    });
    const reply = result.text || "I analyzed your query, but could not generate a response. Please try again.";
    res.json({ response: reply });
  } catch (error) {
    console.error("Advisor Chat Error:", error);
    const fallbackReply = generateRuleBasedAdvice(
      req.body.messages?.[req.body.messages?.length - 1]?.content || "",
      req.body.financialProfile
    );
    res.json({ response: fallbackReply, isFallback: true });
  }
});
app.post("/api/advisor/analyze", async (req, res) => {
  try {
    const { financialProfile, month } = req.body;
    const ai = getGeminiClient();
    const profileText = JSON.stringify(financialProfile, null, 2);
    const prompt = `Perform a comprehensive, institutional-grade Monthly Financial Audit & Health Diagnosis for the month of ${month || "Current Month"}.
Financial Data:
${profileText}

Please generate a structured JSON response with the following schema:
{
  "executiveSummary": "A 2-3 sentence overview of this month's financial health, cashflow surplus/deficit, and primary win or concern.",
  "healthGrade": "A+ | A | B | C | D",
  "scoreJustification": "Brief 1-sentence breakdown of why this score was assigned.",
  "strengths": ["List 2-3 specific financial strengths observed in their data"],
  "vulnerabilities": ["List 2-3 risk areas or budget overruns"],
  "actionPlan": [
    {
      "step": 1,
      "title": "Short title",
      "action": "Specific tactical action",
      "estimatedMonthlySavings": 120,
      "category": "Dining & Drinks"
    }
  ],
  "fiftyThirtyTwentyEvaluation": {
    "status": "Balanced | Needs Heavy | Wants Heavy | Low Savings",
    "notes": "Evaluation of needs vs wants vs savings proportions"
  },
  "projectedAnnualSavings": 2400
}
Return strictly JSON.`;
    if (!ai) {
      const fallbackReport = generateRuleBasedReport(financialProfile, month);
      return res.json(fallbackReport);
    }
    const result = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.4
      }
    });
    const parsed = JSON.parse(result.text || "{}");
    res.json(parsed);
  } catch (err) {
    console.error("Advisor Analysis Error:", err);
    const fallbackReport = generateRuleBasedReport(req.body.financialProfile, req.body.month);
    res.json(fallbackReport);
  }
});
app.post("/api/finance/categorize", async (req, res) => {
  try {
    const { description, amount } = req.body;
    const ai = getGeminiClient();
    const lower = (description || "").toLowerCase();
    if (lower.includes("rent") || lower.includes("mortgage") || lower.includes("apartment")) {
      return res.json({ category: "Housing", type: "need" });
    }
    if (lower.includes("grocery") || lower.includes("kroger") || lower.includes("trader") || lower.includes("safeway") || lower.includes("market")) {
      return res.json({ category: "Food & Groceries", type: "need" });
    }
    if (lower.includes("uber") || lower.includes("lyft") || lower.includes("gas") || lower.includes("chevron") || lower.includes("transit") || lower.includes("metro")) {
      return res.json({ category: "Transportation", type: "need" });
    }
    if (lower.includes("electric") || lower.includes("water") || lower.includes("internet") || lower.includes("wifi") || lower.includes("utility")) {
      return res.json({ category: "Utilities & Bills", type: "need" });
    }
    if (lower.includes("restaurant") || lower.includes("cafe") || lower.includes("coffee") || lower.includes("starbucks") || lower.includes("doordash") || lower.includes("chipotle")) {
      return res.json({ category: "Dining & Drinks", type: "want" });
    }
    if (lower.includes("netflix") || lower.includes("spotify") || lower.includes("cinema") || lower.includes("movie") || lower.includes("steam") || lower.includes("game")) {
      return res.json({ category: "Entertainment", type: "want" });
    }
    if (lower.includes("amazon") || lower.includes("nike") || lower.includes("clothing") || lower.includes("target") || lower.includes("zara")) {
      return res.json({ category: "Shopping & Personal", type: "want" });
    }
    if (lower.includes("pharmacy") || lower.includes("doctor") || lower.includes("dental") || lower.includes("cvs") || lower.includes("health")) {
      return res.json({ category: "Healthcare", type: "need" });
    }
    if (ai && description) {
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: `Categorize this expense transaction description: "${description}" with amount $${amount}.
Available categories:
- Housing
- Food & Groceries
- Dining & Drinks
- Transportation
- Utilities & Bills
- Healthcare
- Entertainment
- Shopping & Personal
- Debt & Loans
- Education
- Miscellaneous

Classification: "need" or "want" or "savings" (based on 50/30/20 rule).
Respond in JSON: {"category": "...", "type": "need"|"want"|"savings"}`,
        config: {
          responseMimeType: "application/json",
          temperature: 0.1
        }
      });
      const parsed = JSON.parse(response.text || "{}");
      return res.json(parsed);
    }
    res.json({ category: "Miscellaneous", type: "want" });
  } catch (e) {
    res.json({ category: "Miscellaneous", type: "want" });
  }
});
function generateRuleBasedAdvice(userQuery, profile) {
  const query = (userQuery || "").toLowerCase();
  const income = profile?.totalIncome || 4500;
  const expenses = profile?.totalExpenses || 3200;
  const cashflow = income - expenses;
  const savingsRate = profile?.savingsRate || 28;
  const healthScore = profile?.healthScore || 78;
  if (query.includes("50/30/20") || query.includes("rule")) {
    const needsPct = profile?.needsPct || 52;
    const wantsPct = profile?.wantsPct || 28;
    const savPct = profile?.savingsPct || 20;
    return `### 50/30/20 Budget Breakdown Analysis

Based on your current cashflow of **$${income.toLocaleString()}** monthly income:

- **Needs (Target \u2264 50%):** You are at **${needsPct}%** ($${(income * needsPct / 100).toFixed(0)}/mo). ${needsPct <= 50 ? "\u2705 Outstanding! Your fixed essentials are lean." : "\u26A0\uFE0F Slightly elevated. Look into renegotiating recurring utility rates or insurance."}
- **Wants (Target \u2264 30%):** You are at **${wantsPct}%** ($${(income * wantsPct / 100).toFixed(0)}/mo). ${wantsPct <= 30 ? "\u2705 Healthy discretionary balance." : "\u26A0\uFE0F Discretionary expenses are eating into potential wealth creation."}
- **Savings & Debt (Target \u2265 20%):** You are at **${savPct}%** ($${(income * savPct / 100).toFixed(0)}/mo). ${savPct >= 20 ? "\u{1F31F} Excellent! You are meeting the benchmark for aggressive wealth building." : "\u{1F3AF} Target bumping this up by allocating surplus cash flow to high-yield savings."}

**Next Step:** Automate recurring transfers on payday so your savings are locked before discretionary spending begins.`;
  }
  if (query.includes("save") || query.includes("audit") || query.includes("cut") || query.includes("500")) {
    return `### Actionable Strategy to Save $300 - $600 This Month

Reviewing your spending patterns, here are 3 targeted opportunities:

1. **Dining & Food Subscriptions (Estimated Impact: ~$160/mo):**
   - Meal prepping 2 extra dinners per week cuts restaurant spend significantly.
   - Audit app delivery charges & convenience fees.

2. **Recurring Subscriptions & Memberships (Estimated Impact: ~$65/mo):**
   - Consolidate overlapping streaming or unused memberships.

3. **Smart Grocery Planning (Estimated Impact: ~$120/mo):**
   - Create a structured shopping list to prevent impulse purchases.

By reallocating this surplus into your savings goals, your **Net Monthly Cash Flow** will expand from **$${cashflow.toFixed(0)}** to **$${(cashflow + 345).toFixed(0)}/month**!`;
  }
  if (query.includes("emergency") || query.includes("fund")) {
    const monthlyNeeds = income * (profile?.needsPct || 50) / 100;
    const target3Mo = monthlyNeeds * 3;
    const target6Mo = monthlyNeeds * 6;
    return `### Emergency Fund Readiness Review

For a balanced safety net, financial planners recommend **3 to 6 months of essential living expenses**:

- **Your Estimated Monthly Essentials:** ~$${monthlyNeeds.toFixed(0)}/month
- **3-Month Baseline:** $${target3Mo.toFixed(0)}
- **6-Month Fortress:** $${target6Mo.toFixed(0)}

**Recommendations:**
1. Park this fund in a **High-Yield Savings Account (HYSA)** (currently offering 4.0% - 5.0% APY) so your emergency cash earns passive interest.
2. Maintain immediate liquid access; do not lock emergency funds in volatile equities or illiquid certificates.`;
  }
  return `### Financial Snapshot & Tailored Advice

Here is a quick diagnostic of your financial standing:
- **Financial Health Score:** **${healthScore}/100** (${profile?.healthRating || "Good"})
- **Monthly Inflow:** $${income.toLocaleString()}
- **Monthly Outflow:** $${expenses.toLocaleString()}
- **Net Cash Flow:** **+$${cashflow.toLocaleString()}** (${savingsRate}% Savings Rate)

**Advisor Recommendation:**
Your cash flow is positive with consistent surplus. To optimize further:
1. Make sure all categories with budget overruns are capped.
2. Automate transfers towards your highest-priority savings goal on the 1st of every month.
3. Feel free to ask me to analyze specific categories (like Dining or Transportation) or build an automated debt snowball plan!`;
}
function generateRuleBasedReport(profile, month = "Current Month") {
  const income = profile?.totalIncome || 4800;
  const expenses = profile?.totalExpenses || 3450;
  const surplus = income - expenses;
  const rate = profile?.savingsRate || 28;
  return {
    executiveSummary: `For ${month}, your finances demonstrated solid liquidity with a net cash surplus of $${surplus.toFixed(2)} and an overall savings rate of ${rate.toFixed(1)}%. Core living expenses remained controlled, though discretionary categories show minor variance.`,
    healthGrade: rate >= 25 ? "A" : rate >= 15 ? "B+" : "B",
    scoreJustification: `Strong positive cashflow and ${rate.toFixed(1)}% savings rate offset minor budget overruns in discretionary categories.`,
    strengths: [
      `Maintained a positive cashflow surplus of $${surplus.toFixed(2)}`,
      `Savings rate of ${rate.toFixed(1)}% exceeds the national median benchmark`,
      `Housing and fixed utility commitments remain within safe income ratios`
    ],
    vulnerabilities: [
      "Dining & Entertainment variance slightly above planned monthly allocations",
      "Opportunity to optimize grocery spending with structured shopping lists"
    ],
    actionPlan: [
      {
        step: 1,
        title: "Discretionary Dining Cap",
        action: "Cap takeout orders to twice weekly and prepare dinners batch-style",
        estimatedMonthlySavings: 150,
        category: "Dining & Drinks"
      },
      {
        step: 2,
        title: "Automated Goal Sweep",
        action: "Schedule automatic transfers of $300 to your top savings goal on pay day",
        estimatedMonthlySavings: 300,
        category: "Savings"
      },
      {
        step: 3,
        title: "Subscription Trim",
        action: "Cancel dormant digital subscriptions and negotiate broadband rate",
        estimatedMonthlySavings: 45,
        category: "Utilities & Bills"
      }
    ],
    fiftyThirtyTwentyEvaluation: {
      status: "Healthy & Sustainable",
      notes: "Needs are under 55%, discretionary is right at 25-30%, and savings exceeds 20%."
    },
    projectedAnnualSavings: surplus * 12
  };
}
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`FinAdvisor AI server running at http://0.0.0.0:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map

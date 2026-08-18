import "dotenv/config";
import express from "express";
import cors from "cors";

console.log("Groq API key loaded:", !!process.env.GROQ_API_KEY);

const app = express();
app.use(cors());
app.use(express.json());

app.post("/api/ai-recommendation", async (req, res) => {
  try {
    const { userInput, topMatches, knnSelected } = req.body;
    const travelers = userInput.travelers;
    const days = userInput.days;
    const budget = userInput.budget;

    const prompt = `You are an expert travel advisor. Calculate a realistic trip budget and give travel reasons.

DESTINATION: ${knnSelected.name}, ${knnSelected.country}
TRAVELERS: ${travelers}
DAYS: ${days}
BUDGET TIER: ${budget} (Low = hostels/buses/street food, Medium = 3-star hotels/cabs/restaurants, High = 4-5 star/flights/fine dining)

STEP 1 — Estimate per-unit costs for ${knnSelected.name} at ${budget} budget tier:
- Flight/transport per person (return): ₹?
- Hotel per night (total for ${travelers} people sharing): ₹?
- Food per person per day: ₹?
- Activities per person for full trip: ₹?

STEP 2 — Multiply out:
- Transport total: (cost per person) × ${travelers} = ₹?
- Hotel total: (cost per night) × ${days} nights = ₹?
- Food total: (cost per person per day) × ${travelers} × ${days} = ₹?
- Activities total: (cost per person) × ${travelers} = ₹?

STEP 3 — Sum all to get grand total in INR.

USER PREFERENCES: ${JSON.stringify(userInput)}

Return ONLY valid JSON, no markdown, no backticks, no extra text:
{
  "selectedDestinationName": "${knnSelected.name}",
  "realBudgetINR": <Step 3 grand total as integer>,
  "budgetBreakdown": "Transport ₹X + Hotel ₹Y (${days} nights) + Food ₹Z + Activities ₹W = ₹TOTAL for ${travelers} person(s)",
  "aiSummary": "<2 sentences about why this destination suits the traveler>",
  "reasons": ["<reason 1>", "<reason 2>", "<reason 3>", "<reason 4>", "<reason 5>"]
}`;

    console.log(`Calling Groq API for: ${knnSelected.name}`);

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        // NEW - current free model
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Groq API error:", response.status, err);
      return res.status(500).json({ error: "Groq API failed", detail: err });
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content;

    if (!rawText) {
      console.error("Groq returned empty content");
      return res.status(500).json({ error: "Empty response from Groq" });
    }

    console.log("=== AI RESPONSE ===");
    console.log(rawText);
    console.log("TRAVELERS:", travelers, "| DAYS:", days, "| BUDGET:", budget);
    console.log("===================");

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
if (!jsonMatch) throw new Error("No JSON found in response");
const parsed = JSON.parse(jsonMatch[0]);
    console.log("realBudgetINR:", parsed.realBudgetINR);

    res.json(parsed);

  } catch (error) {
    console.error("AI recommendation error:", error.message);
    res.status(500).json({ error: "AI recommendation failed", detail: error.message });
  }
});

app.listen(3000, () => {
  console.log("RouteX AI server running on http://localhost:3000");
});
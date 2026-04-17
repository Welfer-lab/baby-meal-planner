export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text, recipes = [], ingredients = [] } = req.body;
  if (!text) {
    return res.status(400).json({ error: "Missing text" });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "DEEPSEEK_API_KEY not configured" });
  }

  const today = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(new Date());

  const recipeList = recipes.map((r) => `- id="${r.id}" 名称="${r.name}"`).join("\n");
  const ingredientList = ingredients.map((i) => `- id="${i.id}" 名称="${i.name}" 分类="${i.category}"`).join("\n");

  const systemPrompt = `你是一个婴儿辅食记录助手。用户会用中文描述今天做了什么或想记录什么。
今天日期：${today}

请解析用户意图，只返回 JSON，不要包含任何其他文字或 markdown 代码块。

JSON 格式：
{
  "intent": "log_meal" | "add_recipe" | "add_ingredient",
  "recipeName": "菜名（字符串）",
  "slot": "lunch" | "dinner" | null,
  "date": "${today}（默认今天，用 YYYY-MM-DD 格式）",
  "matchedRecipeId": "匹配到的菜谱 id，没有则为 null",
  "ingredientNames": ["食材名1", "食材名2"],
  "confidence": "high" | "low",
  "rawText": "用户原话"
}

规则：
- 如果用户说"今天/今天午餐/今天晚餐做了 XXX"，intent = "log_meal"
- 如果时间段不明确，slot = null（后续让用户选）
- matchedRecipeId：从下方菜谱列表中找最相似的，名称包含相同食材则匹配；找不到则 null
- 如果用户说"新增食材 XXX"，intent = "add_ingredient"
- confidence = "low" 表示你不确定解析是否正确

可用菜谱：
${recipeList || "（无）"}

可用食材：
${ingredientList || "（无）"}`;

  try {
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        temperature: 0.1,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(502).json({ error: `DeepSeek API error: ${response.status}`, detail: err });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? "";

    let parsed;
    try {
      // 去掉可能的 markdown 代码块包裹
      const cleaned = content.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return res.status(502).json({ error: "DeepSeek returned invalid JSON", raw: content });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Internal error" });
  }
}

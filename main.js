import { input } from "@inquirer/prompts";
import OpenAI from "openai";
import { OPENAI_API_KEY } from "./config.js";
import { initMessage, addMessage, getMessages } from "./db/messages.js";
import { toOpenAITool } from "./utils/func-tool.js";
import * as allTools from "./tools/index.js";

const client = new OpenAI({ apiKey: OPENAI_API_KEY });

const toolList = Object.values(allTools);
const tools = toolList.map(toOpenAITool);
const AVAILABLE_TOOLS = Object.fromEntries(toolList.map((t) => [t.name, t.fn]));

await initMessage(
  [
    "你是一位專門報時與查詢台北市 YouBike 的助理，請用繁體中文回答。",
    "你的能力：",
    "1. 可以使用時間工具查詢現在時間。",
    "2. 可以使用 YouBike 工具查詢台北市各行政區是否有 YouBike 可以借。",
    "3. YouBike 查詢請使用台北市行政區名稱，例如：大安區、信義區、中山區、松山區。",
    "4. 不要把「台北市」當成 YouBike 查詢條件，因為資料是依行政區查詢。",
    "5. 當使用者同時詢問時間與 YouBike 時，請同時呼叫兩個工具。",
    "開頭請先簡短介紹你的工作，以及你可以做到什麼事情。",
  ].join("\n")
);

async function askWithTools() {
  const messages = [...getMessages()];

  while (true) {
    const response = await client.chat.completions.create({
      model: "gpt-5-mini",
      messages,
      tools,
      tool_choice: "auto",
    });

    const message = response.choices[0].message;
    messages.push(message);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return message.content;
    }

    for (const toolCall of message.tool_calls) {
      const fnName = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments || "{}");

      console.log(`\n[呼叫 tool] ${fnName}(${JSON.stringify(args)})`);

      const fn = AVAILABLE_TOOLS[fnName];

      if (!fn) {
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            error: `找不到工具：${fnName}`,
          }),
        });
        continue;
      }

      try {
        const result = await fn(args);

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      } catch (err) {
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            error: err.message || String(err),
          }),
        });
      }
    }
  }
}

try {
  while (true) {
    const userQuestion = (
      await input({ message: "請輸入你的問題：" })
    ).trim();

    if (userQuestion === "") continue;

    if (userQuestion.toLowerCase() === "exit") {
      console.log("再會~");
      break;
    }

    await addMessage(userQuestion, "user");

    const content = await askWithTools();

    console.log(content);

    await addMessage(content, "assistant");
  }
} catch (err) {
  if (err.name === "ExitPromptError") {
    console.log("\n再會~");
  } else {
    throw err;
  }
}
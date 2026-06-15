import { z } from "zod";
import { defineTool } from "../utils/func-tool.js";

const YOUBIKE_API =
  "https://tcgbusfs.blob.core.windows.net/dotapp/youbike/v2/youbike_immediate.json";

async function getYoubikeByDistrict({
  district,
  available_amount = 1,
  limit = 5,
}) {
  const normalizedDistrict = String(district).trim();

  if (normalizedDistrict === "台北市") {
    return {
      error: "請使用台北市行政區名稱查詢，例如：大安區、信義區、中山區。不要使用「台北市」。",
    };
  }

  const res = await fetch(YOUBIKE_API);

  if (!res.ok) {
    return {
      error: `YouBike API error: ${res.status}`,
    };
  }

  const data = await res.json();

  const stations = data
    .filter((s) => s.act === "1")
    .filter((s) => s.sarea === normalizedDistrict)
    .map((s) => ({
      name: s.sna.replace(/^YouBike2\.0_/, ""),
      area: s.sarea,
      address: s.ar,
      available_rent: Number(s.available_rent_bikes),
      available_return: Number(s.available_return_bikes),
      total: Number(s.Quantity),
    }))
    .filter((s) => s.available_rent >= available_amount)
    .sort((a, b) => b.available_rent - a.available_rent)
    .slice(0, limit);

  if (stations.length === 0) {
    return {
      district: normalizedDistrict,
      available_amount,
      message: `目前在 ${normalizedDistrict} 找不到符合條件的 YouBike 站點。`,
      stations: [],
    };
  }

  return {
    district: normalizedDistrict,
    available_amount,
    count: stations.length,
    stations,
  };
}

export const youbikeDistrictTool = defineTool({
  name: "get_youbike_by_district",
  description:
    "使用台北市行政區名稱查詢 YouBike 站點可借車輛數，例如大安區、信義區、中山區。請不要使用台北市作為查詢條件。",
  fn: getYoubikeByDistrict,
  parameters: z.object({
    district: z
      .string()
      .describe("台北市行政區名稱，例如：大安區、信義區、中山區、松山區"),
    available_amount: z
      .number()
      .default(1)
      .describe("至少可租借車輛數，預設 1，代表只查詢目前有車可借的站點"),
    limit: z.number().default(5).describe("回傳筆數上限，預設 5"),
  }),
});
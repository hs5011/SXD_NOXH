import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const generateProjectReport = async (projectData: any) => {
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: `Hãy phân tích tiến độ dự án NOXH sau và đưa ra cảnh báo rủi ro (nếu có): ${JSON.stringify(projectData)}`,
  });
  return response.text;
};

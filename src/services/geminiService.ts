import { GoogleGenAI, Type } from "@google/genai";

let ai: GoogleGenAI | null = null;

export function getGemini(): GoogleGenAI {
  if (!ai) {
    const key = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    ai = new GoogleGenAI({ apiKey: key });
  }
  return ai;
}

export async function parseReceiptImage(base64Image: string, mimeType: string) {
  const gemini = getGemini();
  
  const prompt = `
    Analise este recibo/nota fiscal de posto de gasolina e extraia as seguintes informações:
    - valor: O valor total pago (apenas o número, use ponto para decimais).
    - data: A data da compra no formato YYYY-MM-DD.
    - litros: A quantidade de litros abastecidos (apenas o número, use ponto para decimais). Se não for combustível, retorne null.
    - preco_litro: O preço por litro (apenas o número, use ponto para decimais). Se não for combustível, retorne null.
  `;

  const response = await gemini.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        {
          inlineData: {
            data: base64Image,
            mimeType: mimeType,
          },
        },
        {
          text: prompt,
        },
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          valor: {
            type: Type.NUMBER,
            description: "Valor total do recibo",
          },
          data: {
            type: Type.STRING,
            description: "Data do recibo no formato YYYY-MM-DD",
          },
          litros: {
            type: Type.NUMBER,
            description: "Quantidade de litros abastecidos",
          },
          preco_litro: {
            type: Type.NUMBER,
            description: "Preço por litro",
          },
        },
        required: ["valor", "data"],
      },
    },
  });

  if (!response.text) {
    throw new Error("Não foi possível ler o recibo.");
  }

  return JSON.parse(response.text);
}

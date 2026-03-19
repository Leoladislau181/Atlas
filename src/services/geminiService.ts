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
    Analise este recibo/nota fiscal de posto de gasolina ou estabelecimento comercial e extraia as seguintes informações em formato JSON:
    - valor: O valor total pago (apenas o número, use ponto para decimais). Procure por "VALOR TOTAL", "TOTAL", "PAGO", "TOTAL A PAGAR", etc.
    - data: A data da compra no formato YYYY-MM-DD. Se encontrar no formato DD/MM/YYYY, converta. Se não encontrar, retorne a data de hoje.
    - litros: A quantidade de litros abastecidos (apenas o número, use ponto para decimais). Se não for um recibo de combustível, retorne null.
    - preco_litro: O preço por litro (apenas o número, use ponto para decimais). Se não for um recibo de combustível, retorne null.

    IMPORTANTE: 
    1. Retorne APENAS o JSON, sem blocos de código ou explicações.
    2. Se não tiver certeza de um valor, tente estimar ou retorne null para litros/preco_litro.
    3. O campo 'valor' é obrigatório. Se não encontrar, tente localizar o maior valor numérico no recibo que pareça ser o total.
  `;

  try {
    console.log('Enviando imagem para o Gemini (MimeType:', mimeType, ')...');
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
          required: ["valor"],
        },
      },
    });

    if (!response.text) {
      console.error('Resposta do Gemini vazia ou sem texto:', response);
      throw new Error("A Inteligência Artificial não conseguiu ler os dados desta imagem. Tente uma foto mais nítida.");
    }

    const cleanedText = response.text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
    console.log('Texto bruto recebido do Gemini:', cleanedText);
    
    try {
      return JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('Erro ao parsear JSON do Gemini:', cleanedText);
      throw new Error("Erro ao processar os dados extraídos pela IA.");
    }
  } catch (error: any) {
    console.error('Erro detalhado na API do Gemini:', error);
    
    if (error.message?.includes('API_KEY_INVALID')) {
      throw new Error("Chave de API do Gemini inválida. Verifique as configurações de Segredos.");
    }
    
    if (error.message?.includes('SAFETY')) {
      throw new Error("A imagem foi bloqueada pelos filtros de segurança da IA.");
    }

    throw new Error("Falha na comunicação com a Inteligência Artificial: " + (error.message || "Erro desconhecido"));
  }
}

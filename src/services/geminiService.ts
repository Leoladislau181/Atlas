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
    - tipo_combustivel: O tipo de combustível abastecido. Deve ser estritamente um dos seguintes valores: 'gasolina', 'etanol', 'diesel', 'gnv'. Se não for possível identificar ou não for combustível, retorne null.
  `;

  const response = await gemini.models.generateContent({
    model: "gemini-2.0-flash",
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
          tipo_combustivel: {
            type: Type.STRING,
            description: "Tipo de combustível (gasolina, etanol, diesel, gnv)",
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

// ── PDF Report Import ─────────────────────────────────────────────────────────

export interface ParsedTransaction {
  data: string;
  descricao: string;
  categoria: string;
  tipo: 'receita' | 'despesa';
  valor: number;
  veiculo?: string;
}

/**
 * Sends a PDF to Gemini and extracts all financial transactions found in it.
 * Works with bank statements, reports, invoices, etc.
 */
export async function parsePDFReport(base64PDF: string): Promise<ParsedTransaction[]> {
  const gemini = getGemini();

  const prompt = `
Você é um assistente financeiro especialista em extrair dados de documentos financeiros.
Analise este PDF (pode ser extrato bancário, relatório financeiro, fatura, comprovante, etc.) e extraia TODOS os lançamentos financeiros encontrados.

Para cada lançamento, retorne:
- data: Data no formato YYYY-MM-DD. Se houver apenas mês/ano, use o dia 01.
- descricao: Descrição concisa da transação (máximo 100 caracteres).
- categoria: Categoria mais adequada. Exemplos: "Combustível", "Alimentação", "Manutenção", "Salário", "Aluguel", "Transporte", "Saúde", "Lazer", "Compras", "Serviços", "Outros".
- tipo: "receita" se for entrada de dinheiro, "despesa" se for saída de dinheiro.
- valor: Valor absoluto (positivo) da transação, apenas o número com ponto para decimais.
- veiculo: Nome do veículo relacionado, se mencionado explicitamente. Caso contrário, deixe vazio.

Instruções importantes:
- Extraia TODOS os lançamentos encontrados no documento, sem exceção.
- Se um lançamento tiver valor negativo no PDF, converta e defina tipo como "despesa".
- Se tiver valor positivo, defina como "receita".
- Não invente dados que não estejam no documento.
- Se não houver lançamentos, retorne lista vazia.
- Datas brasileiras (dd/mm/aaaa) devem ser convertidas para YYYY-MM-DD.
`;

  const response = await gemini.models.generateContent({
    model: "gemini-2.0-flash",
    contents: {
      parts: [
        {
          inlineData: {
            data: base64PDF,
            mimeType: "application/pdf",
          },
        },
        { text: prompt },
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          lancamentos: {
            type: Type.ARRAY,
            description: "Lista de lançamentos financeiros extraídos do documento",
            items: {
              type: Type.OBJECT,
              properties: {
                data: { type: Type.STRING, description: "Data no formato YYYY-MM-DD" },
                descricao: { type: Type.STRING, description: "Descrição da transação" },
                categoria: { type: Type.STRING, description: "Categoria do lançamento" },
                tipo: { type: Type.STRING, description: "receita ou despesa" },
                valor: { type: Type.NUMBER, description: "Valor absoluto da transação" },
                veiculo: { type: Type.STRING, description: "Nome do veículo, se aplicável" },
              },
              required: ["data", "descricao", "categoria", "tipo", "valor"],
            },
          },
        },
        required: ["lancamentos"],
      },
    },
  });

  if (!response.text) {
    throw new Error("O Gemini não retornou dados para este PDF.");
  }

  const parsed = JSON.parse(response.text);
  return (parsed.lancamentos || []) as ParsedTransaction[];
}

import type { Category } from "./types";

export interface WindowPromptInput {
  categories: Category[];
  frameTimes: number[]; // ms absolutos, na ordem da folha de contato
  columns: number;
  previousState: string | null;
}

export const SYSTEM_PROMPT = `Você é um anotador de sinais visuais em gravações de reuniões.
Você recebe UMA imagem: uma folha de contato com quadros sequenciais de UM participante
recortado do vídeo (a pessoa que apresenta foi removida antes). Cada quadro tem um número (#0, #1, ...)
e o horário no canto. Leia os quadros da esquerda para a direita, de cima para baixo.

Regras obrigatórias:
1. Descreva apenas o que é visível: posição do rosto, direção do olhar, boca, sobrancelhas, mãos, objetos.
2. NUNCA afirme emoções sentidas, intenções, interesse, opinião, personalidade, saúde ou estado mental.
   Proibido: "entediado", "interessado", "ansioso", "feliz", "confuso", "gostou", "distraído" etc.
   Permitido: "cantos da boca elevados", "olhar voltado para baixo", "sobrancelhas erguidas".
3. NÃO identifique a pessoa, não estime idade, gênero, etnia ou qualquer característica pessoal.
4. Só use códigos da lista de categorias. Se nada se encaixa com segurança, não registre.
5. Comportamentos de duração (ex.: olhar para outra tela) devem aparecer em vários quadros.
   Não registre a partir de um único quadro, salvo categorias marcadas como "pode ser breve".
6. confidence (0 a 1) é a sua certeza de que o SINAL VISUAL está presente, não de que a pessoa sente algo.
   Use valores abaixo de 0,5 quando a imagem estiver escura, borrada, pequena ou o rosto parcialmente coberto.
7. Responda SOMENTE com JSON válido, sem texto antes ou depois.`;

export function buildUserPrompt(input: WindowPromptInput): string {
  const visual = input.categories.filter((c) => c.active && c.detection === "visual");
  const catalog = visual
    .map((c) => {
      const brief = c.min_frames <= 1 ? " (pode ser breve)" : ` (mín. ${c.min_frames} quadros)`;
      return `- ${c.code}: ${c.name}${brief}. Critério: ${c.criteria || c.description}`;
    })
    .join("\n");

  const frames = input.frameTimes
    .map((t, i) => `#${i}=${(t / 1000).toFixed(1)}s`)
    .join(", ");

  return `Categorias permitidas:
${catalog}

Folha de contato: ${input.frameTimes.length} quadros em ${input.columns} colunas. Horários: ${frames}.
${input.previousState ? `Estado visual ao fim da janela anterior: "${input.previousState}".` : "Primeira janela deste participante."}

Responda neste formato:
{
  "face_visible": true,
  "observations": [
    { "code": "<código>", "from_frame": 0, "to_frame": 3, "confidence": 0.0, "description": "<sinal visível, até 20 palavras>" }
  ],
  "end_state": "<estado visual no último quadro, até 15 palavras, sem emoções>"
}`;
}

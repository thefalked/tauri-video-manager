//export const ollamaModel = "gemma3:1b";
export const ollamaModel = "deepseek-r1:14b";
export const prompt = `[INST] Traduza as legendas do inglês para português brasileiro.

Regras:
- Retorne APENAS um objeto JSON
- Traduza TODAS as entradas
- Mantenha formatação (itálicos, etc)
- Mantenha número de linhas
- Mantenha índices originais
- Traduza APENAS o texto em "lines"
- NÃO crie novas legendas
- NÃO adicione campos extras

Formato de entrada:
{
  "entries": [
    {
      "index": number,
      "lines": string[]
    }
  ]
}

Formato de saída:
{
  "translations": [
    {
      "index": number,
      "lines": string[]
    }
  ]
}

Traduza: [/INST]
`;
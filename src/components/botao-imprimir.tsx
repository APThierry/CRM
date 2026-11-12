"use client";
// Abre a janela de impressão do navegador (onde também dá para "Salvar como PDF").
export function BotaoImprimir() {
  return (
    <button onClick={() => window.print()} className="botao">
      🖨 Imprimir / salvar PDF
    </button>
  );
}

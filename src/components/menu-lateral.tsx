"use client";
// Menu da esquerda. É um Client Component porque usa `usePathname` para
// destacar a página atual e guarda se o menu do celular está aberto.
//
// No computador (md: 768px ou mais) é uma coluna fixa à esquerda. No celular
// vira uma barra no topo com o botão "Menu", que abre a lista por cima.
//
// Nesta versão do Next.js, `usePathname` só fica disponível quando a requisição
// chega. Por isso a parte que usa o hook fica dentro de <Suspense>: enquanto ela
// não carrega, mostramos o mesmo menu sem destaque.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";

const itens = [
  { href: "/", rotulo: "Painel", icone: "▦" },
  { href: "/clientes", rotulo: "Clientes", icone: "◉" },
  { href: "/funil", rotulo: "Funil de vendas", icone: "▤" },
  { href: "/turmas", rotulo: "Turmas", icone: "◷" },
  { href: "/certificados", rotulo: "Certificados", icone: "✎" },
  { href: "/cursos", rotulo: "Cursos", icone: "✚" },
  { href: "/whatsapp", rotulo: "WhatsApp", icone: "✆" },
] as const;

// `usuario` chega pronto do servidor (Server Component dentro de Suspense).
export function MenuLateral({ usuario }: { usuario?: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);
  return (
    <aside className="sticky top-0 z-30 flex shrink-0 flex-col bg-marca-900 text-marca-50 print:hidden! md:h-screen md:w-56">
      <div className="flex items-center justify-between px-5 py-3 md:py-5">
        <div>
          <div className="text-lg font-bold tracking-tight">Brigada MG</div>
          <div className="text-xs text-marca-100/70">CRM</div>
        </div>
        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          aria-expanded={aberto}
          aria-controls="menu-principal"
          className="rounded-md px-3 py-2 text-sm hover:bg-white/10 md:hidden"
        >
          {aberto ? "✕ Fechar" : "☰ Menu"}
        </button>
      </div>
      {/* Fecha o menu do celular ao tocar em qualquer link dele. */}
      <div
        id="menu-principal"
        className={`${aberto ? "flex" : "hidden"} max-h-[calc(100vh-4rem)] flex-col overflow-y-auto pb-2 md:flex md:max-h-none md:flex-1 md:pb-0`}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) setAberto(false);
        }}
      >
        <nav className="flex flex-col gap-1 px-3">
          <Suspense fallback={<Itens caminho={null} />}>
            <ItensComDestaque />
          </Suspense>
        </nav>
        {usuario && <div className="mt-4 border-t border-white/10 px-5 py-4 md:mt-auto">{usuario}</div>}
      </div>
    </aside>
  );
}

function ItensComDestaque() {
  return <Itens caminho={usePathname()} />;
}

function Itens({ caminho }: { caminho: string | null }) {
  const ativo = (href: string) => caminho !== null && (href === "/" ? caminho === "/" : caminho.startsWith(href));
  return itens.map((item) => (
    <Link
      key={item.href}
      href={item.href}
      className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
        ativo(item.href) ? "bg-white/15 font-medium text-white" : "text-marca-100/80 hover:bg-white/10"
      }`}
    >
      <span aria-hidden className="w-4 text-center">{item.icone}</span>
      {item.rotulo}
    </Link>
  ));
}

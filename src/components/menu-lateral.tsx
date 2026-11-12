"use client";
// Menu da esquerda. É um Client Component porque usa `usePathname` para
// destacar a página atual.
//
// Nesta versão do Next.js, `usePathname` só fica disponível quando a requisição
// chega. Por isso a parte que usa o hook fica dentro de <Suspense>: enquanto ela
// não carrega, mostramos o mesmo menu sem destaque.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

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
  return (
    <aside className="sticky top-0 hidden h-screen print:hidden! w-56 shrink-0 flex-col bg-marca-900 text-marca-50 md:flex">
      <div className="px-5 py-5">
        <div className="text-lg font-bold tracking-tight">Brigada MG</div>
        <div className="text-xs text-marca-100/70">CRM</div>
      </div>
      <nav className="flex flex-col gap-1 px-3">
        <Suspense fallback={<Itens caminho={null} />}>
          <ItensComDestaque />
        </Suspense>
      </nav>
      {usuario && <div className="mt-auto border-t border-white/10 px-5 py-4">{usuario}</div>}
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

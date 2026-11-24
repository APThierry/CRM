// Layout das páginas internas (exigem login): menu (lateral no computador,
// barra no topo no celular) + conteúdo.
import { Suspense } from "react";
import { AvisoTeste } from "@/components/aviso-teste";
import { MenuLateral } from "@/components/menu-lateral";
import { ContadorAtendimento, NomeEmpresa, UsuarioNoMenu } from "@/components/usuario-no-menu";
import { nomeDoApp } from "@/lib/url";

export default function LayoutCrm({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <MenuLateral
        app={nomeDoApp()}
        empresa={
          <Suspense fallback={null}>
            <NomeEmpresa />
          </Suspense>
        }
        contador={
          <Suspense fallback={null}>
            <ContadorAtendimento />
          </Suspense>
        }
        usuario={
          <Suspense fallback={<div className="h-14" />}>
            <UsuarioNoMenu />
          </Suspense>
        }
      />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 print:p-0">
        <Suspense fallback={null}>
          <AvisoTeste />
        </Suspense>
        {children}
      </main>
    </div>
  );
}

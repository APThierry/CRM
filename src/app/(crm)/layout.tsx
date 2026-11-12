// Layout das páginas internas (exigem login): menu lateral + conteúdo.
import { Suspense } from "react";
import { MenuLateral } from "@/components/menu-lateral";
import { UsuarioNoMenu } from "@/components/usuario-no-menu";

export default function LayoutCrm({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen">
      <MenuLateral
        usuario={
          <Suspense fallback={<div className="h-14" />}>
            <UsuarioNoMenu />
          </Suspense>
        }
      />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 print:p-0">{children}</main>
    </div>
  );
}
